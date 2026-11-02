// ============================================================
// BACKUP MODULE - Archives quotidiennes du répertoire de données
// ============================================================
// Toutes les données (dossiers, sujets, documentation, caches Mantis, fichiers)
// vivent dans DATA_ROOT. Une archive .tar.gz est créée chaque nuit dans
// BACKUP_DIR (hors de DATA_ROOT), et une archive à jour peut être téléchargée.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BACKUP_TIME = process.env.BACKUP_TIME || '03:00';
const BACKUP_KEEP = Number(process.env.BACKUP_KEEP) || 14;
const ARCHIVE_RE = /^dashboard-yann-(\d{4}-\d{2}-\d{2})\.tar\.gz$/;

const parisDay = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const parisTime = () => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

module.exports = function registerBackup(app, { DATA_ROOT, BACKUP_DIR }) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    // tar of DATA_ROOT, to a file or to stdout ('-'); temp files are left out
    const tarArgs = (output) => ['-czf', output, '--exclude=*.tmp', '-C', path.dirname(DATA_ROOT), path.basename(DATA_ROOT)];

    const listArchives = () => fs.readdirSync(BACKUP_DIR)
        .filter(f => ARCHIVE_RE.test(f))
        .sort()
        .map(name => ({ name, size: fs.statSync(path.join(BACKUP_DIR, name)).size, day: name.match(ARCHIVE_RE)[1] }));

    const createArchive = () => new Promise((resolve, reject) => {
        const name = `dashboard-yann-${parisDay()}.tar.gz`;
        const partial = path.join(BACKUP_DIR, `${name}.partial`);
        const tar = spawn('tar', tarArgs(partial));
        let stderr = '';
        tar.stderr.on('data', chunk => { stderr += chunk; });
        tar.on('error', reject);
        tar.on('close', code => {
            // GNU tar exits with 1 when a file changed while being read: the archive is still usable
            if (code > 1) {
                fs.rmSync(partial, { force: true });
                return reject(new Error(`tar a échoué (${code}) : ${stderr.trim()}`));
            }
            fs.renameSync(partial, path.join(BACKUP_DIR, name));
            listArchives().slice(0, -BACKUP_KEEP).forEach(a => fs.rmSync(path.join(BACKUP_DIR, a.name)));
            resolve(name);
        });
    });

    app.get('/api/backup/status', (req, res) => {
        const archives = listArchives();
        res.json({ last: archives[archives.length - 1] || null, count: archives.length, keep: BACKUP_KEEP, time: BACKUP_TIME });
    });

    // Fresh archive of the current state, streamed to the browser
    app.get('/api/backup/download', (req, res) => {
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="dashboard-yann-${parisDay()}.tar.gz"`);
        const tar = spawn('tar', tarArgs('-'));
        tar.stdout.pipe(res);
        tar.on('error', e => res.destroy(e));
        res.on('close', () => tar.kill());
    });

    // --- Daily archive (Paris time, BACKUP_TIME="HH:MM" or "off") ---
    if (!/^\d{2}:\d{2}$/.test(BACKUP_TIME)) return;
    let running = false;
    const checkDailyBackup = () => {
        const today = parisDay();
        if (running || parisTime() < BACKUP_TIME || listArchives().some(a => a.day === today)) return;
        running = true;
        createArchive()
            .then(name => console.log(`[Backup] ${name} créé`))
            .catch(e => console.error('[Backup]', e.message))
            .finally(() => { running = false; });
    };
    setInterval(checkDailyBackup, 10 * 60 * 1000);
    checkDailyBackup();
    console.log(`[Backup] Archive quotidienne à ${BACKUP_TIME} dans ${BACKUP_DIR} (${BACKUP_KEEP} conservées)`);
};
