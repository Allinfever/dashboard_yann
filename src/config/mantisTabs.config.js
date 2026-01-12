const isInCurrentWeek = (dateString) => {
    if (!dateString) return false;
    // Standardize string: replace "/" with "-" if needed, though Mantis usually uses YYYY-MM-DD
    const date = new Date(dateString.replace(/\//g, '-'));
    if (isNaN(date.getTime())) return false;

    const now = new Date();
    // Monday 00:00:00
    const monday = new Date(now);
    const day = now.getDay(); // 0 is Sunday
    const diff = (day === 0 ? -6 : 1) - day; // Go back to Monday
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    // Sunday 23:59:59
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return date >= monday && date <= sunday;
};

export const mantisTabsConfig = [

    {
        tabId: 'synthese-copro',
        label: 'Synthèse CoPro',
        filterFn: () => true,
        rulesText: ''
    },
    {
        tabId: 'sd-en-cours',
        label: 'SD en cours',
        filterFn: (row) => {
            // Catégorie = "SD" (Matches either Catégorie or Domaine (Toray))
            const category = (row['Catégorie'] || '').trim();
            const domaine = (row['Domaine (Toray)'] || '').trim();
            const isSD = category === 'SD' || domaine === 'SD';

            // Etat ∈ { "Nouveau", "accepté", "chiffrage", "validation chiffrage", "réalisation", "résolu" }
            const status = (row['État'] || row['Etat'] || '').trim().toLowerCase();
            const validStatuses = [
                'nouveau',
                'accepté',
                'chiffrage',
                'validation chiffrage',
                'réalisation',
                'résolu'
            ];
            const isCorrectStatus = validStatuses.includes(status);

            // Affecté à != "yann.deschamps"
            const assignee = (row['Affecté à'] || '').trim().toLowerCase();
            const isNotYann = assignee !== 'yann.deschamps';

            return isSD && isCorrectStatus && isNotYann;
        },
        rulesText: 'Catégorie = SD | État ∈ { Nouveau, Accepté, Chiffrage, Validation chiffrage, Réalisation, Résolu } | Affecté à ≠ yann.deschamps'
    },
    {
        tabId: 'sd-testable',
        label: 'SD Testable',
        filterFn: (row) => {
            // Catégorie = "SD"
            const category = (row['Catégorie'] || '').trim();
            const domaine = (row['Domaine (Toray)'] || '').trim();
            const isSD = category === 'SD' || domaine === 'SD';

            // Etat = "résolu"
            const status = (row['État'] || row['Etat'] || '').trim().toLowerCase();
            const isResolut = status === 'résolu';

            // Affecté à = "yann.deschamps"
            const assignee = (row['Affecté à'] || '').trim().toLowerCase();
            const isYann = assignee === 'yann.deschamps';

            return isSD && isResolut && isYann;
        },
        rulesText: 'Catégorie = SD | État = Résolu | Affecté à = yann.deschamps'
    },
    {
        tabId: 'minutes-created',
        label: 'Minutes - Created',
        filterFn: (row) => {
            const domaine = (row['Domaine (Toray)'] || '').trim();
            const dateSoumission = row['Date de soumission'];
            return domaine === 'SD' && isInCurrentWeek(dateSoumission);
        },
        rulesText: 'Domaine (Toray) = SD | Date de soumission = Semaine en cours'
    },
    {
        tabId: 'minutes-tested',
        label: 'Minutes - Tested',
        filterFn: (row) => {
            const domaine = (row['Domaine (Toray)'] || '').trim();
            const dateMAJ = row['Mis à jour'];
            return domaine === 'SD' && isInCurrentWeek(dateMAJ);
        },
        rulesText: 'Domaine (Toray) = SD | Mise à jour = Semaine en cours'
    },
    {
        tabId: 'mantis-rdd',

        label: 'Mantis RDD',
        filterFn: (row) => {
            const domaine = (row['Domaine (Toray)'] || '').trim();
            return domaine === 'RDD';
        },
        rulesText: 'Domaine (Toray) = RDD'
    },
    {
        tabId: 'all-mantis',
        label: 'All Mantis',
        filterFn: () => true,
        rulesText: ''
    }
];
