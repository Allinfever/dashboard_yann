#!/bin/bash
set -euo pipefail

# Configuration
PROJECT_ROOT="/var/www/dashboard-yann"
REPO_DIR="$PROJECT_ROOT/repo"
NGINX_ROOT="$PROJECT_ROOT/live"
RELEASES_DIR="$PROJECT_ROOT/releases"
LOG_FILE="/var/log/dashboard-yann/deploy.log"
MAX_RELEASES=5

# Ensure log directory
mkdir -p "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error_exit() {
    log "ERROR: $1"
    exit 1
}

log "=== Starting Deployment ==="

# 1. Update Repo
log "Updating repository..."
cd "$REPO_DIR" || error_exit "Could not enter repo dir"
git fetch origin
git reset --hard origin/main

GIT_SHA=$(git rev-parse --short HEAD)
log "New Version: $GIT_SHA"

# 2. Snapshot current live state
log "Snapshotting current live state..."
if [ -d "$NGINX_ROOT" ] && [ "$(ls -A "$NGINX_ROOT")" ]; then
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    RELEASE_ID="${TIMESTAMP}_${GIT_SHA}"
    mkdir -p "$RELEASES_DIR/$RELEASE_ID"
    # snapshot (rsync without delete)
    rsync -a "$NGINX_ROOT/" "$RELEASES_DIR/$RELEASE_ID/"
    log "Snapshot created: $RELEASE_ID"
else
    log "NGINX_ROOT empty or missing, skipping snapshot."
    mkdir -p "$NGINX_ROOT"
fi

# 3. Prune old releases
log "Pruning old releases..."
ls -dt "$RELEASES_DIR"/* | tail -n +$((MAX_RELEASES + 1)) | xargs -r rm -rf
log "Pruning complete."

# 4. Deploy to live
log "Updating live files..."
rsync -a --delete --exclude '.git' "$REPO_DIR/" "$NGINX_ROOT/"

# 5. Build and Backend Deployment
log "Installing frontend dependencies..."
cd "$NGINX_ROOT"
npm install

log "Building frontend..."
npm run build

log "Deploying backend..."
cd "$NGINX_ROOT/server" || error_exit "Could not enter server dir"

# Preserve environment if exists in repo or live
if [ -f "$REPO_DIR/.env.local" ]; then
    cp "$REPO_DIR/.env.local" "$NGINX_ROOT/server/.env.local"
fi

npm install --production

# PM2 Restart
# Check if dashboard-api is running, if so, restart. Else start.
if pm2 describe dashboard-api > /dev/null 2>&1; then
    # Update script path to live location just in case
    pm2 delete dashboard-api
fi
pm2 start index.js --name dashboard-api --cwd "$NGINX_ROOT/server"

# 6. Healthchecks
log "Running healthchecks..."
# Wait a bit for server to start
sleep 2

# Check local ports and proxy
if curl -fsS --max-time 8 http://127.0.0.1:3001/api/mantis/health >/dev/null; then
    log "Healthcheck API (Port 3001) OK"
else
    error_exit "Healthcheck API (Port 3001) FAILED"
fi

# Use health endpoint if exists
HEALTH_URL="http://127.0.0.1/api/mantis/health"
if curl -fsS --max-time 8 "$HEALTH_URL" >/dev/null; then
    log "Healthcheck API (Proxy $HEALTH_URL) OK"
else
    # Fallback to general api
    if curl -fsS --max-time 8 http://127.0.0.1/api/ >/dev/null; then
        log "Healthcheck API (Proxy /api/) OK"
    else
         error_exit "Healthcheck API (Proxy) FAILED"
    fi
fi

if curl -fsS --max-time 8 http://127.0.0.1/ >/dev/null; then
    log "Healthcheck Front (Port 80) OK"
else
    error_exit "Healthcheck Front (Port 80) FAILED"
fi

log "=== Deployment successful! ==="
