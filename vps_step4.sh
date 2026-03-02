set -euo pipefail
cd /var/www/saasengine/repo

echo "Installing dependencies..."
if [ -f package-lock.json ]; then 
    npm ci || npm install
else 
    npm install
fi

echo "Building Next.js..."
npm run build

echo "Starting/Reloading PM2..."
export NODE_ENV=production
export PORT=3002

if pm2 describe saasengine-web >/dev/null 2>&1; then
    pm2 reload saasengine-web --update-env
else
    # Check if 'start' script exists
    if node -e "p=require('./package.json');process.exit(p.scripts&&p.scripts.start?0:1)"; then
        pm2 start npm --name saasengine-web -- start --update-env
    else
        pm2 start "npx next start -p 3002" --name saasengine-web --update-env
    fi
fi
pm2 save
