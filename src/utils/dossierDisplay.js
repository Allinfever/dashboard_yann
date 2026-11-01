export const ETATS = {
    ok: { label: 'En bonne voie', color: 'var(--color-emerald)' },
    attention: { label: 'À surveiller', color: 'var(--color-amber)' },
    bloque: { label: 'Bloqué', color: 'var(--color-rose)' },
    termine: { label: 'Terminé', color: 'var(--text-muted)' }
};

export const SOURCE_TYPES = {
    email: 'Email',
    teams: 'Teams',
    mantis: 'Mantis',
    document: 'Document',
    tableur: 'Tableur',
    web: 'Web',
    image: 'Image',
    note: 'Note'
};

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : dateFormat.format(d);
};
