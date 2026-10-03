#!/bin/bash
# ============================================================
#  deploy.sh  –  Run from YOUR LOCAL MACHINE to deploy the app
#
#  Prerequisites (on your local machine):
#    - Node.js + npm installed
#    - rsync and ssh installed  (on Windows: use Git Bash or WSL)
#
#  Usage:
#    bash deploy.sh <VPS_IP> <SSH_USER>
#  Example:
#    bash deploy.sh 157.245.12.34 root
# ============================================================
set -e

# ── Config ────────────────────────────────────────────────────
VPS_IP="${1:-YOUR_VPS_IP}"
SSH_USER="${2:-root}"
REMOTE="$SSH_USER@$VPS_IP"
REMOTE_DIR="/var/www/ewaybill"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$VPS_IP" = "YOUR_VPS_IP" ]; then
  echo "Usage: bash deploy.sh <VPS_IP> [ssh_user]"
  echo "Example: bash deploy.sh 157.245.12.34 root"
  exit 1
fi

echo "========================================"
echo "  Deploying Ewaybill → $REMOTE"
echo "========================================"

# ── Step 1: Build React frontend ──────────────────────────────
echo ""
echo "[1/4] Building React frontend..."
cd "$SCRIPT_DIR/frontend"
npm install --legacy-peer-deps
npm run build
echo "Frontend build complete → frontend/dist"

# ── Step 2: Upload backend ────────────────────────────────────
echo ""
echo "[2/4] Uploading backend files to VPS..."
cd "$SCRIPT_DIR"
tar --exclude='backend/node_modules' --exclude='backend/.env' \
    -czf /tmp/ewaybill-backend.tar.gz backend/
scp /tmp/ewaybill-backend.tar.gz "$REMOTE:/tmp/ewaybill-backend.tar.gz"
ssh "$REMOTE" "tar -xzf /tmp/ewaybill-backend.tar.gz -C $REMOTE_DIR && rm /tmp/ewaybill-backend.tar.gz"
rm /tmp/ewaybill-backend.tar.gz

# ── Step 3: Upload frontend dist ─────────────────────────────
echo ""
echo "[3/4] Uploading frontend build to VPS..."
tar -czf /tmp/ewaybill-dist.tar.gz -C "$SCRIPT_DIR/frontend" dist/
scp /tmp/ewaybill-dist.tar.gz "$REMOTE:/tmp/ewaybill-dist.tar.gz"
ssh "$REMOTE" "mkdir -p $REMOTE_DIR/frontend && tar -xzf /tmp/ewaybill-dist.tar.gz -C $REMOTE_DIR/frontend && rm /tmp/ewaybill-dist.tar.gz"
rm /tmp/ewaybill-dist.tar.gz

# ── Step 4: Remote – install deps & restart ──────────────────
echo ""
echo "[4/4] Installing backend dependencies & restarting PM2..."
ssh "$REMOTE" bash << EOF
  set -e
  export NVM_DIR="\$HOME/.nvm"
  [ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"
  cd $REMOTE_DIR/backend

  # Install production deps
  npm install --omit=dev

  # Create .env if it doesn't already exist on server
  if [ ! -f .env ]; then
    echo "⚠️  No .env found on server at $REMOTE_DIR/backend/.env"
    echo "   Please create it manually (see .env.example) and run:"
    echo "   pm2 restart ewaybill"
    exit 0
  fi

  # Start or reload PM2 process
  if pm2 list | grep -q 'ewaybill'; then
    pm2 reload ecosystem.config.cjs --update-env
    echo "PM2 process reloaded."
  else
    pm2 start ecosystem.config.cjs
    echo "PM2 process started."
  fi

  pm2 save
  echo "Done."
EOF

echo ""
echo "========================================"
echo "  ✅  Deploy complete!"
echo "  App is live at: http://$VPS_IP"
echo ""
echo "  If this is a fresh server, don't forget to:"
echo "  1. Create /var/www/ewaybill/backend/.env on the VPS"
echo "     (copy from backend/.env.example and fill in real values)"
echo "  2. Then run: pm2 restart ewaybill"
echo "========================================"
