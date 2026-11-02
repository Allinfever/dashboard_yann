const fs = require('fs');
const os = require('os');
const path = require('path');

// --- Persistent storage ---
// Kept outside the deployed folder: each deployment replaces server/ with the Git content
const DATA_ROOT = process.env.DASHBOARD_DATA_DIR || path.join(os.homedir(), '.dashboard-yann');
const DATA_DIR = path.join(DATA_ROOT, 'data');
const UPLOADS_ROOT = path.join(DATA_ROOT, 'uploads');

// Seed missing files from the ones shipped in the repository (never overwrites)
[[path.join(__dirname, '..', 'data'), DATA_DIR], [path.join(__dirname, '..', 'uploads'), UPLOADS_ROOT]].forEach(([from, to]) => {
    fs.mkdirSync(to, { recursive: true });
    if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false });
});
console.log(`[Storage] Data directory: ${DATA_ROOT}`);

module.exports = { DATA_ROOT, DATA_DIR, UPLOADS_ROOT };
