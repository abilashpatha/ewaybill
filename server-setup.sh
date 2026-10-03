#!/bin/bash
# ============================================================
#  server-setup.sh  –  Run ONCE on a fresh Hostinger VPS
#  Usage: bash server-setup.sh
# ============================================================
set -e

echo "========================================"
echo "  Ewaybill VPS – One-Time Server Setup"
echo "========================================"

# ── 1. System update ─────────────────────────────────────────
echo "[1/7] Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git unzip build-essential

# ── 2. Node.js 20 LTS via NodeSource ─────────────────────────
echo "[2/7] Installing Node.js 20 LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v && npm -v

# ── 3. PM2 (process manager) ─────────────────────────────────
echo "[3/7] Installing PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root
systemctl enable pm2-root

# ── 4. Nginx ─────────────────────────────────────────────────
echo "[4/7] Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx

# ── 5. Create app directory ───────────────────────────────────
echo "[5/7] Creating app directory at /var/www/ewaybill ..."
mkdir -p /var/www/ewaybill/backend
mkdir -p /var/www/ewaybill/frontend/dist

# ── 6. Nginx config ───────────────────────────────────────────
echo "[6/7] Configuring Nginx..."
cat > /etc/nginx/sites-available/ewaybill << 'NGINX'
server {
    listen 80;
    server_name _;          # Replace _ with your domain or IP if needed

    client_max_body_size 10m;
    proxy_read_timeout    120s;
    proxy_connect_timeout  60s;
    proxy_send_timeout    120s;

    location / {
        proxy_pass         http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

# Enable site, remove default
ln -sf /etc/nginx/sites-available/ewaybill /etc/nginx/sites-enabled/ewaybill
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
echo "Nginx configured and reloaded."

# ── 7. Puppeteer dependencies ─────────────────────────────────
echo "[7/7] Installing Puppeteer/Chrome system dependencies..."
apt-get install -y \
  ca-certificates fonts-liberation libappindicator3-1 libasound2 \
  libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 \
  libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 \
  libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
  libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 \
  libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
  libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release \
  wget xdg-utils

echo ""
echo "========================================"
echo "  Setup complete!"
echo "  Next: run deploy.sh from your local machine."
echo "========================================"
