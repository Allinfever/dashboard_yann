// Roadmap Configuration
// All dates are editable via the UI and persisted in localStorage

export const DEFAULT_ROADMAP_DATA = {
    year: 2026,
    groups: [
        { id: 'recette', label: 'Recette', color: '#3b82f6' },
        { id: 'formations', label: 'Formations', color: '#ec4899' },
        { id: 'bascule', label: 'Bascule', color: '#22c55e' }
    ],
    items: [
        // Recette
        { id: 'tests-fonctionnels', group: 'recette', label: 'Tests fonctionnels', type: 'bar', startMonth: 1, endMonth: 6 },
        { id: 'reporting', group: 'recette', label: 'Reporting', type: 'bar', startMonth: 3, endMonth: 7 },
        { id: 'autorisations', group: 'recette', label: 'Autorisations', type: 'bar', startMonth: 5, endMonth: 8 },

        // Formations
        { id: 'plan-formation', group: 'formations', label: 'Plan de formation', type: 'bar', startMonth: 2, endMonth: 4 },
        { id: 'redaction-supports', group: 'formations', label: 'Rédaction supports', type: 'bar', startMonth: 4, endMonth: 7 },
        { id: 'formations', group: 'formations', label: 'Formations', type: 'bar', startMonth: 7, endMonth: 9 },

        // Bascule
        { id: 'plan-bascule', group: 'bascule', label: 'Plan de bascule', type: 'bar', startMonth: 3, endMonth: 5 },
        { id: 'bascule-blanc-1', group: 'bascule', label: 'Bascule à blanc #1', type: 'bar', startMonth: 5, endMonth: 6 },
        { id: 'bascule-blanc-2', group: 'bascule', label: 'Bascule à blanc #2', type: 'bar', startMonth: 6, endMonth: 7 },
        { id: 'bascule-blanc-3', group: 'bascule', label: 'Bascule à blanc #3', type: 'bar', startMonth: 8, endMonth: 9 },
        { id: 'preparation', group: 'bascule', label: 'Préparation', type: 'bar', startMonth: 9, endMonth: 10 },
        { id: 'hypercare', group: 'bascule', label: 'Hypercare', type: 'bar', startMonth: 10, endMonth: 12 },
        { id: 'go-live', group: 'bascule', label: 'GO-LIVE', type: 'milestone', month: 10 },
        { id: 'cloture-fiscale', group: 'bascule', label: 'Clôture fiscale FY25', type: 'milestone-dashed', month: 9 }
    ]
};

export const DEFAULT_DEADLINES = [
    { id: 'fin-recette', label: 'Fin de recette', startDate: '2026-06-01', endDate: '2026-08-31' },
    { id: 'redaction-support-formation', label: 'Rédaction supports', startDate: '2026-04-01', endDate: '2026-07-15' },
    { id: 'formation', label: 'Formation', startDate: '2026-07-15', endDate: '2026-09-30' },
    { id: 'cloture-fiscale', label: 'Clôture fiscale', startDate: '2026-09-01', endDate: '2026-09-15' },
    { id: 'go-live', label: 'Go live', startDate: '2026-10-01', endDate: '2026-10-01' },
    { id: 'demarrage-tf6', label: 'Démarrage TF6', startDate: '2026-10-15', endDate: '2026-10-31' }
];


export const MONTHS = [
    'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
    'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'
];
