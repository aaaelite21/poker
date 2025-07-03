const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const ADMIN_PASSWORD = '1234';
let adminToken = null;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '../src')));

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
  games[code] = { config, players: [], locked: false, history: [], startTime: null };
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
  const seat = game.players.length + 1;
  const player = { id: uuidv4(), name, seat, eliminated: false, rebuys: 0 };
  game.players.push(player);
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
  player.eliminated = true;
  if (rebuy) player.rebuys += 1;
  saveGames();
  io.to(code).emit('update', game);
  res.json(player);
});

app.post('/api/start/:code', requireAdmin, (req, res) => {
  const { code } = req.params;
  const game = games[code];
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.startTime) return res.status(400).json({ error: 'Clock already started' });
  game.startTime = Date.now();
  saveGames();
  io.to(code).emit('start', { startTime: game.startTime });
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
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
