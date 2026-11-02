const express = require('express');
const cors = require('cors');
const path = require('path');
// Loaded first: the modules below read their configuration from process.env
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const { DATA_ROOT, DATA_DIR, UPLOADS_ROOT } = require('./lib/storage');
const { MANTIS_SOURCES, MantisClient, readCache, fetchFullIssueDetails } = require('./lib/mantis');
const mantisRoutes = require('./routes/mantis');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const { startRefresh } = mantisRoutes;
app.use(mantisRoutes.router);
app.use(require('./routes/openTopics'));
app.use(require('./routes/documentation'));

// --- Dossiers (sources + synthèse IA) ---
require('./routes/dossiers')(app, { DATA_DIR, UPLOADS_ROOT, readCache, mantisSources: MANTIS_SOURCES, MantisClient, fetchFullIssueDetails });

// --- Sauvegardes (archive quotidienne + téléchargement) ---
require('./routes/backup')(app, { DATA_ROOT, BACKUP_DIR: process.env.DASHBOARD_BACKUP_DIR || `${DATA_ROOT}-backups` });

// --- Daily automatic sync (Paris time, MANTIS_AUTO_SYNC_TIME="HH:MM" or "off") ---
const AUTO_SYNC_TIME = process.env.MANTIS_AUTO_SYNC_TIME || '07:00';
const parisClock = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
let lastAutoSyncDay = null;

const checkAutoSync = () => {
    const parts = Object.fromEntries(parisClock.formatToParts(new Date()).map(p => [p.type, p.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}`;
    if (time < AUTO_SYNC_TIME || lastAutoSyncDay === day) return;
    // Only within the hour following the scheduled time (no catch-up after a late restart)
    const [h, m] = AUTO_SYNC_TIME.split(':').map(Number);
    const [ch, cm] = time.split(':').map(Number);
    if ((ch * 60 + cm) - (h * 60 + m) > 60) return;

    lastAutoSyncDay = day;
    Object.keys(MANTIS_SOURCES).forEach(source => {
        const result = startRefresh(source);
        console.log(`[AutoSync] ${day} ${time} ${source}: ${result.error || 'started ' + result.jobId}`);
    });
};

if (/^\d{2}:\d{2}$/.test(AUTO_SYNC_TIME)) {
    setInterval(checkAutoSync, 60 * 1000);
    console.log(`[AutoSync] Daily Mantis sync at ${AUTO_SYNC_TIME} (Europe/Paris)`);
}

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
