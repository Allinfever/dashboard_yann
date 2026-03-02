#!/bin/bash
set -euo pipefail

APP_DIR="/var/www/saasengine/repo"
LOG_FILE="/var/log/saasengine/deploy.log"

exec > >(tee -a "$LOG_FILE") 2>&1

echo "[$(date)] Starting deployment..."

cd "$APP_DIR"

# Git pull
echo "Pulling latest code..."
sudo -u deploy -H git fetch --all --prune
sudo -u deploy -H git reset --hard origin/main

# Clean Install
echo "Cleaning and installing dependencies..."
sudo -u deploy -H rm -rf node_modules
sudo -u deploy -H npm install

# Build
echo "Building project..."
sudo -u deploy -H npx next build

# Data Setup
echo "Preparing external data directory..."
DATA_DIR="/var/lib/saasengine/data"
sudo mkdir -p "$DATA_DIR"
sudo chown -R deploy:deploy "$DATA_DIR"
sudo chmod 750 "$DATA_DIR"

# PM2 Reload
echo "Reloading PM2..."
export NODE_ENV=production
export PORT=3002
export SAASENGINE_DATA_DIR="$DATA_DIR"
sudo -u deploy -H pm2 reload saasengine-web --update-env || sudo -u deploy -H pm2 start npm --name saasengine-web -- start --update-env

echo "[$(date)] Deployment finished successfully."
