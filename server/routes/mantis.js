// ============================================================
// MANTIS ROUTES - KPIs, rafraîchissement des caches, exports, extraction complète
// ============================================================

const express = require('express');
const ExcelJS = require('exceljs');
const logger = require('../lib/logger');
const {
    MANTIS_SOURCES, getSource, priorityCache, MantisClient, fetchPriority, performMantisExport,
    matchesProject, performProjectExport, readCache, writeCacheAtomic, fetchFullIssueDetails
} = require('../lib/mantis');

const router = express.Router();

// --- Background Job State (per source) ---
const emptyJob = () => ({
    isRunning: false,
    current: 0,
    total: 0,
    startTime: null,
    success: 0,
    failed: 0,
    lastUpdate: null,
    error: null
});
const refreshJobs = Object.fromEntries(Object.keys(MANTIS_SOURCES).map(key => [key, emptyJob()]));

// --- Full Extraction Jobs State ---
let extractJobs = new Map();

router.get('/api/mantis/health', (req, res) => {
    const rid = `health-${Date.now()}`;
    logger.info(rid, '/api/mantis/health', 200, 'Health check OK');
    res.json({ ok: true, timestamp: new Date().toISOString() });
});

router.get('/api/mantis/kpis', (req, res) => {
    const rid = `kpi-${Date.now()}`;
    const source = getSource(req);
    if (!source) return res.status(400).json({ error: 'Unknown source' });
    try {
        const cache = readCache(source);
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

        // Matches both the login ("yann.deschamps") and the display name ("Yann Deschamps")
        const isYannAssignee = (row) => (row['Affecté à'] || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s.]/g, '') === 'yanndeschamps';

        // SD En cours logic (KPI Rules)
        const sd_en_cours_items = data.filter(row => {
            const category = (row['Catégorie'] || '').trim();
            const domaine = (row['Domaine (Toray)'] || '').trim();
            const isSD = category === 'SD' || domaine === 'SD';
            const isCorrectStatus = isKpiOpen(row);
            return isSD && isCorrectStatus && !isYannAssignee(row);
        });

        // SD Testable logic (Remains specific to "Résolu" for operational value, but within KPI Open scope)
        const sd_testable_items = data.filter(row => {
            const category = (row['Catégorie'] || '').trim();
            const domaine = (row['Domaine (Toray)'] || '').trim();
            const isSD = category === 'SD' || domaine === 'SD';
            const status = (row['État'] || row['Etat'] || '').trim().toLowerCase();
            const isResolu = status === 'résolu';
            return isSD && isResolu && isYannAssignee(row);
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

        // Evolution creations SD only
        const sdEvolutionWeekly = {};
        const sdEvolutionMonthly = {};

        const sd_items = all_except_rdd.filter(row => {
            const category = (row['Catégorie'] || '').trim();
            const domaine = (row['Domaine (Toray)'] || '').trim();
            return category === 'SD' || domaine === 'SD';
        });

        sd_items.forEach(row => {
            const submitDate = row['Date de soumission'];
            const isValidated = isKpiValidated(row);
            const week = getWeekStart(submitDate);
            const month = getMonthStart(submitDate);

            if (week && new Date(week) >= historyLimit) {
                if (!sdEvolutionWeekly[week]) sdEvolutionWeekly[week] = { label: week, created: 0, validated: 0 };
                sdEvolutionWeekly[week].created++;
            }

            if (month && new Date(month) >= historyLimit) {
                if (!sdEvolutionMonthly[month]) sdEvolutionMonthly[month] = { label: month, created: 0, validated: 0 };
                sdEvolutionMonthly[month].created++;
            }

            if (isValidated) {
                const solveDate = row['Mis à jour'];
                const solveWeek = getWeekStart(solveDate);
                const solveMonth = getMonthStart(solveDate);
                if (solveWeek && sdEvolutionWeekly[solveWeek]) sdEvolutionWeekly[solveWeek].validated++;
                if (solveMonth && sdEvolutionMonthly[solveMonth]) sdEvolutionMonthly[solveMonth].validated++;
            }
        });

        const sdEvolutionDataWeekly = Object.values(sdEvolutionWeekly).sort((a, b) => a.label.localeCompare(b.label));
        const sdEvolutionDataMonthly = Object.values(sdEvolutionMonthly).sort((a, b) => a.label.localeCompare(b.label));

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
                sd_evolution: {
                    weekly: sdEvolutionDataWeekly,
                    monthly: sdEvolutionDataMonthly
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

router.post('/api/mantis/export/xlsx', async (req, res) => {
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
        logger.info(rid, '/api/mantis/export/xlsx', 200, `Exported ${rows.length} rows`);
    } catch (e) {
        logger.error(rid, '/api/mantis/export/xlsx', 500, e.message);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message });
        }
    }
});



router.get('/api/mantis/refresh-status', (req, res) => {
    const source = getSource(req);
    if (!source) return res.status(400).json({ error: 'Unknown source' });
    const refreshJob = refreshJobs[source];
    res.json({
        ...refreshJob,
        progress: refreshJob.total > 0 ? (refreshJob.current / refreshJob.total) * 100 : 0,
        status: refreshJob.isRunning ? 'running' : refreshJob.error ? 'failed' : 'completed'
    });
});

router.get('/api/mantis/status/:id', (req, res) => {
    // For now we use the job status of the source
    const source = getSource(req);
    if (!source) return res.status(400).json({ error: 'Unknown source' });
    const refreshJob = refreshJobs[source];
    res.json({
        ...refreshJob,
        progress: refreshJob.total > 0 ? (refreshJob.current / refreshJob.total) * 100 : 0,
        status: refreshJob.isRunning ? 'running' : refreshJob.error ? 'failed' : (refreshJob.total > 0 ? 'completed' : 'idle')
    });
});


// Starts a background refresh of a source: returns { jobId } or { status, error }
const startRefresh = (source) => {
    const { queryId, projectName } = MANTIS_SOURCES[source];
    if (refreshJobs[source].isRunning) {
        return { status: 409, error: 'Refresh already in progress' };
    }
    if (!process.env.MANTIS_BASE_URL || !process.env.MANTIS_USERNAME || !process.env.MANTIS_PASSWORD) {
        return { status: 500, error: 'Missing configuration' };
    }

    const rid = `job-${Date.now()}`;
    const mantis = new MantisClient(rid);

    (async () => {
        const startTime = Date.now();
        const refreshJob = refreshJobs[source] = {
            ...emptyJob(),
            isRunning: true,
            startTime: new Date().toISOString()
        };

        try {
            const csv = projectName
                ? await performProjectExport(mantis, projectName)
                : await performMantisExport(mantis, false, queryId);
            if (logger.isHtml(csv)) {
                throw new Error('Mantis session expired or login required (HTML detected)');
            }

            const Papa = require('papaparse');
            let rows = Papa.parse(csv, { header: true, skipEmptyLines: true }).data;
            if (projectName) {
                // Safety net: keep only the requested project's tickets
                rows = rows.filter(row => matchesProject(row['Projet'], projectName));
                if (rows.length === 0) throw new Error(`Aucun ticket trouvé pour le projet "${projectName}"`);
            }


            refreshJob.total = rows.length;
            const concurrency = parseInt(process.env.MANTIS_ENRICH_CONCURRENCY || '8');

            // Incremental sync: reuse the priority of tickets untouched since the previous sync.
            // "Mis à jour" has no time, so tickets updated on (or after) the previous sync day are re-read.
            const previous = readCache(source);
            const previousSyncDay = previous && previous.lastUpdated ? previous.lastUpdated.slice(0, 10) : null;
            const previousRows = new Map();
            if (previousSyncDay && Array.isArray(previous.data)) {
                previous.data.forEach(row => previousRows.set(row['Identifiant'] || row['id'], row));
            }
            const reusablePriority = (row) => {
                const prev = previousRows.get(row['Identifiant'] || row['id']);
                const updated = row['Mis à jour'] || '';
                if (!prev || prev['priorite_p'] === undefined || prev['priorite_p'] === 'ERR') return undefined;
                if (!updated || updated !== prev['Mis à jour'] || updated >= previousSyncDay) return undefined;
                return prev['priorite_p'];
            };
            let reused = 0;

            // When the Mantis CSV export includes the P priority custom field, no ticket page is opened
            const csvPriorityColumn = Object.keys(rows[0] || {}).find(col => {
                const values = rows.map(row => (row[col] || '').trim()).filter(Boolean);
                return col !== 'priorite_p' && values.length > 0 && values.every(v => /^P[1-9]\b/.test(v));
            });
            if (csvPriorityColumn) console.log(`[Job:${source}] P priority read from CSV column "${csvPriorityColumn}"`);

            const enrichRow = async (row) => {
                const idAttr = row['Identifiant'] || row['id'];
                const known = csvPriorityColumn
                    ? ((row[csvPriorityColumn] || '').trim().match(/^P[1-9]/) || [''])[0]
                    : reusablePriority(row);
                if (csvPriorityColumn) {
                    row['priorite_p'] = known;
                    delete row[csvPriorityColumn];
                    if (known) refreshJob.success++;
                    else refreshJob.failed++;
                } else if (known !== undefined) {
                    row['priorite_p'] = known;
                    reused++;
                    if (known) refreshJob.success++;
                    else refreshJob.failed++;
                } else if (idAttr) {
                    const numericId = idAttr.replace(/^0+/, '');
                    // New or modified ticket: bypass the in-memory cache to read the current value
                    priorityCache.delete(numericId);
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
            };

            // Worker pool: a slow ticket no longer holds back a whole batch
            let nextIndex = 0;
            const worker = async () => {
                while (nextIndex < rows.length) {
                    await enrichRow(rows[nextIndex++]);
                }
            };
            await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

            writeCacheAtomic(rows, {
                totalRows: refreshJob.total,
                enriched: { total: refreshJob.current, success: refreshJob.success, failed: refreshJob.failed, reused }
            }, source);
            console.log(`[Job:${source}] Finished in ${((Date.now() - startTime) / 1000).toFixed(1)}s (${reused}/${rows.length} priorities reused)`);

        } catch (e) {
            console.error(`[Job:${source}] Failed:`, e.message);
            refreshJob.error = e.message;
        } finally {
            refreshJob.isRunning = false;
        }
    })();

    return { jobId: rid };
};

router.post('/api/mantis/refresh', (req, res) => {
    const source = getSource(req);
    if (!source) return res.status(400).json({ error: 'Unknown source' });
    const result = startRefresh(source);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ message: 'Refresh started', jobId: result.jobId });
});

router.get('/api/mantis/all', async (req, res) => {
    const rid = Date.now().toString();
    const source = getSource(req);
    if (!source) return res.status(400).json({ error: 'Unknown source', requestId: rid });
    try {
        const cache = readCache(source);
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


router.get('/api/mantis/priority-p', async (req, res) => {
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

router.post('/api/mantis/extract-full', async (req, res) => {
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
                await Promise.all(chunk.map(async (issue) => {
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

router.get('/api/mantis/extract-status/:jobId', (req, res) => {
    const job = extractJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({
        status: job.status,
        progress: job.progress,
        step: job.step,
        error: job.error
    });
});

router.get('/api/mantis/extract-download/:jobId', (req, res) => {
    const job = extractJobs.get(req.params.jobId);
    if (!job || job.status !== 'completed') return res.status(404).json({ error: 'Result not ready or job not found' });

    const now = new Date().toISOString().split('T')[0];
    let md = `# Extraction Mantis - Domaine ${job.domain} - le ${now}\n\n`;
    md += `*Généré par Dashboard Deloitte - Yann Deschamps*\n`;
    md += `*Nombre de tickets : ${job.data.length}*\n\n`;
    md += `---\n\n`;

    job.data.forEach(issue => {
        const id = issue['Identifiant'] || issue['id'];
        const summary = issue['Résumé'] || issue['summary'] || 'Sans titre';
        const d = issue.full_details || {};

        md += `## [${id}] ${summary}\n\n`;

        // Metadata Table-like list
        md += `### Informations Générales\n`;
        md += `- **ID**: ${id}\n`;
        md += `- **Domaine**: ${issue['Domaine (Toray)'] || 'SD'}\n`;
        md += `- **Catégorie**: ${issue['Catégorie'] || 'N/A'}\n`;
        md += `- **État**: ${issue['État'] || issue['Etat'] || 'N/A'}\n`;
        md += `- **Affecté à**: ${issue['Affecté à'] || 'N/A'}\n`;
        md += `- **Date soumission**: ${issue['Date de soumission'] || 'N/A'}\n`;
        md += `- **Mise à jour**: ${issue['Mis à jour'] || 'N/A'}\n`;
        md += `- **Priorité**: ${issue['priorite_p'] || 'N/A'}\n\n`;

        if (d.description) {
            md += `### Description\n${d.description}\n\n`;
        }
        if (d.steps_to_reproduce) {
            md += `### Étapes pour reproduire\n${d.steps_to_reproduce}\n\n`;
        }
        if (d.additional_info) {
            md += `### Informations supplémentaires\n${d.additional_info}\n\n`;
        }

        if (d.notes && d.notes.length > 0) {
            md += `### Historique des Notes (${d.notes.length})\n\n`;
            d.notes.forEach((note) => {
                md += `> **${note.author || 'N/A'}** (${note.date || ''})\n`;
                md += `> ${note.text}\n\n`;
            });
        }

        if (d.attachments && d.attachments.length > 0) {
            md += `### Pièces jointes\n`;
            d.attachments.forEach(att => {
                md += `- ${att.name} (Lien : ${process.env.MANTIS_BASE_URL}/${att.url})\n`;
            });
            md += `\n`;
        }

        md += `---\n\n`;
    });

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=mantis_extract_${job.domain}_${now}.md`);
    res.send(md);
});

module.exports = { router, startRefresh };
