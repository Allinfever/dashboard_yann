#!/bin/bash
set -euo pipefail

# Configuration
PROJECT_ROOT="/var/www/dashboard-yann"
NGINX_ROOT="$PROJECT_ROOT/live"
RELEASES_DIR="$PROJECT_ROOT/releases"
LOG_FILE="/var/log/dashboard-yann/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

if [ $# -lt 1 ]; then
    echo "Usage: dashboard-rollback <release_dir_name>"
    echo "Available releases:"
    ls -1 "$RELEASES_DIR"
    exit 1
fi

RELEASE_ID=$1
SOURCE_DIR="$RELEASES_DIR/$RELEASE_ID"

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Release directory $SOURCE_DIR does not exist."
    exit 1
fi

log "=== Starting Rollback to $RELEASE_ID ==="

# 1. Restore files
log "Restoring files from $SOURCE_DIR to $NGINX_ROOT..."
rsync -a --delete "$SOURCE_DIR/" "$NGINX_ROOT/"

# 2. Restart backend from restored files
log "Restarting backend..."
cd "$NGINX_ROOT/server"
if pm2 describe dashboard-api > /dev/null 2>&1; then
    pm2 delete dashboard-api
fi
pm2 start index.js --name dashboard-api --cwd "$NGINX_ROOT/server"

# 3. Reload Nginx
log "Reloading Nginx..."
nginx -t && systemctl reload nginx

# 4. Check results
echo "=== Rollback results ==="
curl -sS -o /dev/null -w "FRONT=%{http_code}\n" http://localhost/
curl -sS -o /dev/null -w "API=%{http_code}\n" http://localhost/api/mantis/health || curl -sS -o /dev/null -w "API=%{http_code}\n" http://localhost/api/

log "=== Rollback successful! ==="
