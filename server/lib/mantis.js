// ============================================================
// MANTIS - Client, exports CSV, scraping des tickets et caches locaux
// ============================================================

const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./storage');

// --- Configuration ---
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// --- Cache for Priority ---
const priorityCache = new Map();

// --- Mantis Sources (one saved Mantis filter + one cache file each) ---
const MANTIS_SOURCES = {
    recette: {
        queryId: process.env.MANTIS_SOURCE_QUERY_ID || '1291',
        cacheFile: path.join(DATA_DIR, 'mantis_all_mantis.json')
    },
    demarrage: {
        // No saved filter: the whole project is exported, looked up by name
        projectName: 'TORAY - Démarrage',
        // The project has no "Domaine (Toray)" field: the domain is the summary prefix ("SD - ...")
        deriveDomainFromSummary: true,
        cacheFile: path.join(DATA_DIR, 'mantis_demarrage.json')
    }
};

const getSource = (req) => {
    const key = (req.query.source || 'recette').toString();
    return MANTIS_SOURCES[key] ? key : null;
};

// --- Helper Class ---
class MantisClient {
    constructor(requestId) {
        this.requestId = requestId;
        this.jar = new CookieJar();
        this.client = wrapper(axios.create({
            baseURL: process.env.MANTIS_BASE_URL,
            jar: this.jar,
            withCredentials: true,
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }));
        this.logs = [];
    }

    log(message) {
        console.log(`[${this.requestId}] [Mantis] ${message}`);
        this.logs.push({ time: new Date().toISOString(), message });
    }

    async request(method, url, data = null, options = {}) {
        this.log(`${method} ${url}`);
        const config = {
            method,
            url,
            timeout: 15000, // 15s timeout
            ...options
        };
        if (data) config.data = data;

        let lastError;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                return await this.client(config);
            } catch (e) {
                lastError = e;
                if (attempt < 3) {
                    const delay = [500, 1500, 3000][attempt - 1];
                    this.log(`Attempt ${attempt} failed: ${e.message}. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }

    async login() {
        const { MANTIS_USERNAME, MANTIS_PASSWORD } = process.env;
        const fh = { 'Content-Type': 'application/x-www-form-urlencoded' };

        this.log('Auth Step 1: Login page');
        let res = await this.request('GET', '/login_page.php');
        let $ = cheerio.load(res.data);
        let action = $('form').attr('action') || 'login_password_page.php';
        let inputs = {};
        $('form input').each((i, el) => { inputs[$(el).attr('name')] = $(el).attr('value') || ''; });

        this.log('Auth Step 2: Post user');
        inputs['username'] = MANTIS_USERNAME;
        res = await this.request('POST', '/' + action, inputs, { headers: fh });

        $ = cheerio.load(res.data);
        this.log('Auth Step 3: Post pass');
        action = $('form').attr('action') || 'login.php';

        const passInputs = {};
        $('form input').each((i, el) => { passInputs[$(el).attr('name')] = $(el).attr('value') || ''; });
        passInputs['password'] = MANTIS_PASSWORD;

        res = await this.request('POST', '/' + action, passInputs, { headers: fh });
        if (res.request.path.includes('login_page.php')) throw new Error('Auth failed - redirected back to login');

        this.log('Auth Success');
        return true;
    }
}

const FAIL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for missing data

async function fetchPriority(mantis, issueId) {
    const cached = priorityCache.get(issueId);
    const ttl = (cached && cached.value) ? CACHE_TTL : FAIL_CACHE_TTL;
    if (cached && (Date.now() - cached.timestamp < ttl)) {
        return cached.value;
    }

    let reason = 'not_found';
    try {
        const res = await mantis.request('GET', `/view.php?id=${issueId}`);
        const $ = cheerio.load(res.data);
        let priority = '';

        $('tr').each((i, row) => {
            const cells = $(row).find('th, td');
            if (cells.length >= 2) {
                const labelText = $(cells[0]).text().trim().toLowerCase();
                if (labelText === 'priorité' || labelText === 'priorite') {
                    const valText = $(cells[1]).text().trim();
                    const match = valText.match(/^(P[1-9])/);
                    if (match) {
                        priority = match[1];
                        reason = 'match_custom_field_exact_label';
                        return false;
                    }
                }
            }
        });

        if (!priority) {
            $('td.category, th').each((i, el) => {
                const text = $(el).text().trim().toLowerCase();
                if (text === 'priorité' || text === 'priorite') {
                    const nextVal = $(el).next().text().trim();
                    const match = nextVal.match(/^(P[1-9])/);
                    if (match) {
                        priority = match[1];
                        reason = 'match_flexible_label';
                        return false;
                    }
                }
            });
        }

        if (!priority) {
            $('.bug-custom-field, td').each((i, el) => {
                const val = $(el).text().trim();
                const match = val.match(/^(P[1-9])$/);
                if (match) {
                    priority = match[1];
                    reason = 'match_direct_cell_pattern';
                    return false;
                }
            });
        }

        if (!priority) {
            const bodyText = $('body').text();
            const globalMatch = bodyText.match(/\b(P[1-9])\b/);
            if (globalMatch) {
                priority = globalMatch[1];
                reason = 'fallback_global_pattern';
            }
        }

        priorityCache.set(issueId, { value: priority, timestamp: Date.now(), reason });
        return priority;
    } catch (e) {
        console.error(`[PriorityScraper] Failed for #${issueId}:`, e.message);
        return 'ERR';
    }
}

async function performMantisExport(mantis, isDebug = false, qid = MANTIS_SOURCES.recette.queryId) {

    await mantis.login();

    mantis.log('Step 4: Load filter');
    await mantis.request('GET', '/view_all_set.php', null, { params: { type: '3', source_query_id: qid, t: Date.now() } });

    mantis.log('Step 5: Export CSV');
    const res = await mantis.request('GET', '/csv_export.php', null, { responseType: 'text' });
    if (typeof res.data === 'string' && res.data.includes('<html')) throw new Error('Export returned HTML');

    return isDebug ? { length: res.data.length } : res.data;
}

// "TORAY -Démarrage", "toray - démarrage" and "TORAY - Démarrage" all compare equal
const normalizeProjectName = (name) => (name || '').normalize('NFC').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

const matchesProject = (text, projectName) => {
    // Sub-projects can be displayed as "Parent » Child"
    const label = (text || '').split('»').pop();
    return normalizeProjectName(label) === normalizeProjectName(projectName);
};

async function performProjectExport(mantis, projectName) {
    await mantis.login();

    mantis.log(`Step 4: Find project "${projectName}"`);
    let res = await mantis.request('GET', '/view_all_bug_page.php');
    let $ = cheerio.load(res.data);

    // Mantis 2.x navbar links: set_project.php?project_id=N
    let projectId = null;
    let switchUrl = null;
    $('a[href*="set_project.php"]').each((i, el) => {
        const href = $(el).attr('href');
        const match = href.match(/project_id=(\d+)/);
        if (match && matchesProject($(el).text(), projectName)) {
            projectId = match[1];
            switchUrl = href;
            return false;
        }
    });

    // Older themes: <form action="set_project.php"><select name="project_id">
    let switchForm = null;
    if (!projectId) {
        $('select[name="project_id"] option').each((i, el) => {
            if (matchesProject($(el).text(), projectName)) {
                projectId = ($(el).attr('value') || '').split(';').pop();
                const form = $(el).closest('form');
                const inputs = {};
                form.find('input').each((j, input) => { inputs[$(input).attr('name')] = $(input).attr('value') || ''; });
                inputs['project_id'] = $(el).attr('value');
                switchForm = { action: form.attr('action') || 'set_project.php', inputs };
                return false;
            }
        });
    }
    if (!projectId) throw new Error(`Projet Mantis "${projectName}" introuvable pour ce compte`);

    mantis.log(`Step 5: Switch to project ${projectId}`);
    if (switchUrl) {
        await mantis.request('GET', '/' + switchUrl.replace(/^.*?(set_project\.php)/, '$1'));
    } else {
        await mantis.request('POST', '/' + switchForm.action.replace(/^\//, ''), switchForm.inputs, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
    }

    mantis.log('Step 6: Filter on all statuses');
    await mantis.request('GET', '/view_all_set.php', null, {
        params: { type: '1', 'hide_status[]': '-2', 'project_id[]': projectId, t: Date.now() }
    });

    mantis.log('Step 7: Export CSV');
    res = await mantis.request('GET', '/csv_export.php', null, { responseType: 'text' });
    if (typeof res.data === 'string' && res.data.includes('<html')) throw new Error('Export returned HTML');
    return res.data;
}

const domainFromSummary = (summary) => {
    const match = (summary || '').match(/^\s*([A-Za-z]{2,4})\s*-/);
    return match ? match[1].toUpperCase() : '';
};

// Helper for cache
const readCache = (source = 'recette') => {
    const { cacheFile, deriveDomainFromSummary } = MANTIS_SOURCES[source];
    if (fs.existsSync(cacheFile)) {
        try {
            const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            if (deriveDomainFromSummary && Array.isArray(cache.data)) {
                cache.data.forEach(row => {
                    if (!row['Domaine (Toray)']) row['Domaine (Toray)'] = domainFromSummary(row['Résumé']);
                });
            }
            return cache;
        } catch (e) {
            return null;
        }
    }
    return null;
};

const writeCacheAtomic = (data, summary, source = 'recette') => {
    const cacheFile = MANTIS_SOURCES[source].cacheFile;
    const tempFile = cacheFile + '.tmp';
    const content = JSON.stringify({
        data,
        lastUpdated: new Date().toISOString(),
        summary
    }, null, 2);

    fs.writeFileSync(tempFile, content);
    fs.renameSync(tempFile, cacheFile);
};

/**
 * Scrapes a single Mantis issue page for full details (description, notes, attachments)
 */
async function fetchFullIssueDetails(mantis, issueId) {
    try {
        const res = await mantis.request('GET', `/view.php?id=${issueId}`);
        const $ = cheerio.load(res.data);

        const details = {
            id: issueId,
            description: '',
            steps_to_reproduce: '',
            additional_info: '',
            notes: [],
            attachments: []
        };

        // Extracting Description, Steps, Additional Info
        // Mantis uses <tr><td class="category">Label</td><td>Value</td></tr>
        $('td.category').each((i, el) => {
            const label = $(el).text().trim().toLowerCase();
            const value = $(el).next().text().trim();
            if (label.includes('description')) details.description = value;
            else if (label.includes('reproduire') || label.includes('steps to reproduce')) details.steps_to_reproduce = value;
            else if (label.includes('informations supplémentaires') || label.includes('additional information')) details.additional_info = value;
        });

        // Extracting Attachments
        // Usually in a table with ID "attachments" or similar
        $('#attachments, table:contains("Fichiers attachés"), table:contains("Attached Files")').find('tr').each((i, row) => {
            const links = $(row).find('a');
            links.each((j, link) => {
                const href = $(link).attr('href');
                const text = $(link).text().trim();
                // We want links that look like download links
                if (href && (href.includes('file_download.php') || href.includes('download') || href.includes('plugin.php'))) {
                    // Check if it's not a generic action link
                    if (text && !['[Détacher]', '[Supprimer]', 'Détacher', 'Supprimer'].includes(text)) {
                        details.attachments.push({ name: text, url: href });
                    }
                }
            });
        });

        // Extracting Notes
        // Modern Mantis uses class .bugnote
        $('.bugnote').each((i, el) => {
            const author = $(el).find('.bugnote-note-public, .bugnote-note-private, .bugnote-author').first().text().trim().replace(/\s+/g, ' ');
            const date = $(el).find('.bugnote-date').text().trim();
            const text = $(el).find('.bugnote-text').text().trim();
            if (text) {
                details.notes.push({ author, date, text });
            }
        });

        // Fallback for older Mantis versions or different themes
        if (details.notes.length === 0) {
            $('table.width100 tr').each((i, row) => {
                const td = $(row).find('td');
                if (td.length === 2 && ($(td[0]).hasClass('bugnote-public') || $(td[0]).hasClass('bugnote-private'))) {
                    const author = $(td[0]).text().trim().replace(/\s+/g, ' ');
                    const text = $(row).next().find('td').text().trim();
                    if (text) details.notes.push({ author, text });
                }
            });
        }

        return details;
    } catch (e) {
        console.error(`[FullScraper] Failed for #${issueId}:`, e.message);
        return null;
    }
}

module.exports = {
    MANTIS_SOURCES,
    getSource,
    priorityCache,
    MantisClient,
    fetchPriority,
    performMantisExport,
    matchesProject,
    performProjectExport,
    readCache,
    writeCacheAtomic,
    fetchFullIssueDetails
};
