// Shared data colors. The interface blue (--color-primary) is kept for UI only,
// so that a color in a chart or a badge always means the same thing.
// These are plain hex values: SVG chart attributes can't read CSS variables,
// so each one is chosen to stay readable on both the dark and the light theme.

export const PRIORITY_COLORS = {
    P1: '#dc2626',
    P2: '#d97706',
    P3: '#0d9488',
    'Non renseignée': '#94a3b8'
};

export const priorityColor = (value) => {
    const p = (value || '').toUpperCase();
    if (p.includes('P1')) return PRIORITY_COLORS.P1;
    if (p.includes('P2')) return PRIORITY_COLORS.P2;
    if (p.includes('P3')) return PRIORITY_COLORS.P3;
    return PRIORITY_COLORS['Non renseignée'];
};

export const FLOW_COLORS = {
    created: '#8b5cf6',
    closed: '#059669'
};

// Sequential scale for magnitudes (heatmaps): one hue, opacity carries the value
export const HEAT_RGB = '139, 92, 246';

// Categorical palette for domains, most distinct hues first (given to the biggest domains)
export const DOMAIN_PALETTE = [
    '#3b82f6', '#f97316', '#10b981', '#f43f5e', '#8b5cf6', '#eab308', '#06b6d4',
    '#ec4899', '#84cc16', '#a16207', '#14b8a6', '#d946ef', '#1d4ed8', '#78716c'
];
