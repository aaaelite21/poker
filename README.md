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

### Admin Login

Creating or managing games requires logging in with the admin password `1234`.
Use the login form on the main page to obtain a token before creating games.

### Game Management

Admins can delete finished games using the Delete buttons shown next to each game
in the lobby. A shared tournament clock is also controlled by the admin from the
game view using the **Start Clock** button. All connected players will see the
same timer once started. Players can mark themselves busted from the game view
and the admin can do it for them if they forget. Once registration is complete
the admin can randomize seats using **Assign Seats** and those seat numbers
appear on everyone’s screen.

When viewing a game as the admin, use the **Share** button at the bottom of the
page to reveal a QR code for that specific game. By default the server detects
its local IP address and uses that in the QR code. If detection fails or you
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
