// ============================================================
// DOSSIERS MODULE - Centralisation d'un sujet + synthèse IA (OpenAI)
// ============================================================
// Un dossier regroupe des sources (emails, échanges Teams, Mantis, documents,
// pages web, notes) ; chaque source est analysée à l'ajout, puis une fiche de
// synthèse est reconstruite à partir de l'ensemble des sources.

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { v4: uuidv4 } = require('uuid');

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const MODEL_FAST = process.env.OPENAI_MODEL_FAST || 'gpt-5.4-mini';

// Context budgets (characters) sent to the model
const SOURCE_TEXT_LIMIT = 40000;   // per-source analysis
const CONTEXT_TEXT_PER_SOURCE = 12000; // per source in fiche / chat context
const CONTEXT_TOTAL_LIMIT = 400000;

// Key saved from the UI (persistent settings file) takes precedence over OPENAI_API_KEY
let savedApiKey = null;
const currentApiKey = () => savedApiKey || process.env.OPENAI_API_KEY || null;

let openaiClient = null;
const getOpenAI = () => {
    const apiKey = currentApiKey();
    if (!apiKey) {
        throw new Error('Clé OpenAI absente : renseigne-la via le bouton « Clé OpenAI » de l\'onglet Dossiers');
    }
    if (!openaiClient || openaiClient.apiKey !== apiKey) {
        const OpenAI = require('openai');
        openaiClient = new OpenAI({ apiKey });
    }
    return openaiClient;
};

// --- JSON schemas (Structured Outputs) ---
const ANALYSIS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['titre', 'type', 'date', 'auteurs', 'resume', 'points_cles', 'decisions', 'actions', 'questions', 'mantis_ids', 'transcription'],
    properties: {
        titre: { type: 'string', description: 'Titre court et explicite (objet du mail, sujet de l\'échange...)' },
        type: { type: 'string', enum: ['email', 'teams', 'mantis', 'document', 'tableur', 'web', 'image', 'note'] },
        date: { type: 'string', description: 'Date de l\'échange au format AAAA-MM-JJ si identifiable, sinon chaîne vide' },
        auteurs: { type: 'array', items: { type: 'string' } },
        resume: { type: 'string', description: '2 à 4 phrases' },
        points_cles: { type: 'array', items: { type: 'string' } },
        decisions: { type: 'array', items: { type: 'string' } },
        actions: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['qui', 'quoi', 'echeance'],
                properties: { qui: { type: 'string' }, quoi: { type: 'string' }, echeance: { type: 'string' } }
            }
        },
        questions: { type: 'array', items: { type: 'string' }, description: 'Questions ouvertes / points en suspens' },
        mantis_ids: { type: 'array', items: { type: 'string' }, description: 'Numéros de tickets Mantis cités (chiffres uniquement)' },
        transcription: { type: 'string', description: 'Pour une image uniquement : transcription fidèle du texte visible. Sinon chaîne vide' }
    }
};

const withSources = (props, required) => ({
    type: 'object',
    additionalProperties: false,
    required: [...required, 'sources'],
    properties: { ...props, sources: { type: 'array', items: { type: 'string' }, description: 'Références des sources, ex. "S3"' } }
});

const FICHE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['resume', 'etat', 'etat_libelle', 'decisions', 'actions', 'questions', 'risques', 'acteurs', 'prochaines_etapes'],
    properties: {
        resume: { type: 'string', description: 'Synthèse du sujet en 3 à 6 phrases' },
        etat: { type: 'string', enum: ['ok', 'attention', 'bloque', 'termine'] },
        etat_libelle: { type: 'string', description: 'Une phrase sur l\'état actuel' },
        decisions: { type: 'array', items: withSources({ texte: { type: 'string' }, date: { type: 'string' } }, ['texte', 'date']) },
        actions: {
            type: 'array',
            items: withSources({
                qui: { type: 'string' }, quoi: { type: 'string' }, echeance: { type: 'string' },
                statut: { type: 'string', enum: ['a_faire', 'fait'] }
            }, ['qui', 'quoi', 'echeance', 'statut'])
        },
        questions: { type: 'array', items: withSources({ texte: { type: 'string' } }, ['texte']) },
        risques: { type: 'array', items: withSources({ texte: { type: 'string' } }, ['texte']) },
        acteurs: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, required: ['nom', 'role'], properties: { nom: { type: 'string' }, role: { type: 'string' } } }
        },
        prochaines_etapes: { type: 'array', items: { type: 'string' } }
    }
};

const ETAT_LABELS = { ok: 'En bonne voie', attention: 'À surveiller', bloque: 'Bloqué', termine: 'Terminé' };

const SYSTEM_CONTEXT ='Tu assistes un consultant qui pilote un projet d\'intégration (recette / démarrage) avec des tickets Mantis. Réponds toujours en français, de façon factuelle et concise. N\'invente rien : si une information manque, dis-le.';

const structuredCall = async ({ model, instructions, input, schema, name }) => {
    const response = await getOpenAI().responses.create({
        model,
        instructions,
        input,
        text: { format: { type: 'json_schema', name, schema, strict: true } }
    });
    return JSON.parse(response.output_text);
};

module.exports = function registerDossiers(app, { DATA_DIR, UPLOADS_ROOT, readCache, mantisSources, MantisClient, fetchFullIssueDetails }) {
    const DOSSIERS_DIR = path.join(DATA_DIR, 'dossiers');
    const FILES_DIR = path.join(UPLOADS_ROOT, 'dossiers');
    [DOSSIERS_DIR, FILES_DIR].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

    // --- Settings (kept in the data directory, so they survive restarts and deployments) ---
    const SETTINGS_FILE = path.join(DATA_DIR, 'dossiers_settings.json');
    const readSettings = () => {
        try {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        } catch {
            return {};
        }
    };
    const writeSettings = (settings) => {
        fs.writeFileSync(SETTINGS_FILE + '.tmp', JSON.stringify(settings, null, 2), { mode: 0o600 });
        fs.renameSync(SETTINGS_FILE + '.tmp', SETTINGS_FILE);
    };
    savedApiKey = readSettings().openaiApiKey || null;

    // --- Storage: one JSON file per dossier ---
    const dossierFile = (id) => path.join(DOSSIERS_DIR, `${path.basename(id)}.json`);

    const readDossier = (id) => {
        try {
            return JSON.parse(fs.readFileSync(dossierFile(id), 'utf-8'));
        } catch {
            return null;
        }
    };

    const writeDossier = (dossier) => {
        const file = dossierFile(dossier.id);
        fs.writeFileSync(file + '.tmp', JSON.stringify(dossier, null, 2));
        fs.renameSync(file + '.tmp', file);
    };

    // Synchronous read-modify-write: safe against concurrent background jobs
    const mutate = (id, fn) => {
        const dossier = readDossier(id);
        if (!dossier) return null;
        fn(dossier);
        dossier.updatedAt = new Date().toISOString();
        writeDossier(dossier);
        return dossier;
    };

    const findSource = (dossier, sourceId) => dossier.sources.find(s => s.id === sourceId);

    // --- Mantis lookup (local caches, then live details when credentials exist) ---
    const MANTIS_URL_RE = /view\.php\?id=(\d+)/i;
    const normalizeMantisId = (id) => String(id).replace(/\D/g, '').replace(/^0+/, '');

    const findMantisRow = (id) => {
        const target = normalizeMantisId(id);
        for (const source of Object.keys(mantisSources)) {
            const cache = readCache(source);
            const row = cache?.data?.find(r => normalizeMantisId(r['Identifiant'] || r.id || '') === target);
            if (row) return row;
        }
        return null;
    };

    const mantisSnapshot = (id) => {
        const row = findMantisRow(id);
        if (!row) return null;
        return {
            resume: row['Résumé'] || '',
            etat: row['État'] || row['Etat'] || '',
            priorite: row.priorite_p || '',
            affecte: row['Affecté à'] || '',
            domaine: row['Domaine (Toray)'] || '',
            majLe: row['Mis à jour'] || ''
        };
    };

    const fetchMantisText = async (id) => {
        const snap = mantisSnapshot(id);
        const lines = [`Ticket Mantis #${id}`];
        if (snap) {
            lines.push(`Résumé : ${snap.resume}`, `État : ${snap.etat}`, `Priorité : ${snap.priorite}`, `Affecté à : ${snap.affecte}`, `Domaine : ${snap.domaine}`, `Mis à jour : ${snap.majLe}`);
        }
        if (process.env.MANTIS_BASE_URL && process.env.MANTIS_USERNAME && process.env.MANTIS_PASSWORD) {
            try {
                const mantis = new MantisClient(`dossier-mantis-${id}`);
                await mantis.login();
                const details = await fetchFullIssueDetails(mantis, id);
                if (details) {
                    if (details.description) lines.push('', 'Description :', details.description);
                    if (details.steps_to_reproduce) lines.push('', 'Étapes :', details.steps_to_reproduce);
                    if (details.additional_info) lines.push('', 'Informations supplémentaires :', details.additional_info);
                    if (details.notes.length) {
                        lines.push('', 'Notes :');
                        details.notes.forEach(n => lines.push(`- ${n.author || ''} ${n.date || ''} : ${n.text}`));
                    }
                }
            } catch (e) {
                console.error(`[Dossiers] Mantis #${id} details failed:`, e.message);
            }
        }
        if (!snap && lines.length === 1) throw new Error(`Mantis #${id} introuvable (ni dans le cache ni en ligne)`);
        return lines.join('\n');
    };

    // --- Text extraction ---
    const decodeName = (name) => Buffer.from(name, 'latin1').toString('utf8');

    // The data directory lives under ~/.dashboard-yann: send() ignores dotfile paths unless told otherwise
    const SEND_OPTIONS = { dotfiles: 'allow' };

    const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    const MIN_IMAGE_BYTES = 4096; // smaller images are signature logos and spacers
    const AI_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

    // Email attachments and inline images, without the tiny decoration images
    const keepAttachment = (a) => a.buffer?.length && !(a.mimetype.startsWith('image/') && a.buffer.length < MIN_IMAGE_BYTES);

    const extractFromFile = async (filePath, originalName, mimetype) => {
        const ext = path.extname(originalName).toLowerCase();
        const buffer = fs.readFileSync(filePath);

        if (ext === '.eml' || mimetype === 'message/rfc822') {
            const { simpleParser } = require('mailparser');
            const mail = await simpleParser(buffer);
            return {
                type: 'email',
                title: mail.subject || originalName,
                date: mail.date ? mail.date.toISOString() : null,
                text: [
                    `De : ${mail.from?.text || ''}`,
                    `À : ${mail.to?.text || ''}`,
                    mail.cc ? `Cc : ${mail.cc.text}` : null,
                    `Date : ${mail.date ? mail.date.toISOString() : ''}`,
                    `Objet : ${mail.subject || ''}`,
                    '',
                    mail.text || (mail.html ? cheerio.load(mail.html).text() : '')
                ].filter(l => l !== null).join('\n'),
                attachments: (mail.attachments || []).map((a, i) => ({
                    name: a.filename || `piece-jointe-${i + 1}`,
                    mimetype: a.contentType || 'application/octet-stream',
                    buffer: a.content
                })).filter(keepAttachment)
            };
        }
        if (ext === '.msg') {
            const MsgReader = require('@kenjiuno/msgreader').default;
            const reader = new MsgReader(buffer);
            const msg = reader.getFileData();
            const attachments = (msg.attachments || []).flatMap((att, i) => {
                try {
                    const data = reader.getAttachment(att);
                    const name = data.fileName || att.fileName || `piece-jointe-${i + 1}${att.extension || ''}`;
                    const mimetype = att.attachMimeTag || MIME_BY_EXT[path.extname(name).toLowerCase()] || 'application/octet-stream';
                    return [{ name, mimetype, buffer: Buffer.from(data.content) }];
                } catch {
                    return []; // embedded messages and unreadable parts
                }
            }).filter(keepAttachment);
            const to = (msg.recipients || []).map(r => r.name || r.email).join(', ');
            const date = msg.messageDeliveryTime || msg.clientSubmitTime || msg.creationTime;
            return {
                type: 'email',
                title: msg.subject || originalName,
                date: date ? new Date(date).toISOString() : null,
                text: [`De : ${msg.senderName || ''} <${msg.senderEmail || ''}>`, `À : ${to}`, `Date : ${date || ''}`, `Objet : ${msg.subject || ''}`, '', msg.body || ''].join('\n'),
                attachments
            };
        }
        if (ext === '.docx') {
            const mammoth = require('mammoth');
            const { value } = await mammoth.extractRawText({ buffer });
            return { type: 'document', title: originalName, text: value };
        }
        if (ext === '.pdf') {
            const { PDFParse } = require('pdf-parse');
            const parser = new PDFParse({ data: buffer });
            try {
                const result = await parser.getText();
                return { type: 'document', title: originalName, text: result.text };
            } finally {
                await parser.destroy();
            }
        }
        if (ext === '.xlsx' || ext === '.xlsm') {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer);
            const parts = [];
            workbook.eachSheet(sheet => {
                parts.push(`## Feuille « ${sheet.name} »`);
                sheet.eachRow({ includeEmpty: false }, (row, n) => {
                    if (n > 2000) return;
                    const cells = row.values.slice(1).map(v => {
                        if (v == null) return '';
                        if (typeof v === 'object') return v.text ?? v.result ?? (v.richText ? v.richText.map(t => t.text).join('') : (v instanceof Date ? v.toISOString().slice(0, 10) : ''));
                        return String(v);
                    });
                    parts.push(cells.join(' | '));
                });
            });
            return { type: 'tableur', title: originalName, text: parts.join('\n') };
        }
        if (mimetype.startsWith('image/')) {
            return { type: 'image', title: originalName, text: '', image: `data:${mimetype};base64,${buffer.toString('base64')}` };
        }
        if (mimetype.startsWith('text/') || ['.txt', '.md', '.csv', '.json', '.log', '.html', '.htm'].includes(ext)) {
            const raw = buffer.toString('utf-8');
            return { type: 'document', title: originalName, text: ext.startsWith('.htm') ? cheerio.load(raw).text() : raw };
        }
        throw new Error(`Format non pris en charge : ${ext || mimetype}`);
    };

    const fetchWebPage = async (url) => {
        const res = await axios.get(url, { timeout: 20000, maxContentLength: 10 * 1024 * 1024, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' } });
        const $ = cheerio.load(res.data);
        $('script, style, nav, footer, header, noscript, svg').remove();
        const title = $('title').first().text().trim() || url;
        const main = $('article').text() || $('main').text() || $('body').text();
        return { title, text: `URL : ${url}\n\n${main.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()}` };
    };

    // --- AI: per-source analysis ---
    const analyzeSource = async (source, images) => {
        const content = [{
            type: 'input_text',
            text: `Type présumé : ${source.type}\nNom : ${source.title}\n\nContenu :\n${(source.text || '').slice(0, SOURCE_TEXT_LIMIT)}`
        }];
        images.forEach(url => content.push({ type: 'input_image', image_url: url }));
        return structuredCall({
            model: MODEL_FAST,
            name: 'analyse_source',
            schema: ANALYSIS_SCHEMA,
            instructions: `${SYSTEM_CONTEXT}\nAnalyse la source fournie (email, conversation Teams copiée, ticket Mantis, document, page web, capture d'écran ou note) et extrais-en les informations structurées. Pour un échange Teams collé, ignore le bruit (réactions, "a rejoint", horodatages répétés). Pour un fil d'emails, considère l'ensemble du fil.`,
            input: [{ role: 'user', content }]
        });
    };

    // --- AI context built from all sources ---
    const sourceRefs = (dossier) => {
        const ordered = [...dossier.sources].sort((a, b) => (a.date || a.createdAt).localeCompare(b.date || b.createdAt));
        return ordered.map((s, i) => ({ ref: `S${i + 1}`, source: s }));
    };

    const buildContext = (dossier) => {
        let budget = CONTEXT_TOTAL_LIMIT;
        const blocks = sourceRefs(dossier)
            .filter(({ source }) => source.status === 'ready')
            .map(({ ref, source }) => {
                const a = source.analysis || {};
                const live = source.mantisId ? mantisSnapshot(source.mantisId) : null;
                const text = (source.text || '').slice(0, Math.max(0, Math.min(CONTEXT_TEXT_PER_SOURCE, budget)));
                budget -= text.length;
                return [
                    `### [${ref}] ${a.titre || source.title} (${a.type || source.type}, ${a.date || (source.date || source.createdAt).slice(0, 10)})`,
                    a.auteurs?.length ? `Auteurs : ${a.auteurs.join(', ')}` : '',
                    live ? `État Mantis actuel : ${live.etat} (${live.priorite}), affecté à ${live.affecte}` : '',
                    a.resume ? `Résumé : ${a.resume}` : '',
                    source.note ? `Note de l'utilisateur : ${source.note}` : '',
                    'Contenu :',
                    text
                ].filter(Boolean).join('\n');
            });
        return blocks.join('\n\n');
    };

    // --- AI: fiche (rebuilt from every source, one run at a time per dossier) ---
    const ficheRuns = new Map(); // id -> { running, dirty }

    const rebuildFiche = async (id) => {
        const dossier = readDossier(id);
        if (!dossier) return;
        const ready = dossier.sources.filter(s => s.status === 'ready');
        if (ready.length === 0) {
            mutate(id, d => { d.fiche = null; d.ficheStatus = 'idle'; d.ficheError = null; });
            return;
        }
        const previous = dossier.fiche ? JSON.stringify(dossier.fiche) : 'aucune';
        const fiche = await structuredCall({
            model: MODEL,
            name: 'fiche_dossier',
            schema: FICHE_SCHEMA,
            instructions: `${SYSTEM_CONTEXT}\nTu tiens à jour la fiche de synthèse d'un dossier à partir de toutes ses sources (classées par date, référencées [S1], [S2]...). Les informations les plus récentes priment. Cite les références des sources qui justifient chaque élément. Conserve le statut "fait" des actions déjà cochées dans la fiche précédente si elles existent toujours. Aujourd'hui : ${new Date().toISOString().slice(0, 10)}.`,
            input: `Dossier : ${dossier.title}\n${dossier.notes ? `Notes de l'utilisateur : ${dossier.notes}\n` : ''}\nFiche précédente : ${previous}\n\nSources :\n\n${buildContext(dossier)}`
        });
        // Keep the user's manual ticks
        const done = new Set((dossier.fiche?.actions || []).filter(a => a.statut === 'fait').map(a => a.quoi.trim().toLowerCase()));
        fiche.actions.forEach(a => { if (done.has(a.quoi.trim().toLowerCase())) a.statut = 'fait'; });
        mutate(id, d => {
            d.fiche = { ...fiche, refs: Object.fromEntries(sourceRefs(d).map(({ ref, source }) => [ref, source.id])), generatedAt: new Date().toISOString() };
            d.ficheStatus = 'idle';
            d.ficheError = null;
        });
    };

    const scheduleFiche = (id) => {
        const run = ficheRuns.get(id) || { running: false, dirty: false };
        ficheRuns.set(id, run);
        mutate(id, d => { d.ficheStatus = 'updating'; });
        if (run.running) {
            run.dirty = true;
            return;
        }
        run.running = true;
        (async () => {
            do {
                run.dirty = false;
                // Wait for the sources still being analyzed: they are part of the same batch
                while (readDossier(id)?.sources.some(s => s.status === 'processing')) {
                    await new Promise(r => setTimeout(r, 1000));
                }
                try {
                    await rebuildFiche(id);
                } catch (e) {
                    console.error(`[Dossiers] Fiche ${id} failed:`, e.message);
                    mutate(id, d => { d.ficheStatus = 'error'; d.ficheError = e.message; });
                }
            } while (run.dirty);
            run.running = false;
        })();
    };

    // --- Source processing pipeline (background) ---
    const processSource = async (dossierId, sourceId) => {
        const dossier = readDossier(dossierId);
        const source = dossier && findSource(dossier, sourceId);
        if (!source) return;
        try {
            const extracted = { type: source.type, title: source.title, text: source.text, date: source.date, image: null, attachments: [] };
            if (source.kind === 'file') {
                Object.assign(extracted, await extractFromFile(path.join(FILES_DIR, dossierId, source.file.stored), source.file.name, source.file.mimetype));
            } else if (source.kind === 'url') {
                Object.assign(extracted, { type: 'web' }, await fetchWebPage(source.url));
            } else if (source.kind === 'mantis') {
                extracted.text = await fetchMantisText(source.mantisId);
                const snap = mantisSnapshot(source.mantisId);
                if (snap?.resume) extracted.title = `Mantis #${source.mantisId} — ${snap.resume}`;
            }
            const dir = path.join(FILES_DIR, path.basename(dossierId));
            (source.attachments || []).forEach(a => fs.rmSync(path.join(dir, a.stored), { force: true }));
            const attachments = extracted.attachments.map((a, i) => {
                const stored = `${Date.now()}-${i}-${uuidv4().slice(0, 8)}${path.extname(a.name).toLowerCase()}`;
                fs.writeFileSync(path.join(dir, stored), a.buffer);
                return { name: a.name, stored, mimetype: a.mimetype, size: a.buffer.length };
            });
            mutate(dossierId, d => {
                const s = findSource(d, sourceId);
                if (s) Object.assign(s, { type: extracted.type, title: extracted.title, text: extracted.text, date: extracted.date || s.date, attachments });
            });

            // The largest images of an email (screenshots) are shown to the model too
            const images = extracted.image ? [extracted.image] : extracted.attachments
                .filter(a => AI_IMAGE_TYPES.includes(a.mimetype))
                .sort((a, b) => b.buffer.length - a.buffer.length)
                .slice(0, 4)
                .map(a => `data:${a.mimetype};base64,${a.buffer.toString('base64')}`);
            const analysis = await analyzeSource({ ...source, ...extracted }, images);
            mutate(dossierId, d => {
                const s = findSource(d, sourceId);
                if (!s) return;
                s.analysis = analysis;
                if (extracted.type === 'image' && analysis.transcription) s.text = analysis.transcription;
                if (s.kind === 'text') s.type = analysis.type;
                // Pasted screenshots arrive as "image.png": the analysis gives them a meaningful title
                if ((s.kind === 'text' || s.kind === 'url' || extracted.type === 'image') && analysis.titre) s.title = analysis.titre;
                if (!s.date && /^\d{4}-\d{2}-\d{2}$/.test(analysis.date)) s.date = `${analysis.date}T12:00:00.000Z`;
                s.status = 'ready';
                s.error = null;
            });

            // Tickets cited in the source are attached automatically
            const cited = [...new Set((analysis.mantis_ids || []).map(normalizeMantisId).filter(Boolean))];
            const current = readDossier(dossierId);
            const known = new Set(current.sources.filter(s => s.mantisId).map(s => s.mantisId));
            const toAdd = cited.filter(mid => !known.has(mid) && findMantisRow(mid));
            if (toAdd.length) addSources(dossierId, toAdd.map(mid => ({ kind: 'mantis', mantisId: mid, title: `Mantis #${mid}`, type: 'mantis', autoFrom: sourceId })));
        } catch (e) {
            console.error(`[Dossiers] Source ${sourceId} failed:`, e.message);
            mutate(dossierId, d => {
                const s = findSource(d, sourceId);
                if (s) Object.assign(s, { status: 'error', error: e.message });
            });
        }
    };

    const addSources = (dossierId, specs) => {
        const now = new Date().toISOString();
        const created = specs.map(spec => ({
            id: uuidv4(),
            status: 'processing',
            error: null,
            createdAt: now,
            date: null,
            text: '',
            analysis: null,
            note: '',
            ...spec
        }));
        mutate(dossierId, d => { d.sources.push(...created); });
        created.forEach(s => processSource(dossierId, s.id));
        scheduleFiche(dossierId);
        return created;
    };

    // Free text: Mantis references, URLs or content to analyze
    const specsFromText = (raw) => {
        const text = raw.trim();
        const tokens = text.split(/[\s,;]+/).filter(Boolean);
        const mantisIds = tokens.map(t => {
            const fromUrl = t.match(MANTIS_URL_RE);
            if (fromUrl) return fromUrl[1];
            const m = t.match(/^#?(\d{3,7})$/);
            return m ? m[1] : null;
        });
        if (mantisIds.every(Boolean)) {
            return [...new Set(mantisIds.map(normalizeMantisId))].map(id => ({ kind: 'mantis', mantisId: id, title: `Mantis #${id}`, type: 'mantis' }));
        }
        if (tokens.every(t => /^https?:\/\/\S+$/i.test(t))) {
            return tokens.map(url => ({ kind: 'url', url, title: url, type: 'web' }));
        }
        return [{ kind: 'text', title: text.split('\n')[0].slice(0, 80), type: 'note', text }];
    };

    // --- Public view of a dossier (live Mantis state, no heavy text) ---
    const toView = (dossier, full = false) => ({
        ...dossier,
        sources: dossier.sources.map(s => ({
            ...s,
            text: full ? s.text : undefined,
            textLength: (s.text || '').length,
            mantis: s.mantisId ? mantisSnapshot(s.mantisId) : undefined
        })),
        mantisBaseUrl: process.env.MANTIS_BASE_URL || ''
    });

    const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, fieldSize: 10 * 1024 * 1024 } });

    // --- Routes ---
    app.get('/api/dossiers/ai-status', (req, res) => {
        const key = currentApiKey();
        res.json({
            configured: Boolean(key),
            origin: savedApiKey ? 'saved' : (key ? 'env' : null),
            keyHint: key ? `…${key.slice(-4)}` : null,
            model: MODEL,
            modelFast: MODEL_FAST
        });
    });

    // The key is checked against OpenAI before being saved
    app.put('/api/dossiers/ai-key', async (req, res) => {
        const apiKey = (req.body?.apiKey || '').trim();
        if (!apiKey) return res.status(400).json({ error: 'Clé vide' });
        try {
            const OpenAI = require('openai');
            await new OpenAI({ apiKey }).models.list();
        } catch (e) {
            return res.status(400).json({ error: `Clé refusée par OpenAI : ${e.message}` });
        }
        writeSettings({ ...readSettings(), openaiApiKey: apiKey });
        savedApiKey = apiKey;
        res.json({ ok: true, keyHint: `…${apiKey.slice(-4)}` });
    });

    app.delete('/api/dossiers/ai-key', (req, res) => {
        const settings = readSettings();
        delete settings.openaiApiKey;
        writeSettings(settings);
        savedApiKey = null;
        res.json({ ok: true });
    });

    app.get('/api/dossiers', (req, res) => {
        const list = fs.readdirSync(DOSSIERS_DIR)
            .filter(f => f.endsWith('.json'))
            .map(f => readDossier(f.replace(/\.json$/, '')))
            .filter(Boolean)
            .map(d => ({
                id: d.id,
                title: d.title,
                status: d.status,
                createdAt: d.createdAt,
                updatedAt: d.updatedAt,
                sourceCount: d.sources.length,
                lastSourceDate: d.sources.reduce((max, s) => ((s.date || s.createdAt) > max ? (s.date || s.createdAt) : max), ''),
                etat: d.fiche?.etat || null,
                etatLibelle: d.fiche?.etat_libelle || '',
                resume: d.fiche?.resume || '',
                openActions: (d.fiche?.actions || []).filter(a => a.statut !== 'fait').length
            }))
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        res.json(list);
    });

    app.post('/api/dossiers', (req, res) => {
        const title = (req.body?.title || '').trim();
        if (!title) return res.status(400).json({ error: 'Le titre est obligatoire' });
        const now = new Date().toISOString();
        const dossier = { id: uuidv4(), title, status: 'actif', notes: '', createdAt: now, updatedAt: now, sources: [], fiche: null, ficheStatus: 'idle', ficheError: null, chat: [] };
        writeDossier(dossier);
        res.status(201).json(toView(dossier));
    });

    app.get('/api/dossiers/:id', (req, res) => {
        const dossier = readDossier(req.params.id);
        if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
        res.json(toView(dossier));
    });

    app.put('/api/dossiers/:id', (req, res) => {
        const allowed = ['title', 'status', 'notes'];
        const dossier = mutate(req.params.id, d => {
            allowed.forEach(k => { if (req.body[k] !== undefined) d[k] = req.body[k]; });
            if (Array.isArray(req.body.actionsDone) && d.fiche) {
                d.fiche.actions.forEach((a, i) => { a.statut = req.body.actionsDone.includes(i) ? 'fait' : 'a_faire'; });
            }
        });
        if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
        res.json(toView(dossier));
    });

    app.delete('/api/dossiers/:id', (req, res) => {
        if (!readDossier(req.params.id)) return res.status(404).json({ error: 'Dossier introuvable' });
        fs.rmSync(dossierFile(req.params.id), { force: true });
        fs.rmSync(path.join(FILES_DIR, path.basename(req.params.id)), { recursive: true, force: true });
        res.json({ ok: true });
    });

    app.post('/api/dossiers/:id/sources', uploadMem.array('files', 30), (req, res) => {
        const id = req.params.id;
        if (!readDossier(id)) return res.status(404).json({ error: 'Dossier introuvable' });

        const specs = [];
        const dir = path.join(FILES_DIR, path.basename(id));
        fs.mkdirSync(dir, { recursive: true });
        (req.files || []).forEach(f => {
            const name = decodeName(f.originalname);
            const stored = `${Date.now()}-${uuidv4().slice(0, 8)}${path.extname(name).toLowerCase()}`;
            fs.writeFileSync(path.join(dir, stored), f.buffer);
            specs.push({ kind: 'file', title: name, type: 'document', file: { name, stored, mimetype: f.mimetype, size: f.size } });
        });
        if (req.body?.text && req.body.text.trim()) specs.push(...specsFromText(req.body.text));
        if (specs.length === 0) return res.status(400).json({ error: 'Rien à ajouter' });

        const created = addSources(id, specs);
        res.status(201).json({ created: created.map(s => s.id) });
    });

    app.get('/api/dossiers/:id/sources/:sourceId', (req, res) => {
        const dossier = readDossier(req.params.id);
        const source = dossier && findSource(dossier, req.params.sourceId);
        if (!source) return res.status(404).json({ error: 'Source introuvable' });
        res.json({ ...source, mantis: source.mantisId ? mantisSnapshot(source.mantisId) : undefined });
    });

    app.put('/api/dossiers/:id/sources/:sourceId', (req, res) => {
        let found = false;
        const dossier = mutate(req.params.id, d => {
            const s = findSource(d, req.params.sourceId);
            if (!s) return;
            found = true;
            if (req.body.note !== undefined) s.note = req.body.note;
            if (req.body.date !== undefined) s.date = req.body.date || null;
        });
        if (!dossier || !found) return res.status(404).json({ error: 'Source introuvable' });
        res.json(toView(dossier));
    });

    app.post('/api/dossiers/:id/sources/:sourceId/retry', (req, res) => {
        let found = false;
        mutate(req.params.id, d => {
            const s = findSource(d, req.params.sourceId);
            if (s) { found = true; s.status = 'processing'; s.error = null; }
        });
        if (!found) return res.status(404).json({ error: 'Source introuvable' });
        processSource(req.params.id, req.params.sourceId);
        scheduleFiche(req.params.id);
        res.json({ ok: true });
    });

    app.delete('/api/dossiers/:id/sources/:sourceId', (req, res) => {
        let removed = null;
        mutate(req.params.id, d => {
            removed = findSource(d, req.params.sourceId);
            d.sources = d.sources.filter(s => s.id !== req.params.sourceId);
        });
        if (!removed) return res.status(404).json({ error: 'Source introuvable' });
        const dir = path.join(FILES_DIR, path.basename(req.params.id));
        [removed.file, ...(removed.attachments || [])].filter(Boolean).forEach(f => fs.rmSync(path.join(dir, f.stored), { force: true }));
        scheduleFiche(req.params.id);
        res.json({ ok: true });
    });

    app.get('/api/dossiers/:id/sources/:sourceId/file', (req, res) => {
        const dossier = readDossier(req.params.id);
        const source = dossier && findSource(dossier, req.params.sourceId);
        if (!source?.file) return res.status(404).json({ error: 'Fichier introuvable' });
        const filePath = path.join(FILES_DIR, path.basename(req.params.id), source.file.stored);
        // ?inline=1 displays the file in the page (image preview) instead of downloading it
        if (req.query.inline) return res.type(source.file.mimetype).sendFile(filePath, SEND_OPTIONS);
        res.download(filePath, source.file.name, SEND_OPTIONS);
    });

    app.get('/api/dossiers/:id/sources/:sourceId/attachments/:index', (req, res) => {
        const dossier = readDossier(req.params.id);
        const attachment = dossier && findSource(dossier, req.params.sourceId)?.attachments?.[Number(req.params.index)];
        if (!attachment) return res.status(404).json({ error: 'Pièce jointe introuvable' });
        const filePath = path.join(FILES_DIR, path.basename(req.params.id), attachment.stored);
        if (req.query.inline) return res.type(attachment.mimetype).sendFile(filePath, SEND_OPTIONS);
        res.download(filePath, attachment.name, SEND_OPTIONS);
    });

    app.post('/api/dossiers/:id/fiche', (req, res) => {
        if (!readDossier(req.params.id)) return res.status(404).json({ error: 'Dossier introuvable' });
        scheduleFiche(req.params.id);
        res.json({ ok: true });
    });

    app.post('/api/dossiers/:id/chat', async (req, res) => {
        const id = req.params.id;
        const message = (req.body?.message || '').trim();
        const dossier = readDossier(id);
        if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
        if (!message) return res.status(400).json({ error: 'Message vide' });
        try {
            const history = dossier.chat.slice(-12).map(m => ({ role: m.role, content: m.content }));
            const response = await getOpenAI().responses.create({
                model: MODEL,
                instructions: `${SYSTEM_CONTEXT}\nTu réponds aux questions sur le dossier « ${dossier.title} » à partir de sa fiche et de ses sources ci-dessous. Cite les sources entre crochets, ex. [S2]. Quand on te demande de rédiger (mail, compte rendu, point d'avancement), produis un texte directement utilisable. Formate en Markdown. Aujourd'hui : ${new Date().toISOString().slice(0, 10)}.\n\n${dossier.notes ? `Notes de l'utilisateur : ${dossier.notes}\n\n` : ''}Fiche actuelle : ${dossier.fiche ? JSON.stringify(dossier.fiche) : 'non générée'}\n\nSources :\n\n${buildContext(dossier)}`,
                input: [...history, { role: 'user', content: message }]
            });
            const now = new Date().toISOString();
            const refs = Object.fromEntries(sourceRefs(dossier).map(({ ref, source }) => [ref, source.id]));
            const updated = mutate(id, d => {
                d.chat.push({ role: 'user', content: message, at: now }, { role: 'assistant', content: response.output_text, at: new Date().toISOString(), refs });
            });
            res.json({ chat: updated.chat });
        } catch (e) {
            console.error(`[Dossiers] Chat ${id} failed:`, e.message);
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/dossiers/:id/chat', (req, res) => {
        const dossier = mutate(req.params.id, d => { d.chat = []; });
        if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
        res.json({ ok: true });
    });

    app.get('/api/dossiers/:id/export.md', (req, res) => {
        const dossier = readDossier(req.params.id);
        if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
        const f = dossier.fiche;
        const list = (items, fmt) => (items?.length ? items.map(i => `- ${fmt(i)}`).join('\n') : '_Aucun_');
        const md = [
            `# ${dossier.title}`,
            '',
            f ? [
                `**État :** ${ETAT_LABELS[f.etat] || f.etat} — ${f.etat_libelle}`, '',
                '## Synthèse', f.resume, '',
                '## Décisions', list(f.decisions, d => `${d.date ? `${d.date} — ` : ''}${d.texte} ${d.sources.map(s => `[${s}]`).join('')}`), '',
                '## Actions', list(f.actions, a => `[${a.statut === 'fait' ? 'x' : ' '}] ${a.qui} : ${a.quoi}${a.echeance ? ` (échéance ${a.echeance})` : ''}`), '',
                '## Questions ouvertes', list(f.questions, q => q.texte), '',
                '## Risques', list(f.risques, r => r.texte), '',
                '## Acteurs', list(f.acteurs, a => `${a.nom} — ${a.role}`), '',
                '## Prochaines étapes', list(f.prochaines_etapes, s => s), ''
            ].join('\n') : '_Fiche non générée_',
            dossier.notes ? `## Notes\n${dossier.notes}\n` : '',
            '## Sources',
            ...sourceRefs(dossier).map(({ ref, source }) => `\n### [${ref}] ${source.title}\n_${source.type} — ${(source.date || source.createdAt).slice(0, 10)}_\n\n${source.analysis?.resume || ''}\n\n${source.text || ''}`)
        ].join('\n');
        const filename = `${dossier.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'dossier'}.md`;
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.send(md);
    });
};
