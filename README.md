# poker
Repo for all my poker related exploits. Tournament tracker, trainer app, ect.

## Tournament server

```
cd server
npm install
npm run dev
```

The dev command uses `cross-env` to bind to `0.0.0.0` so the site is reachable from other devices on your network, even on Windows.

Open `http://<raspberry-pi>:3000` in your browser to create or join games.

When creating a game you’ll supply a Blind Levels JSON array. Each element can
be `{"bigBlind":50,"littleBlind":25}` for a normal level or `{"break":10}` to
represent a 10 minute break.

### Admin Login

Creating or managing games requires logging in with the admin password `1234`.
Use the login form on the main page to obtain a token before creating games.
Non‑admins only see the join form and list of games; the Create and Delete
buttons appear once you log in. Use the Logout button to return to the regular
view on shared devices.

### Game Management

Admins can delete finished games using the Delete buttons shown next to each game
in the lobby. A shared tournament clock is controlled by the admin from the game
view. Use **Start Clock** to begin or resume the timer, **Pause Clock** to pause
it and **Restart Level** to reset the current level. The interface also shows the
current blind level and the next one so players know what’s coming. Players can
mark themselves busted from the game view and the admin can do it for them if
they forget. Once registration is complete the admin can randomize seats using
**Assign Seats** and those seat numbers appear on everyone’s screen.
If someone joins accidentally the admin can remove them using the **Kick** button next to their name.

Games may be locked to stop new entries. Admins can lock or unlock a game from
either the lobby or the game page. Players visiting a game page who aren’t
already seated will see a join form as long as the game isn’t locked.

Every seat assignment or bust-out is recorded in a history log shown below the
player list so you can review the elimination order at any time.

Admins can also keep everyone up to date on chip counts. Each player row
includes an input where the admin can adjust that player’s current stack and the
changes are broadcast to all connected clients.

Blind levels aren’t set in stone. At the bottom of the game page admins can edit
the JSON array of levels and save the change at any time. To add a break on the
fly use the **Add 5m Break**, **Add 10m Break**, or **Add 15m Break** buttons
which insert a `{ "break": <minutes> }` entry after the current level.
These break objects can also be included in the levels JSON when creating a
game.

Use the **Share** button at the bottom of the game page to reveal a QR code for
that specific game. Both admins and players can display it to quickly share the
link. By default the server detects its local IP address and uses that in the
QR code. If detection fails or you
want to override the address, set the `PUBLIC_URL` environment variable when
starting the server, e.g. `PUBLIC_URL=http://192.168.1.10:3000 npm run dev`.

### Exposing on port 80

To use the site with just the Pi's host name (no `:3000` suffix), run the
server behind Nginx:

```bash
sudo apt install nginx
sudo tee /etc/nginx/sites-available/poker <<'EOF'
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/poker /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

Now browse to `http://<raspberry-pi>/` without specifying a port.
