set -euo pipefail
APP_DIR="/var/www/saasengine"
mkdir -p "$APP_DIR"
cd "$APP_DIR"
if [ ! -d "repo" ]; then
    git clone git@github.com:Allinfever/saasengine.git repo
fi
cd repo
git fetch --all --prune
git checkout main 2>/dev/null || git checkout -b main origin/main
git pull origin main
git rev-parse --short HEAD
