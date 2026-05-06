import React, { useState, useMemo, useEffect } from 'react';
import DataTable from '../components/UI/DataTable';
import styles from './CoProNewPage.module.css';
import mantisStyles from './MantisPage.module.css';

const ASSIGNED_USERS = [
    'yann.deschamps',
    'lucas.pouchoulin',
    'anais.gines',
    'hugo.rouch',
    'mathilde.oger',
    'charlotte.vanderroost',
    'stephane.duprat'
];

const ENCOURS_STATES = ['nouveau', 'accepté', 'chiffrage', 'validation chiffrage', 'réalisation'];

const normalize = (val) => (val || '').toString().trim().toLowerCase();

const isP1OrP2 = (row) => {
    const priority = (row['priorite_p'] || '').toString().trim().toUpperCase();
    return priority.includes('P1') || priority.includes('P2');
};

const isNotRDD = (row) => {
    const domaine = (row['Domaine (Toray)'] || '').trim();
    return domaine !== 'RDD';
};

const isEncours = (row) => {
    const etat = normalize(row['État'] || row['Etat']);
    const affecte = normalize(row['Affecté à']);

    if (ENCOURS_STATES.includes(etat)) return true;
    if (etat === 'résolu' && !ASSIGNED_USERS.includes(affecte)) return true;
    return false;
};

const isResolue = (row) => {
    const etat = normalize(row['État'] || row['Etat']);
    const affecte = normalize(row['Affecté à']);
    return etat === 'résolu' && ASSIGNED_USERS.includes(affecte);
};

const CoProNewPage = () => {
    const [data, setData] = useState([]);
    const [mantisBaseUrl, setMantisBaseUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isCached, setIsCached] = useState(false);
    const [warning, setWarning] = useState(null);
    const [jobStatus, setJobStatus] = useState(null);
    const [diag, setDiag] = useState({ status: null, body: null });

    useEffect(() => {
        if (data.length === 0) fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        setDiag({ status: null, body: null });
        try {
            const response = await fetch('/api/mantis/all');
            const status = response.status;
            const text = await response.text();

            if (!response.ok) {
                setDiag({ status, body: text.slice(0, 300) });
                throw new Error(`Erreur serveur (${status})`);
            }

            const result = JSON.parse(text);
            setData(result.issues || []);
            setMantisBaseUrl(result.baseUrl || '');
            setLastUpdate(result.lastUpdate);
            setIsCached(!!result.isFromCache);
            if (result.warning) setWarning(result.warning);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setLoading(true);
        setError(null);
        setWarning(null);
        setDiag({ status: null, body: null });
        setJobStatus({ progress: 0, step: 'Démarrage du job...' });

        try {
            const startRes = await fetch('/api/mantis/refresh', { method: 'POST' });
            if (!startRes.ok) {
                const text = await startRes.text();
                setDiag({ status: startRes.status, body: text.slice(0, 300) });
                throw new Error(`Échec du démarrage du refresh (${startRes.status})`);
            }
            const { jobId } = await startRes.json();

            const poll = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/mantis/status/${jobId}`);
                    if (!statusRes.ok) return;
                    const status = await statusRes.json();
                    setJobStatus(status);

                    if (status.status === 'completed') {
                        clearInterval(poll);
                        setJobStatus(null);
                        fetchData();
                    } else if (status.status === 'failed') {
                        clearInterval(poll);
                        setError(status.error || 'Job échoué');
                        setJobStatus(null);
                        setLoading(false);
                    }
                } catch (e) {
                    console.error('Polling error', e);
                }
            }, 1500);

        } catch (err) {
            setError(err.message);
            setLoading(false);
            setJobStatus(null);
        }
    };

    const enrichSingleRow = async (id) => {
        try {
            const numericId = id.replace(/^0+/, '');
            const res = await fetch(`/api/mantis/priority-p?id=${numericId}`);
            if (!res.ok) return;
            const result = await res.json();
            if (result.priorite_p) {
                setData(prev => prev.map(row => {
                    const currentIdValue = row['Identifiant'] || row['id'];
                    if (currentIdValue === id) {
                        return { ...row, priorite_p: result.priorite_p };
                    }
                    return row;
                }));
            }
        } catch (e) {
            console.error('Enrichment failed', e);
        }
    };

    const { encoursData, resoluesData } = useMemo(() => {
        const baseFiltered = data.filter(row => isP1OrP2(row) && isNotRDD(row));
        return {
            encoursData: baseFiltered.filter(isEncours),
            resoluesData: baseFiltered.filter(isResolue)
        };
    }, [data]);

    const columns = useMemo(() => {
        if (data.length === 0) return [];
        const DEFAULT_ORDER = ['Identifiant', 'priorite_p', 'Affecté à', 'Catégorie', 'Mis à jour', 'État', 'Résumé', 'Domaine (Toray)'];
        let allKeys = Object.keys(data[0]);
        let sortedKeys = [...DEFAULT_ORDER.filter(key => allKeys.includes(key))];
        let remainingKeys = allKeys.filter(key => !DEFAULT_ORDER.includes(key));
        let finalKeys = [...sortedKeys, ...remainingKeys];

        return finalKeys.map(key => {
            if (key === 'Identifiant') {
                return {
                    header: 'Identifiant',
                    accessorKey: 'Identifiant',
                    id: 'Identifiant',
                    cell: ({ row }) => {
                        const id = row.original['Identifiant'];
                        if (!id) return null;
                        const numericId = id.replace(/^0+/, '');
                        const link = `${mantisBaseUrl}/view.php?id=${numericId}`;
                        return (
                            <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontWeight: '700' }}>
                                {id}
                            </a>
                        );
                    }
                };
            }
            if (key === 'priorite_p') {
                return {
                    header: 'Priorité (P)',
                    accessorKey: 'priorite_p',
                    id: 'priorite_p',
                    cell: ({ row, getValue }) => {
                        const val = getValue();
                        const id = row.original['Identifiant'] || row.original['id'];
                        if (val === undefined || val === '') {
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '0.75rem' }}>Non enrichi</span>
                                    <button onClick={() => enrichSingleRow(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-cyan)' }} title="Enrichir">↻</button>
                                </div>
                            );
                        }
                        const color = val.includes('P1') ? 'var(--color-rose)' : val.includes('P2') ? 'var(--color-amber)' : 'var(--color-primary)';
                        return <span style={{ fontWeight: '800', color, border: `1px solid ${color}`, padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.02)' }}>{val}</span>;
                    }
                };
            }
            return {
                header: key === 'Mis à jour' ? 'Mise à jour' : key === 'État' ? 'Etat' : key,
                accessorKey: key,
                id: key
            };
        });
    }, [data, mantisBaseUrl]);

    const rulesText = "Mantis P1/P2 uniquement | RDD exclus | Référents : yann.deschamps, lucas.pouchoulin, anais.gines, hugo.rouch, mathilde.oger, charlotte.vanderroost, stephane.duprat";

    return (
        <div className="mantis-container">
            <div className={mantisStyles.pageHeader}>
                <div>
                    <h2>CoPro New</h2>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>
                        <span style={{ color: isCached ? 'var(--color-amber)' : 'var(--color-emerald)' }}>
                            ● Source: {isCached ? 'Cache' : 'Fresh'}
                        </span>
                        <span title="Encours / Résolues / Total en cache">
                            ● Encours: {encoursData.length} | Résolues: {resoluesData.length} | Total: {data.length}
                        </span>
                        {lastUpdate && (
                            <span>● Last sync: {new Date(lastUpdate).toLocaleString()}</span>
                        )}
                    </div>
                </div>

                <div className={mantisStyles.statusContainer}>
                    <button onClick={handleRefresh} disabled={loading || !!jobStatus} className={mantisStyles.refreshBtn}>
                        {loading || jobStatus ? 'En cours...' : 'Synchroniser Mantis'}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ border: '1px solid var(--color-rose)', background: 'rgba(244, 63, 94, 0.05)', padding: '1.5rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                    <div style={{ fontWeight: 800, color: 'var(--color-rose)', marginBottom: '0.5rem' }}>CRITICAL: {error}</div>
                    {diag.status && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            HTTP Status: <strong>{diag.status}</strong>
                            <pre style={{ marginTop: '0.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', overflow: 'auto', maxHeight: '150px', whiteSpace: 'pre-wrap' }}>
                                {diag.body}
                            </pre>
                        </div>
                    )}
                </div>
            )}

            {warning && <div className={mantisStyles.warning}>{warning}</div>}

            {jobStatus && (
                <div className={mantisStyles.progressContainer}>
                    <div className={mantisStyles.progressHeader}>
                        <span className={mantisStyles.progressTitle}>Actualisation du cache Mantis</span>
                        <span className={mantisStyles.progressPercent}>{Math.round(jobStatus.progress || 0)}%</span>
                    </div>
                    <div className={mantisStyles.progressBarTrack}>
                        <div className={mantisStyles.progressBarFill} style={{ width: `${jobStatus.progress || 0}%` }} />
                    </div>
                    {jobStatus.step && <div className={mantisStyles.progressStep}>{jobStatus.step}</div>}
                </div>
            )}

            {/* Encours Section */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>
                        <span className={styles.dotEncours}></span>
                        Encours
                        <span className={styles.count}>{encoursData.length}</span>
                    </h3>
                    <div className={styles.sectionRules}>
                        État ∈ {'{Nouveau, Accepté, Chiffrage, Validation chiffrage, Réalisation}'} OU (État = Résolu ET Affecté à ∉ référents)
                    </div>
                </div>
                {encoursData.length > 0 ? (
                    <DataTable
                        data={encoursData}
                        columns={columns}
                        storageKey="copro_new_encours_column_order"
                        tabId="copro-new-encours"
                        filenamePrefix="copro_new_encours"
                    />
                ) : (
                    !loading && (
                        <div className={styles.emptyState}>
                            Aucune donnée correspondant aux critères Encours.
                        </div>
                    )
                )}
            </section>

            {/* Résolues Section */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>
                        <span className={styles.dotResolues}></span>
                        Résolues
                        <span className={styles.count}>{resoluesData.length}</span>
                    </h3>
                    <div className={styles.sectionRules}>
                        État = Résolu ET Affecté à ∈ référents
                    </div>
                </div>
                {resoluesData.length > 0 ? (
                    <DataTable
                        data={resoluesData}
                        columns={columns}
                        storageKey="copro_new_resolues_column_order"
                        tabId="copro-new-resolues"
                        filenamePrefix="copro_new_resolues"
                    />
                ) : (
                    !loading && (
                        <div className={styles.emptyState}>
                            Aucune donnée correspondant aux critères Résolues.
                        </div>
                    )
                )}
            </section>

            <div className={styles.rulesFooter}>
                <strong style={{ color: '#fff' }}>Règles communes :</strong>
                <span style={{ marginLeft: '0.75rem', color: 'var(--text-secondary)' }}>{rulesText}</span>
            </div>
        </div>
    );
};

export default CoProNewPage;
