const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });


const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// --- Logger Utility ---
const logger = {
    info: (rid, endpoint, status, message) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${rid || 'SYS'}] [${endpoint}] ${status ? `CODE:${status}` : ''} ${message}`);
    },
    error: (rid, endpoint, status, message) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [${rid || 'SYS'}] [${endpoint}] ${status ? `ERR_CODE:${status}` : ''} ERROR: ${message}`);
    },
    isHtml: (data) => typeof data === 'string' && data.trim().toLowerCase().startsWith('<!doctype html')
};


// --- Configuration ---
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// --- Cache for Priority ---
const priorityCache = new Map();

// --- Background Job State ---
let refreshJob = {
    isRunning: false,
    current: 0,
    total: 0,
    startTime: null,
    success: 0,
    failed: 0,
    lastUpdate: null,
    error: null
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

async function performMantisExport(mantis, isDebug = false) {
    const { MANTIS_SOURCE_QUERY_ID } = process.env;
    const qid = MANTIS_SOURCE_QUERY_ID || '1291';

    await mantis.login();

    mantis.log('Step 4: Load filter');
    await mantis.request('GET', '/view_all_set.php', null, { params: { type: '3', source_query_id: qid, t: Date.now() } });

    mantis.log('Step 5: Export CSV');
    const res = await mantis.request('GET', '/csv_export.php', null, { responseType: 'text' });
    if (typeof res.data === 'string' && res.data.includes('<html')) throw new Error('Export returned HTML');

    return isDebug ? { length: res.data.length } : res.data;
}

const CACHE_FILE = path.join(__dirname, 'data/mantis_all_mantis.json');

// Ensure data dir exists
if (!fs.existsSync(path.dirname(CACHE_FILE))) {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
}

// Helper for cache
const readCache = () => {
    if (fs.existsSync(CACHE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        } catch (e) {
            return null;
        }
    }
    return null;
};

const writeCacheAtomic = (data, summary) => {
    const tempFile = CACHE_FILE + '.tmp';
    const content = JSON.stringify({
        data,
        lastUpdated: new Date().toISOString(),
        summary
    }, null, 2);

    fs.writeFileSync(tempFile, content);
    fs.renameSync(tempFile, CACHE_FILE);
};

// --- Full Extraction Jobs State ---
let extractJobs = new Map();

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

app.get('/api/mantis/health', (req, res) => {
    const rid = `health-${Date.now()}`;
    logger.info(rid, '/api/mantis/health', 200, 'Health check OK');
    res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/api/mantis/kpis', (req, res) => {
    const rid = `kpi-${Date.now()}`;
    try {
        const cache = readCache();
        if (!cache || !cache.data) {
            logger.error(rid, '/api/mantis/kpis', 503, 'Cache not available');
            return res.status(503).json({ error: 'Cache Mantis non disponible. Veuillez lancer une synchronisation.', code: 'CACHE_MISSING' });
        }

        const data = cache.data;
        const all_except_rdd = data.filter(row => (row['Domaine (Toray)'] || '').trim() !== 'RDD');

        // Helpers for dates
        const getWeekStart = (dateStr) => {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return null;
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            monday.setHours(0, 0, 0, 0);
            return monday.toISOString().split('T')[0];
        };

        const getMonthStart = (dateStr) => {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return null;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        };

        // Consolidated Business Rules for KPI Statuts
        const isKpiOpen = (row) => {
            const status = (row['État'] || row['Etat'] || '').trim().toLowerCase();
            const openStatuses = ['nouveau', 'accepté', 'chiffrage', 'validation chiffrage', 'réalisation', 'résolu'];
            return openStatuses.includes(status);
        };

        const isKpiClosed = (row) => {
            const status = (row['État'] || row['Etat'] || '').trim().toLowerCase();
            const closedStatuses = ['fermé', 'clos', 'validé', 'suspendu', 'annulé'];
            return closedStatuses.includes(status);
        };

        const isKpiValidated = (row) => {
            const status = (row['État'] || row['Etat'] || '').trim().toLowerCase();
            const validStatuses = ['fermé', 'validé', 'suspendu', 'annulé'];
            return validStatuses.includes(status);
        };

        const computeBreakdown = (items) => {
            const getP = (p) => items.filter(r => (r.priorite_p || '').toUpperCase() === p).length;
            const p1 = getP('P1');
            const p2 = getP('P2');
            const p3 = getP('P3');
            const total = items.length;
            const non_prio = total - (p1 + p2 + p3);
            return { total, p1, p2, p3, non_prio };
        };

        // SD En cours logic (KPI Rules)
        const sd_en_cours_items = data.filter(row => {
            const category = (row['Catégorie'] || '').trim();
            const domaine = (row['Domaine (Toray)'] || '').trim();
            const isSD = category === 'SD' || domaine === 'SD';
            const isCorrectStatus = isKpiOpen(row);
            const assignee = (row['Affecté à'] || '').trim().toLowerCase();
            const isNotYann = assignee !== 'yann.deschamps';
            return isSD && isCorrectStatus && isNotYann;
        });

        // SD Testable logic (Remains specific to "Résolu" for operational value, but within KPI Open scope)
        const sd_testable_items = data.filter(row => {
            const category = (row['Catégorie'] || '').trim();
            const domaine = (row['Domaine (Toray)'] || '').trim();
            const isSD = category === 'SD' || domaine === 'SD';
            const status = (row['État'] || row['Etat'] || '').trim().toLowerCase();
            const isResolu = status === 'résolu';
            const assignee = (row['Affecté à'] || '').trim().toLowerCase();
            const isYann = assignee === 'yann.deschamps';
            return isSD && isResolu && isYann;
        });

        // --- GLOBAL KPIS (All except RDD) ---
        // Exclude RDD domain from all global metrics


        const sd_open = all_except_rdd.filter(isKpiOpen);
        const sd_closed = all_except_rdd.filter(isKpiClosed);

        // Evolution creations & flux
        const evolutionWeekly = {};
        const evolutionMonthly = {};
        const now = new Date();
        const historyLimit = new Date();
        historyLimit.setMonth(now.getMonth() - 12); // Extended to 12 months


        all_except_rdd.forEach(row => {
            const submitDate = row['Date de soumission'];
            const isValidated = isKpiValidated(row);
            const week = getWeekStart(submitDate);
            const month = getMonthStart(submitDate);

            // Weekly
            if (week && new Date(week) >= historyLimit) {
                if (!evolutionWeekly[week]) evolutionWeekly[week] = { label: week, created: 0, validated: 0 };
                evolutionWeekly[week].created++;
            }

            // Monthly
            if (month && new Date(month) >= historyLimit) {
                if (!evolutionMonthly[month]) evolutionMonthly[month] = { label: month, created: 0, validated: 0 };
                evolutionMonthly[month].created++;
            }

            // Handle validations (local logic for evolution chart)
            if (isValidated) {
                const solveDate = row['Mis à jour'];
                const solveWeek = getWeekStart(solveDate);
                const solveMonth = getMonthStart(solveDate);
                if (solveWeek && evolutionWeekly[solveWeek]) evolutionWeekly[solveWeek].validated++;
                if (solveMonth && evolutionMonthly[solveMonth]) evolutionMonthly[solveMonth].validated++;
            }
        });

        const evolutionDataWeekly = Object.values(evolutionWeekly).sort((a, b) => a.label.localeCompare(b.label));
        const evolutionDataMonthly = Object.values(evolutionMonthly).sort((a, b) => a.label.localeCompare(b.label));

        // Distribution domaines
        const domainMap = {};
        all_except_rdd.forEach(row => {
            const dom = (row['Domaine (Toray)'] || 'N/A').trim();
            domainMap[dom] = (domainMap[dom] || 0) + 1;
        });
        const domainDistribution = Object.entries(domainMap).map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        // Backlog details (SD non résolues)
        const backlog_priorite = computeBreakdown(sd_open);

        // Age Moyen
        let totalAgeDays = 0;
        let countOpenWithDate = 0;
        const today = new Date();
        sd_open.forEach(row => {
            const d = new Date(row['Date de soumission']);
            if (!isNaN(d.getTime())) {
                const diffTime = Math.abs(today - d);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                totalAgeDays += diffDays;
                countOpenWithDate++;
            }
        });
        const age_moyen = countOpenWithDate > 0 ? Math.round(totalAgeDays / countOpenWithDate) : 0;

        const getOpenMantisBacklogOverTime = (items, labels, type) => {
            return labels.map(label => {
                let endOfPeriod = new Date(label);
                if (type === 'monthly') {
                    // End of that month
                    endOfPeriod = new Date(endOfPeriod.getFullYear(), endOfPeriod.getMonth() + 1, 0, 23, 59, 59);
                } else {
                    // End of that week (Sunday)
                    endOfPeriod.setDate(endOfPeriod.getDate() + 6);
                    endOfPeriod.setHours(23, 59, 59);
                }

                const openCount = items.filter(row => {
                    const submitDate = new Date(row['Date de soumission']);
                    if (submitDate > endOfPeriod) return false;

                    // Definition of "Open" for this specific chart: Not Fermé, Validé, Suspendu, Annulé
                    // This matches our isKpiValidated helper
                    if (isKpiValidated(row)) {
                        const closeDate = new Date(row['Mis à jour']);
                        return closeDate > endOfPeriod;
                    }
                    return true;
                }).length;

                return { label, value: openCount };
            });
        };

        const backlogHistoryMonthly = getOpenMantisBacklogOverTime(all_except_rdd, evolutionDataMonthly.map(d => d.label), 'monthly');
        const backlogHistoryWeekly = getOpenMantisBacklogOverTime(all_except_rdd, evolutionDataWeekly.map(d => d.label), 'weekly');

        const getResolutionStats = (items) => {
            let totalResDays = 0;
            let countResWithDate = 0;
            items.forEach(row => {
                const start = new Date(row['Date de soumission']);
                const end = new Date(row['Mis à jour']);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    const diffTime = Math.max(0, end - start);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    totalResDays += diffDays;
                    countResWithDate++;
                }
            });
            return countResWithDate > 0 ? Math.round(totalResDays / countResWithDate) : 0;
        };
        const res_global = getResolutionStats(sd_closed);

        const getOpenMantisByDomain = (items) => {
            const openMap = {};
            items.filter(row => !isKpiValidated(row)).forEach(row => {
                const dom = (row['Domaine (Toray)'] || 'N/A').trim();
                openMap[dom] = (openMap[dom] || 0) + 1;
            });
            return Object.entries(openMap)
                .map(([name, value]) => ({ name, value }))
                .sort((a, b) => b.value - a.value);
        };
        const open_by_domain = getOpenMantisByDomain(all_except_rdd);

        const response = {
            sd_en_cours: computeBreakdown(sd_en_cours_items),
            sd_testable: computeBreakdown(sd_testable_items),
            global: {
                evolution: {
                    weekly: evolutionDataWeekly,
                    monthly: evolutionDataMonthly
                },
                domaines: domainDistribution,
                backlog: {
                    total: sd_open.length,
                    priorite: backlog_priorite,
                    age_moyen: age_moyen
                },
                backlog_history: {
                    weekly: backlogHistoryWeekly,
                    monthly: backlogHistoryMonthly
                },
                open_by_domain: open_by_domain,
                resolution: {
                    global: res_global
                }
            },
            last_sync: cache.lastUpdated
        };

        logger.info(rid, '/api/mantis/kpis', 200, `Calculated Full KPIs: SD_EC=${response.sd_en_cours.total} SD_T=${response.sd_testable.total}`);
        res.json(response);
    } catch (e) {
        logger.error(rid, '/api/mantis/kpis', 500, e.stack || e.message);
        res.status(500).json({ error: e.message });

    }
});

app.post('/api/mantis/export/xlsx', async (req, res) => {
    const { data: rawRows, filename: baseFilename, tabName } = req.body;
    const rid = `export-${Date.now()}`;

    if (!rawRows || !Array.isArray(rawRows)) {
        return res.status(400).json({ error: 'Data is required as an array' });
    }

    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(tabName || 'Export');

        if (rawRows.length === 0) {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${baseFilename || 'export'}.xlsx`);
            await workbook.xlsx.write(res);
            res.end();
            return;
        }

        // Clean rows to remove __original or complex objects if any
        const rows = rawRows.map(r => {
            const clean = { ...r };
            // Ensure no circular or complex React components leaked through (unlikely from JSON body but safe)
            return clean;
        });

        const keys = Object.keys(rows[0]);
        logger.info(rid, '/api/mantis/export/xlsx', null, `Exporting ${rows.length} rows with columns: ${keys.join(', ')}`);

        worksheet.columns = keys.map(key => {
            let colWidth = 15;
            const k = key.toLowerCase();
            if (key === 'Identifiant') colWidth = 12;
            else if (key === 'Affecté à' || k === 'assignee') colWidth = 25;
            else if (key === 'priorite_p') colWidth = 10;
            else if (k === 'catégorie' || k === 'category') colWidth = 18;
            else if (k === 'mis à jour' || k === 'updated') colWidth = 16;
            else if (k === 'résumé' || k === 'summary') colWidth = 100;
            return { header: key, key: key, width: colWidth };
        });

        // Style header
        const headerRow = worksheet.getRow(1);
        headerRow.height = 25;
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Add rows
        rows.forEach((rowData, index) => {
            const row = worksheet.addRow(rowData);
            const isZebra = index % 2 === 1;

            // Identifiant Link
            const idColIndex = keys.indexOf('Identifiant');
            if (idColIndex !== -1) {
                const cell = row.getCell(idColIndex + 1);
                if (cell.value) {
                    const textVal = String(cell.value);
                    cell.value = {
                        text: textVal,
                        hyperlink: `https://mantis.stms.fr/view.php?id=${textVal.replace(/^0+/, '')}`
                    };
                    cell.font = { color: { argb: 'FF0563C1' }, underline: true };
                }
            }

            // General cell styling
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const key = keys[colNumber - 1];
                cell.alignment = {
                    vertical: 'middle',
                    wrapText: (key === 'Résumé' || key === 'summary')
                };
                if (isZebra) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } };
                }
            });
        });

        // AutoFilter
        const lastColLetter = worksheet.getRow(1).getCell(keys.length).address.replace(/[0-9]/g, '');
        worksheet.autoFilter = `A1:${lastColLetter}1`;

        // Freeze row 1
        worksheet.views = [{ state: 'frozen', ySplit: 1 }];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${baseFilename || 'mantis_export'}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
        return;

        logger.info(rid, '/api/mantis/export/xlsx', 200, `Exported ${rows.length} rows`);
    } catch (e) {
        logger.error(rid, '/api/mantis/export/xlsx', 500, e.message);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message });
        }
    }
});



app.get('/api/mantis/refresh-status', (req, res) => {
    res.json({
        ...refreshJob,
        progress: refreshJob.total > 0 ? (refreshJob.current / refreshJob.total) * 100 : 0,
        status: refreshJob.isRunning ? 'running' : refreshJob.error ? 'failed' : 'completed'
    });
});

app.get('/api/mantis/status/:id', (req, res) => {
    // For now we use the global job status
    res.json({
        ...refreshJob,
        progress: refreshJob.total > 0 ? (refreshJob.current / refreshJob.total) * 100 : 0,
        status: refreshJob.isRunning ? 'running' : refreshJob.error ? 'failed' : (refreshJob.total > 0 ? 'completed' : 'idle')
    });
});


app.post('/api/mantis/refresh', async (req, res) => {
    if (refreshJob.isRunning) {
        return res.status(409).json({ error: 'Refresh already in progress' });
    }

    const rid = `job-${Date.now()}`;
    const mantis = new MantisClient(rid);

    if (!process.env.MANTIS_BASE_URL || !process.env.MANTIS_USERNAME || !process.env.MANTIS_PASSWORD) {
        return res.status(500).json({ error: 'Missing configuration' });
    }

    res.json({ message: 'Refresh started', jobId: rid });

    (async () => {
        const startTime = Date.now();
        refreshJob = {
            isRunning: true,
            current: 0,
            total: 0,
            startTime: new Date().toISOString(),
            success: 0,
            failed: 0,
            lastUpdate: null,
            error: null
        };

        try {
            const csv = await performMantisExport(mantis);
            if (logger.isHtml(csv)) {
                throw new Error('Mantis session expired or login required (HTML detected)');
            }

            const Papa = require('papaparse');
            const rows = Papa.parse(csv, { header: true, skipEmptyLines: true }).data;


            refreshJob.total = rows.length;
            const concurrency = parseInt(process.env.MANTIS_ENRICH_CONCURRENCY || '5');

            for (let i = 0; i < rows.length; i += concurrency) {
                const chunk = rows.slice(i, i + concurrency);
                await Promise.all(chunk.map(async (row) => {
                    const idAttr = row['Identifiant'] || row['id'];
                    if (idAttr) {
                        const numericId = idAttr.replace(/^0+/, '');
                        try {
                            const val = await fetchPriority(mantis, numericId);
                            row['priorite_p'] = val;
                            if (val && val !== 'ERR') refreshJob.success++;
                            else refreshJob.failed++;
                        } catch (err) {
                            row['priorite_p'] = 'ERR';
                            refreshJob.failed++;
                        }
                    } else {
                        refreshJob.success++;
                    }
                    refreshJob.current++;
                    refreshJob.lastUpdate = new Date().toISOString();
                }));
            }

            writeCacheAtomic(rows, {
                totalRows: refreshJob.total,
                enriched: { total: refreshJob.current, success: refreshJob.success, failed: refreshJob.failed }
            });
            console.log(`[Job] Finished in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

        } catch (e) {
            console.error('[Job] Failed:', e.message);
            refreshJob.error = e.message;
        } finally {
            refreshJob.isRunning = false;
        }
    })();
});

app.get('/api/mantis/all', async (req, res) => {
    const rid = Date.now().toString();
    try {
        const cache = readCache();
        if (cache) {
            return res.json({
                issues: cache.data,
                lastUpdate: cache.lastUpdated,
                summary: cache.summary,
                isFromCache: true,
                baseUrl: process.env.MANTIS_BASE_URL,
                requestId: rid
            });
        }
        res.status(404).json({ error: 'No data available. Please refresh.', requestId: rid });
    } catch (e) {
        res.status(500).json({ error: e.message, requestId: rid });
    }
});


app.get('/api/mantis/priority-p', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const rid = `lazy-${id}-${Date.now()}`;
    const mantis = new MantisClient(rid);

    try {
        await mantis.login();
        priorityCache.delete(id.replace(/^0+/, ''));
        const val = await fetchPriority(mantis, id.replace(/^0+/, ''));
        res.json({ id, priorite_p: val, requestId: rid });
    } catch (e) {
        res.status(500).json({ error: e.message, requestId: rid });
    }
});

// --- FULL EXTRACTION ENDPOINTS ---

app.post('/api/mantis/extract-full', async (req, res) => {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain is required' });

    const jobId = `extract-${domain}-${Date.now()}`;
    const mantis = new MantisClient(jobId);

    extractJobs.set(jobId, {
        status: 'running',
        progress: 0,
        step: 'Initialisation...',
        domain,
        startTime: new Date().toISOString(),
        data: [],
        current: 0,
        total: 0
    });

    res.json({ jobId });

    // Background process
    (async () => {
        try {
            const cache = readCache();
            if (!cache || !cache.data) throw new Error('Cache Mantis non disponible. Veuillez synchroniser Mantis d\'abord via l\'onglet Mantis.');

            const issues = cache.data.filter(row => {
                const dom = (row['Domaine (Toray)'] || row['domaine'] || '').toString().trim().toUpperCase();
                return dom === domain.toUpperCase();
            });

            if (issues.length === 0) throw new Error(`Aucun ticket trouvé pour le domaine ${domain}`);

            const job = extractJobs.get(jobId);
            job.total = issues.length;

            await mantis.login();

            // Progress with controlled concurrency to avoid overwhelming Mantis
            const concurrency = 3;
            for (let i = 0; i < issues.length; i += concurrency) {
                const chunk = issues.slice(i, i + concurrency);
                await Promise.all(chunk.map(async (issue, idx) => {
                    const idAttr = issue['Identifiant'] || issue['id'];
                    const numericId = idAttr.replace(/^0+/, '');

                    const details = await fetchFullIssueDetails(mantis, numericId);

                    if (details) {
                        job.data.push({
                            ...issue,
                            full_details: details
                        });
                    }

                    job.current++;
                    job.progress = (job.current / job.total) * 100;
                    job.step = `Extraction #${idAttr} (${job.current}/${job.total})`;
                }));
            }

            job.status = 'completed';
            job.step = 'Extraction terminée';
            job.endTime = new Date().toISOString();

        } catch (e) {
            console.error(`[ExtractJob] ${jobId} failed:`, e.message);
            const job = extractJobs.get(jobId);
            if (job) {
                job.status = 'failed';
                job.error = e.message;
                job.step = 'Erreur: ' + e.message;
            }
        }
    })();
});

app.get('/api/mantis/extract-status/:jobId', (req, res) => {
    const job = extractJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({
        status: job.status,
        progress: job.progress,
        step: job.step,
        error: job.error
    });
});

app.get('/api/mantis/extract-download/:jobId', (req, res) => {
    const job = extractJobs.get(req.params.jobId);
    if (!job || job.status !== 'completed') return res.status(404).json({ error: 'Result not ready or job not found' });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=mantis_extract_${job.domain}_${Date.now()}.json`);
    res.send(JSON.stringify(job.data, null, 2));

    // Clean up job memory after download
    // extractJobs.delete(req.params.jobId);
});

// ============================================================
// OPEN TOPICS MODULE - Ticketing System
// ============================================================

const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const TOPICS_FILE = path.join(__dirname, 'data/open_topics.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads/open-topics');

// Ensure directories exist
[path.dirname(TOPICS_FILE), UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer config for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}-${safeFilename}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const allowed = ['image/', 'application/pdf', 'text/', 'application/msword', 'application/vnd.', 'application/zip', 'application/x-'];
        const ok = allowed.some(t => file.mimetype.startsWith(t) || file.mimetype.includes(t));
        cb(null, ok);
    }
});

// Helper functions for topics
const readTopics = () => {
    if (fs.existsSync(TOPICS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf-8'));
        } catch (e) {
            return [];
        }
    }
    return [];
};

const writeTopicsAtomic = (topics) => {
    const tempFile = TOPICS_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(topics, null, 2));
    fs.renameSync(tempFile, TOPICS_FILE);
};

// Serve uploaded files
app.use('/uploads/open-topics', express.static(UPLOADS_DIR));

// GET /api/open-topics - List all topics with filtering
app.get('/api/open-topics', (req, res) => {
    try {
        let topics = readTopics();
        const { search, status, priority, tag, owner, sortBy = 'updatedAt', sortDir = 'desc' } = req.query;

        if (search) {
            const s = search.toLowerCase();
            topics = topics.filter(t =>
                t.title.toLowerCase().includes(s) ||
                t.summary.toLowerCase().includes(s) ||
                (t.description || '').toLowerCase().includes(s)
            );
        }
        if (status) topics = topics.filter(t => t.status === status);
        if (priority) topics = topics.filter(t => t.priority === priority);
        if (owner) topics = topics.filter(t => t.owner?.toLowerCase().includes(owner.toLowerCase()));
        if (tag) topics = topics.filter(t => t.tags?.includes(tag));

        topics.sort((a, b) => {
            const aVal = a[sortBy] || '';
            const bVal = b[sortBy] || '';
            return sortDir === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
        });

        res.json(topics);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/open-topics - Create new topic
app.post('/api/open-topics', (req, res) => {
    try {
        const { title, summary, description, status, priority, owner, tags, dueDate, links } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const topics = readTopics();
        const now = new Date().toISOString();
        const newTopic = {
            id: uuidv4(),
            title: title.trim(),
            summary: summary || '',
            description: description || '',
            status: status || 'Backlog',
            priority: priority || 'P4',
            owner: owner || '',
            tags: tags || [],
            dueDate: dueDate || null,
            links: links || [],
            attachments: [],
            createdAt: now,
            updatedAt: now
        };

        topics.push(newTopic);
        writeTopicsAtomic(topics);
        res.status(201).json(newTopic);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/open-topics/:id - Get single topic
app.get('/api/open-topics/:id', (req, res) => {
    try {
        const topics = readTopics();
        const topic = topics.find(t => t.id === req.params.id);
        if (!topic) return res.status(404).json({ error: 'Topic not found' });
        res.json(topic);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/open-topics/:id - Update topic
app.put('/api/open-topics/:id', (req, res) => {
    try {
        const topics = readTopics();
        const idx = topics.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Topic not found' });

        const { title, summary, description, status, priority, owner, tags, dueDate, links } = req.body;

        if (title !== undefined) topics[idx].title = title.trim();
        if (summary !== undefined) topics[idx].summary = summary;
        if (description !== undefined) topics[idx].description = description;
        if (status !== undefined) topics[idx].status = status;
        if (priority !== undefined) topics[idx].priority = priority;
        if (owner !== undefined) topics[idx].owner = owner;
        if (tags !== undefined) topics[idx].tags = tags;
        if (dueDate !== undefined) topics[idx].dueDate = dueDate;
        if (links !== undefined) topics[idx].links = links;

        topics[idx].updatedAt = new Date().toISOString();
        writeTopicsAtomic(topics);
        res.json(topics[idx]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/open-topics/:id - Delete topic
app.delete('/api/open-topics/:id', (req, res) => {
    try {
        let topics = readTopics();
        const topic = topics.find(t => t.id === req.params.id);
        if (!topic) return res.status(404).json({ error: 'Topic not found' });

        // Delete attachments
        (topic.attachments || []).forEach(att => {
            const filePath = path.join(UPLOADS_DIR, att.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });

        topics = topics.filter(t => t.id !== req.params.id);
        writeTopicsAtomic(topics);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/open-topics/:id/attachments - Upload attachments
app.post('/api/open-topics/:id/attachments', upload.array('files', 10), (req, res) => {
    try {
        const topics = readTopics();
        const idx = topics.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Topic not found' });

        const newAttachments = (req.files || []).map(file => ({
            id: uuidv4(),
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            uploadedAt: new Date().toISOString(),
            url: `/uploads/open-topics/${file.filename}`
        }));

        topics[idx].attachments = [...(topics[idx].attachments || []), ...newAttachments];
        topics[idx].updatedAt = new Date().toISOString();
        writeTopicsAtomic(topics);

        res.json({ attachments: newAttachments, topic: topics[idx] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/open-topics/:id/attachments/:attachmentId - Delete attachment
app.delete('/api/open-topics/:id/attachments/:attachmentId', (req, res) => {
    try {
        const topics = readTopics();
        const idx = topics.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Topic not found' });

        const att = (topics[idx].attachments || []).find(a => a.id === req.params.attachmentId);
        if (!att) return res.status(404).json({ error: 'Attachment not found' });

        // Delete file
        const filePath = path.join(UPLOADS_DIR, att.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        topics[idx].attachments = topics[idx].attachments.filter(a => a.id !== req.params.attachmentId);
        topics[idx].updatedAt = new Date().toISOString();
        writeTopicsAtomic(topics);

        res.json({ success: true, topic: topics[idx] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// DOCUMENTATION MODULE - Personal SharePoint
// ============================================================

const DOC_FILE = path.join(__dirname, 'data/documentation.json');
const DOC_UPLOADS_DIR = path.join(__dirname, 'uploads/documentation');

// Ensure directories exist
[path.dirname(DOC_FILE), DOC_UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer config for documentation uploads
const docStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, DOC_UPLOADS_DIR),
    filename: (req, file, cb) => {
        const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${uuidv4()}-${safeFilename}`);
    }
});

const uploadDoc = multer({
    storage: docStorage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// Helper functions for documentation
const readDocData = () => {
    if (fs.existsSync(DOC_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DOC_FILE, 'utf-8'));
        } catch (e) {
            return { spaces: [], items: [] };
        }
    }
    return {
        spaces: [
            { id: 'default', name: 'Général', order: 0, createdAt: new Date().toISOString() }
        ], items: []
    };
};

const writeDocDataAtomic = (data) => {
    const tempFile = DOC_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, DOC_FILE);
};

app.use('/uploads/documentation', express.static(DOC_UPLOADS_DIR));

// --- SPACES ENDPOINTS ---

app.get('/api/documentation/spaces', (req, res) => {
    const data = readDocData();
    res.json(data.spaces.sort((a, b) => a.order - b.order));
});

app.post('/api/documentation/spaces', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const data = readDocData();
    const newSpace = {
        id: uuidv4(),
        name,
        order: data.spaces.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    data.spaces.push(newSpace);
    writeDocDataAtomic(data);
    res.status(201).json(newSpace);
});

app.put('/api/documentation/spaces/:id', (req, res) => {
    const data = readDocData();
    const idx = data.spaces.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Space not found' });

    const { name, order } = req.body;
    if (name !== undefined) data.spaces[idx].name = name;
    if (order !== undefined) data.spaces[idx].order = order;
    data.spaces[idx].updatedAt = new Date().toISOString();

    writeDocDataAtomic(data);
    res.json(data.spaces[idx]);
});

app.delete('/api/documentation/spaces/:id', (req, res) => {
    const data = readDocData();
    const spaceIdx = data.spaces.findIndex(s => s.id === req.params.id);
    if (spaceIdx === -1) return res.status(404).json({ error: 'Space not found' });

    // Delete files associated with items in this space
    const itemsToDelete = data.items.filter(item => item.spaceId === req.params.id);
    itemsToDelete.forEach(item => {
        if (item.type === 'file' && item.file?.filename) {
            const filePath = path.join(DOC_UPLOADS_DIR, item.file.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    });

    // Filter out space and its items
    data.spaces = data.spaces.filter(s => s.id !== req.params.id);
    data.items = data.items.filter(item => item.spaceId !== req.params.id);

    writeDocDataAtomic(data);
    res.json({ success: true });
});

// --- ITEMS ENDPOINTS ---

app.get('/api/documentation/items', (req, res) => {
    const data = readDocData();
    const { spaceId, view, search } = req.query;

    let items = data.items;
    if (spaceId) items = items.filter(i => i.spaceId === spaceId);
    if (view) items = items.filter(i => i.view === view);
    if (search) {
        const s = search.toLowerCase();
        items = items.filter(i =>
            i.title.toLowerCase().includes(s) ||
            (i.description || '').toLowerCase().includes(s) ||
            (i.tags || []).some(t => t.toLowerCase().includes(s))
        );
    }

    res.json(items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
});

app.post('/api/documentation/items', (req, res) => {
    const { spaceId, view, title, type, url, description, tags } = req.body;
    if (!spaceId || !view || !title) return res.status(400).json({ error: 'Missing required fields' });

    const data = readDocData();
    const newItem = {
        id: uuidv4(),
        spaceId,
        view,
        title,
        type: type || 'url',
        url: url || '',
        description: description || '',
        tags: tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    data.items.push(newItem);
    writeDocDataAtomic(data);
    res.status(201).json(newItem);
});

app.post('/api/documentation/items/file', uploadDoc.single('file'), (req, res) => {
    const { spaceId, view, title, description, tags } = req.body;
    if (!spaceId || !view || !title || !req.file) {
        return res.status(400).json({ error: 'Missing required fields or file' });
    }

    const data = readDocData();
    const newItem = {
        id: uuidv4(),
        spaceId,
        view,
        title,
        type: 'file',
        description: description || '',
        tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [],
        file: {
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            uploadedAt: new Date().toISOString(),
            url: `/uploads/documentation/${req.file.filename}`
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    data.items.push(newItem);
    writeDocDataAtomic(data);
    res.status(201).json(newItem);
});

app.put('/api/documentation/items/:id', (req, res) => {
    const data = readDocData();
    const idx = data.items.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });

    const { title, description, tags, url, isFavorite } = req.body;
    if (title !== undefined) data.items[idx].title = title;
    if (description !== undefined) data.items[idx].description = description;
    if (tags !== undefined) data.items[idx].tags = tags;
    if (url !== undefined) data.items[idx].url = url;
    if (isFavorite !== undefined) data.items[idx].isFavorite = isFavorite;

    data.items[idx].updatedAt = new Date().toISOString();
    writeDocDataAtomic(data);
    res.json(data.items[idx]);
});

app.delete('/api/documentation/items/:id', (req, res) => {
    const data = readDocData();
    const idx = data.items.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });

    const item = data.items[idx];
    if (item.type === 'file' && item.file?.filename) {
        const filePath = path.join(DOC_UPLOADS_DIR, item.file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    data.items.splice(idx, 1);
    writeDocDataAtomic(data);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));


