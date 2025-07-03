const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

function detectIp() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return HOST;
}

const ADMIN_PASSWORD = '1234';
let adminToken = null;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://${detectIp()}:${PORT}`;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../src')));
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.PUBLIC_URL=${JSON.stringify(PUBLIC_URL)};`);
});

const DATA_FILE = path.join(__dirname, 'games.json');
let games = {};
try {
  games = JSON.parse(fs.readFileSync(DATA_FILE));
} catch (err) {
  games = {};
}

function saveGames() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(games, null, 2));
}

function generateCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (games[code]);
  return code;
}

function recordEvent(game, msg) {
  game.history.push({ time: Date.now(), msg });
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization;
  if (!token || token !== adminToken) {
    return res.status(403).json({ error: 'Admin authentication required' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid password' });
  adminToken = uuidv4();
  res.json({ token: adminToken });
});

app.post('/api/create', requireAdmin, (req, res) => {
  const code = generateCode();
  const config = req.body;
  games[code] = { config, players: [], locked: false, history: [], startTime: null, pausedAt: null };
  saveGames();
  res.json({ code });
});

app.post('/api/join/:code', (req, res) => {
  if (req.headers.authorization && req.headers.authorization === adminToken) {
    return res.status(403).json({ error: 'Admin account cannot join games' });
  }
  const { code } = req.params;
  const { name } = req.body;
  const game = games[code];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.locked) return res.status(403).json({ error: 'Game locked' });
  const player = { id: uuidv4(), name, seat: null, busted: false, rebuys: 0 };
  game.players.push(player);
  recordEvent(game, `${name} joined`);
  saveGames();
  io.to(code).emit('update', game);
  res.json(player);
});

app.post('/api/lock/:code', requireAdmin, (req, res) => {
  const { code } = req.params;
  const game = games[code];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  game.locked = true;
  saveGames();
  io.to(code).emit('update', game);
  res.json({ locked: true });
});

app.post('/api/eliminate/:code/:playerId', requireAdmin, (req, res) => {
  const { code, playerId } = req.params;
  const { rebuy } = req.body;
  const game = games[code];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const player = game.players.find(p => p.id === playerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  player.busted = true;
  if (rebuy) player.rebuys += 1;
  recordEvent(game, `${player.name} busted${rebuy ? ' and rebuys' : ''}`);
  saveGames();
  io.to(code).emit('update', game);
  res.json(player);
});

app.post('/api/bust/:code/:playerId', (req, res) => {
  const { code, playerId } = req.params;
  const { busted } = req.body;
  const token = req.headers.authorization;
  const pid = req.headers['player-id'];
  const game = games[code];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const player = game.players.find(p => p.id === playerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  if (token === adminToken || pid === playerId) {
    player.busted = !!busted;
    recordEvent(game, `${player.name} ${player.busted ? 'busted' : 'returned'}`);
    saveGames();
    io.to(code).emit('update', game);
    return res.json(player);
  }
  res.status(403).json({ error: 'Not allowed' });
});

app.post('/api/assign-seats/:code', requireAdmin, (req, res) => {
  const { code } = req.params;
  const game = games[code];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const players = game.players.slice();
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [players[i], players[j]] = [players[j], players[i]];
  }
  players.forEach((p, idx) => {
    p.seat = idx + 1;
  });
  game.players = players;
  recordEvent(game, 'Seats assigned');
  players.forEach(p => recordEvent(game, `Seat ${p.seat}: ${p.name}`));
  saveGames();
  io.to(code).emit('update', game);
  res.json({ assigned: true });
});

app.post('/api/start/:code', requireAdmin, (req, res) => {
  const { code } = req.params;
  const game = games[code];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (!game.startTime) {
    game.startTime = Date.now();
    recordEvent(game, 'Clock started');
  } else if (game.pausedAt) {
    const paused = Date.now() - game.pausedAt;
    game.startTime += paused;
    game.pausedAt = null;
    recordEvent(game, 'Clock resumed');
  } else {
    return res.status(400).json({ error: 'Clock already started' });
  }
  saveGames();
  io.to(code).emit('start', { startTime: game.startTime });
  io.to(code).emit('update', game);
  res.json({ startTime: game.startTime });
});

app.post('/api/pause/:code', requireAdmin, (req, res) => {
  const { code } = req.params;
  const game = games[code];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (!game.startTime || game.pausedAt) {
    return res.status(400).json({ error: 'Clock not running' });
  }
  game.pausedAt = Date.now();
  recordEvent(game, 'Clock paused');
  saveGames();
  io.to(code).emit('pause', { pausedAt: game.pausedAt });
  io.to(code).emit('update', game);
  res.json({ pausedAt: game.pausedAt });
});

app.post('/api/restart-level/:code', requireAdmin, (req, res) => {
  const { code } = req.params;
  const game = games[code];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (!game.startTime) return res.status(400).json({ error: 'Clock not started' });
  const base = game.pausedAt || Date.now();
  const elapsed = Math.floor((base - game.startTime) / 1000);
  const level = Math.floor(elapsed / game.config.duration);
  game.startTime = base - level * game.config.duration * 1000;
  recordEvent(game, 'Level restarted');
  saveGames();
  io.to(code).emit('start', { startTime: game.startTime });
  io.to(code).emit('update', game);
  res.json({ startTime: game.startTime });
});

app.delete('/api/game/:code', requireAdmin, (req, res) => {
  const { code } = req.params;
  if (!games[code]) return res.status(404).json({ error: 'Game not found' });
  delete games[code];
  saveGames();
  res.json({ deleted: true });
});

app.get('/api/game/:code', (req, res) => {
  const { code } = req.params;
  const game = games[code];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

app.get('/api/games', (req, res) => {
  const available = Object.entries(games)
    .filter(([, game]) => !game.locked)
    .map(([code, game]) => ({
      code,
      players: game.players.length,
    }));
  res.json(available);
});

io.on('connection', socket => {
  socket.on('joinRoom', code => {
    socket.join(code);
    const game = games[code];
    if (game) {
      socket.emit('update', game);
      if (game.startTime) socket.emit('start', { startTime: game.startTime });
      if (game.pausedAt) socket.emit('pause', { pausedAt: game.pausedAt });
    }
    const interval = setInterval(() => {
      const g = games[code];
      if (g) socket.emit('update', g);
    }, 10000);
    socket.on('disconnect', () => clearInterval(interval));
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
