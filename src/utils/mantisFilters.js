import { useState, useEffect } from 'react';

// --- Filter definitions ---
export const FACETS = [
    { field: 'priorite_p', label: 'Priorité (P)' },
    { field: 'État', label: 'État' },
    { field: 'Affecté à', label: 'Affecté à' },
    { field: 'Domaine (Toray)', label: 'Domaine' },
    { field: 'Catégorie', label: 'Catégorie' },
    { field: 'Sévérité', label: 'Sévérité' },
    { field: 'Rapporteur', label: 'Rapporteur' }
];

export const DATE_FIELDS = [
    { field: 'Mis à jour', label: 'Mis à jour' },
    { field: 'Date de soumission', label: 'Soumis le' }
];

export const DATE_PRESETS = [
    { id: 'today', label: "Aujourd'hui" },
    { id: 'week', label: 'Cette semaine' },
    { id: '7d', label: '7 derniers jours' },
    { id: '30d', label: '30 derniers jours' },
    { id: 'month', label: 'Ce mois-ci' },
    { id: 'older30', label: 'Il y a plus de 30 jours' }
];

export const EMPTY_LABEL = '(vide)';
export const EMPTY_FILTERS = { facets: {}, dates: {} };

// --- Helpers ---
export const valueOf = (row, field) => (row[field] ?? '').toString().trim();

const isoDay = (date) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
};

const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return isoDay(d);
};

// Resolves a stored date filter into a { from, to } range of "YYYY-MM-DD" strings
export const resolveRange = (filter) => {
    if (!filter) return null;
    const today = isoDay(new Date());
    switch (filter.preset) {
        case 'today': return { from: today, to: today };
        case 'week': {
            const d = new Date();
            const day = d.getDay() === 0 ? 7 : d.getDay();
            return { from: daysAgo(day - 1), to: today };
        }
        case '7d': return { from: daysAgo(6), to: today };
        case '30d': return { from: daysAgo(29), to: today };
        case 'month': return { from: today.slice(0, 8) + '01', to: today };
        case 'older30': return { from: '', to: daysAgo(31) };
        default: return { from: filter.from || '', to: filter.to || '' };
    }
};

export const describeDate = (filter) => {
    const preset = DATE_PRESETS.find(p => p.id === filter.preset);
    if (preset) return preset.label;
    const fmt = (d) => d.split('-').reverse().join('/');
    if (filter.from && filter.to) return `du ${fmt(filter.from)} au ${fmt(filter.to)}`;
    if (filter.from) return `depuis le ${fmt(filter.from)}`;
    return `jusqu'au ${fmt(filter.to)}`;
};

export const hasDateFilter = (filter) => !!(filter && (filter.preset || filter.from || filter.to));

export const rowMatches = (row, filters, skipField = null) => {
    for (const [field, values] of Object.entries(filters.facets)) {
        if (field === skipField || !values || values.length === 0) continue;
        if (!values.includes(valueOf(row, field))) return false;
    }
    for (const [field, filter] of Object.entries(filters.dates)) {
        if (field === skipField || !hasDateFilter(filter)) continue;
        const range = resolveRange(filter);
        const day = valueOf(row, field).slice(0, 10).replace(/\//g, '-');
        if (!day) return false;
        if (range.from && day < range.from) return false;
        if (range.to && day > range.to) return false;
    }
    return true;
};

export const applyMantisFilters = (rows, filters) =>
    rows.filter(row => rowMatches(row, filters));

const loadFilters = (storageKey) => {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (saved && saved.facets && saved.dates) return saved;
    } catch {
        // Ignore unreadable storage
    }
    return EMPTY_FILTERS;
};

export const useMantisFilters = (storageKey) => {
    const [filters, setFilters] = useState(() => loadFilters(storageKey));
    useEffect(() => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(filters));
        } catch {
            // Storage unavailable: filters simply aren't remembered
        }
    }, [filters, storageKey]);
    return [filters, setFilters];
};

