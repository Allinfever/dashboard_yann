import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DataTable from '../components/UI/DataTable';
import CoproSummary from '../components/Mantis/CoproSummary';
import { mantisTabsConfig } from '../config/mantisTabs.config';
import styles from './MantisPage.module.css';

const MantisPage = () => {
    const [searchParams] = useSearchParams();
    const currentTab = searchParams.get('tab') || 'default';

    const [data, setData] = useState([]);
    const [mantisBaseUrl, setMantisBaseUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isCached, setIsCached] = useState(false);
    const [warning, setWarning] = useState(null);
    const [jobStatus, setJobStatus] = useState(null);

    // Diagnostic info
    const [diag, setDiag] = useState({ status: null, body: null });

    useEffect(() => {
        const isMantisTab = mantisTabsConfig.some(t => t.tabId === currentTab);
        if (isMantisTab && data.length === 0) {
            fetchData();
        }
    }, [currentTab]);

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
                    if (!statusRes.ok) return; // Keep polling if transient error
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

    const currentTabConfig = useMemo(() =>
        mantisTabsConfig.find(t => t.tabId === currentTab)
        , [currentTab]);

    const filteredData = useMemo(() => {
        if (!currentTabConfig || !data.length) return data;
        if (typeof currentTabConfig.filterFn === 'function') {
            return data.filter(currentTabConfig.filterFn);
        }
        return data;
    }, [data, currentTabConfig]);


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

    if (!currentTabConfig) return <div className={styles.error}>Vue non configurée : {currentTab}</div>;

    return (
        <div className="mantis-container">
            <div className={styles.pageHeader}>
                <div>
                    <h2>Mantis - {currentTabConfig.label}</h2>
                    {/* DIAGNOSTIC BAR */}
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>
                        <span style={{ color: isCached ? 'var(--color-amber)' : 'var(--color-emerald)' }}>
                            ● Source: {isCached ? 'Cache' : 'Fresh'}
                        </span>
                        <span title="Lignes dans cet onglet / Total en cache">
                            ● Nb lignes: {filteredData.length} / {data.length}
                        </span>

                        {lastUpdate && (
                            <span>● Last sync: {new Date(lastUpdate).toLocaleString()}</span>
                        )}
                    </div>
                </div>

                <div className={styles.statusContainer}>
                    <button onClick={handleRefresh} disabled={loading || !!jobStatus} className={styles.refreshBtn}>
                        {loading || jobStatus ? 'En cours...' : 'Synchroniser Mantis'}
                    </button>
                </div>
            </div>

            {error && (
                <div className={styles.error} style={{ border: '1px solid var(--color-rose)', background: 'rgba(244, 63, 94, 0.05)', padding: '1.5rem', borderRadius: '12px' }}>
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

            {warning && <div className={styles.warning}>{warning}</div>}

            {jobStatus && (
                <div className={styles.progressContainer}>
                    <div className={styles.progressHeader}>
                        <span className={styles.progressTitle}>Actualisation du cache Mantis</span>
                        <span className={styles.progressPercent}>{Math.round(jobStatus.progress || 0)}%</span>
                    </div>
                    <div className={styles.progressBarTrack}>
                        <div className={styles.progressBarFill} style={{ width: `${jobStatus.progress || 0}%` }} />
                    </div>
                    {jobStatus.step && <div className={styles.progressStep}>{jobStatus.step}</div>}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                        ID: {jobStatus.startTime} | En cours: {jobStatus.current}/{jobStatus.total}
                    </div>
                </div>
            )}

            {currentTab === 'synthese-copro' ? (
                <CoproSummary data={data} loading={loading} />
            ) : filteredData.length > 0 ? (
                <div>
                    <DataTable data={filteredData} columns={columns} storageKey="mantis_all_mantis_column_order" tabId={currentTab} />
                    {currentTabConfig.rulesText && (
                        <div style={{ marginTop: '2rem', padding: '1.25rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                            <strong style={{ color: '#fff' }}>Règles de sélection :</strong>
                            <span style={{ marginLeft: '0.75rem', color: 'var(--text-secondary)' }}>{currentTabConfig.rulesText}</span>
                        </div>
                    )}
                </div>
            ) : (
                !loading && (
                    <div className="card" style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-dim)', borderStyle: 'dashed' }}>
                        Aucune donnée correspondant aux critères.
                    </div>
                )
            )}
        </div>
    );
};

export default MantisPage;
