/**
 * Computes the summary for the CoPro tab based on the Mantis dataset.
 * @param {Array} rows - The full Mantis dataset.
 * @returns {Object} The computed stats.
 */
export const computeCoproSummary = (rows) => {
    const defaultStats = () => ({ total: 0, p1: 0, p3: 0 });

    const stats = {
        encours: {
            projet: defaultStats(),
            evolution: defaultStats()
        },
        resolues: {
            projet: defaultStats(),
            evolution: defaultStats()
        }
    };

    if (!rows || rows.length === 0) return stats;

    const normalize = (str) => (str || '').toString().trim().toLowerCase();

    const encoursStatesSet = new Set(["nouveau", "accepté", "chiffrage", "validation chiffrage", "réalisation"]);

    rows.forEach(row => {
        const domaine = normalize(row['Domaine (Toray)'] || row['domaine']);
        const category = normalize(row['Catégorie'] || row['category']);
        const etat = normalize(row['État'] || row['Etat'] || row['status']);
        const affecte = normalize(row['Affecté à'] || row['handler']);
        const priority = (row['priorite_p'] || '').toString().trim().toUpperCase();

        // Rule: Domaine must be "SD"
        if (domaine !== 'sd') return;

        // Determine category type
        let catType = null;
        if (category === 'projet') {
            catType = 'projet';
        } else if (category.includes('toray') && category.includes('ecart')) {
            catType = 'evolution';
        }

        if (!catType) return;

        // Encours Logic
        const isEncours = encoursStatesSet.has(etat) || (etat === 'résolu' && affecte !== 'yann.deschamps');

        // Résolues Logic
        const isResolue = etat === 'résolu' && affecte === 'yann.deschamps';

        if (isEncours) {
            stats.encours[catType].total++;
            if (priority === 'P1') stats.encours[catType].p1++;
            if (priority === 'P3') stats.encours[catType].p3++;
        } else if (isResolue) {
            stats.resolues[catType].total++;
            if (priority === 'P1') stats.resolues[catType].p1++;
            if (priority === 'P3') stats.resolues[catType].p3++;
        }
    });

    return stats;
};

export const COPRO_RULES = [
    { rule: "Domaine", desc: "SD uniquement (colonne Domaine (Toray))" },
    { rule: "Encours", desc: "État ∈ {Nouveau, Accepté, Chiffrage, Validation chiffrage, Réalisation} OU (État = Résolu ET Affecté à ≠ 'yann.deschamps')" },
    { rule: "Résolues", desc: "État = Résolu ET Affecté à = 'yann.deschamps'" },
    { rule: "Projet", desc: "Catégorie = 'Projet'" },
    { rule: "Evolution", desc: "Catégorie contient 'Toray' et 'Ecart' (ex: [Toray] Ecart)" },
    { rule: "Priorités", desc: "Sous-totaux P1 / P3 basés sur l'enrichissement Priorité (P)" }
];
