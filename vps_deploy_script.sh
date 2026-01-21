#!/bin/bash
set -e

PROJECT_DIR="/var/www/dashboard-yann"
LOG_FILE="/var/log/dashboard-yann/deploy.log"

mkdir -p /var/log/dashboard-yann
touch $LOG_FILE

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

log "Starting deployment..."

cd $PROJECT_DIR

log "Fetching latest code..."
git fetch origin
git reset --hard origin/master

log "Installing server dependencies..."
cd server
npm install --production

log "Restarting API..."
pm2 restart dashboard-api || pm2 start index.js --name dashboard-api

log "Deployment successful!"
