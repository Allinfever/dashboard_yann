// Display helpers shared by the Mantis pages (French labels, readable messages)

const pad = (n) => String(n).padStart(2, '0');

// "2026-11-01T06:02:00Z" -> "01/11/2026 à 07:02"
export const formatSyncDate = (iso) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const loadErrorMessage = (status) => status === 404
    ? 'Aucune donnée pour l\'instant : cliquez sur « Synchroniser Mantis ».'
    : `Impossible de charger les tickets (erreur ${status}).`;

export const refreshErrorMessage = (status) => {
    if (status === 409) return 'Une synchronisation est déjà en cours, réessayez dans un instant.';
    if (status === 500) return 'Le serveur n\'est pas configuré pour accéder à Mantis.';
    return `La synchronisation n'a pas pu démarrer (erreur ${status}).`;
};

export const jobErrorMessage = (message = '') => {
    if (/auth failed|login required|session expired/i.test(message)) return 'Mantis a refusé la connexion : vérifiez les identifiants du dashboard.';
    if (/timeout|ECONN|ENOTFOUND|socket hang up/i.test(message)) return 'Mantis ne répond pas, réessayez plus tard.';
    return `La synchronisation a échoué : ${message || 'erreur inconnue'}.`;
};
