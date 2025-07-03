# poker
Repo for all my poker related exploits. Tournament tracker, trainer app, ect.

## Tournament server

```
cd server
npm install
node server.js
```

Open `http://<raspberry-pi>:3000` in your browser to create or join games.

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
