#!/bin/bash
set -euo pipefail

APP_DIR="/var/www/letelos-landing/repo"
LOG_FILE="/var/log/letelos-landing/deploy.log"

mkdir -p "$(dirname "$LOG_FILE")"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[$(date)] Starting landing deployment..."

if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
    chown deploy:deploy "$APP_DIR"
fi

cd "$APP_DIR"

# Git pull
sudo -u deploy -H git fetch --all --prune
sudo -u deploy -H git reset --hard origin/main

echo "[$(date)] Landing deployment finished successfully."
