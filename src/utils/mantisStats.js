// Statistics computed on a set of Mantis tickets (already filtered by the page)

const OPEN_STATES = ['nouveau', 'accepté', 'chiffrage', 'validation chiffrage', 'réalisation', 'résolu'];
const CLOSED_STATES = ['validé', 'fermé', 'annulé'];
const DAY = 24 * 60 * 60 * 1000;

export const PRIORITY_KEYS = ['P1', 'P2', 'P3', 'Non renseignée'];

const state = (row) => (row['État'] || row['Etat'] || '').trim().toLowerCase();
const priorityKey = (row) => {
    const p = (row['priorite_p'] || '').toUpperCase();
    if (p.includes('P1')) return 'P1';
    if (p.includes('P2')) return 'P2';
    if (p.includes('P3')) return 'P3';
    return 'Non renseignée';
};
const toDate = (value) => {
    const d = new Date(`${(value || '').slice(0, 10)}T00:00:00`);
    return isNaN(d.getTime()) ? null : d;
};
const daysSince = (value, today) => {
    const d = toDate(value);
    return d ? Math.floor((today - d) / DAY) : null;
};
const mondayOf = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
};
const emptyPriorities = () => Object.fromEntries(PRIORITY_KEYS.map(k => [k, 0]));
const median = (values) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

export const computeMantisStats = (rows, today = new Date()) => {
    const open = rows.filter(row => OPEN_STATES.includes(state(row)));
    const openAges = open.map(row => daysSince(row['Date de soumission'], today)).filter(a => a !== null);
    const thisWeek = mondayOf(today);

    // --- Key figures ---
    const kpis = {
        open: open.length,
        openP1: open.filter(row => priorityKey(row) === 'P1').length,
        created30: rows.filter(row => { const a = daysSince(row['Date de soumission'], today); return a !== null && a < 30; }).length,
        createdThisWeek: rows.filter(row => { const d = toDate(row['Date de soumission']); return d && d >= thisWeek; }).length,
        medianAge: median(openAges),
        meanAge: openAges.length ? Math.round(openAges.reduce((a, b) => a + b, 0) / openAges.length) : 0,
        stale: open.filter(row => { const a = daysSince(row['Mis à jour'], today); return a !== null && a > 30; }).length,
        suspended: rows.filter(row => state(row) === 'suspendu').length
    };

    // --- Weekly flow over 12 weeks (closing date approximated by "Mis à jour") ---
    const weeks = Array.from({ length: 12 }, (_, i) => {
        const start = new Date(thisWeek);
        start.setDate(start.getDate() - (11 - i) * 7);
        return { start, label: `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`, created: 0, closed: 0 };
    });
    const weekOf = (value) => {
        const d = toDate(value);
        if (!d) return null;
        const monday = mondayOf(d).getTime();
        return weeks.find(w => w.start.getTime() === monday) || null;
    };
    rows.forEach(row => {
        const created = weekOf(row['Date de soumission']);
        if (created) created.created++;
        if (CLOSED_STATES.includes(state(row))) {
            const closed = weekOf(row['Mis à jour']);
            if (closed) closed.closed++;
        }
    });

    // --- Age of open tickets by priority ---
    const ageBuckets = [
        { label: '< 7 j', max: 7 }, { label: '7–30 j', max: 30 }, { label: '30–90 j', max: 90 }, { label: '> 90 j', max: Infinity }
    ].map(b => ({ label: b.label, max: b.max, ...emptyPriorities() }));
    open.forEach(row => {
        const age = daysSince(row['Date de soumission'], today);
        if (age === null) return;
        ageBuckets.find(b => age < b.max)[priorityKey(row)]++;
    });

    // --- Open tickets: domain x priority, by state, by assignee ---
    const byDomain = {};
    const byAssignee = {};
    const byState = {};
    open.forEach(row => {
        const domain = (row['Domaine (Toray)'] || '').trim() || '(vide)';
        const assignee = (row['Affecté à'] || '').trim() || '(non affecté)';
        const key = priorityKey(row);
        (byDomain[domain] ||= { name: domain, ...emptyPriorities(), total: 0 })[key]++;
        byDomain[domain].total++;
        (byAssignee[assignee] ||= { name: assignee, ...emptyPriorities(), total: 0 })[key]++;
        byAssignee[assignee].total++;
        const label = row['État'] || row['Etat'] || '(vide)';
        byState[label] = (byState[label] || 0) + 1;
    });
    const stateOrder = (label) => {
        const i = OPEN_STATES.indexOf(label.trim().toLowerCase());
        return i === -1 ? OPEN_STATES.length : i;
    };

    return {
        kpis,
        weeks: weeks.map(({ label, created, closed }) => ({ label, created, closed })),
        ageBuckets: ageBuckets.map(b => ({ label: b.label, ...Object.fromEntries(PRIORITY_KEYS.map(k => [k, b[k]])) })),
        domains: Object.values(byDomain).sort((a, b) => b.total - a.total).slice(0, 10),
        assignees: Object.values(byAssignee).sort((a, b) => b.total - a.total).slice(0, 8),
        states: Object.entries(byState).map(([name, value]) => ({ name, value })).sort((a, b) => stateOrder(a.name) - stateOrder(b.name))
    };
};
