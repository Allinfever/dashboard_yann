import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DataTable from '../components/UI/DataTable';
import CoproSummary from '../components/Mantis/CoproSummary';
import MantisFilters from '../components/Mantis/MantisFilters';
import MantisStats from '../components/Mantis/MantisStats';
import { applyMantisFilters, useMantisFilters } from '../utils/mantisFilters';
import { mantisTabsConfig } from '../config/mantisTabs.config';
import styles from './MantisPage.module.css';
import { priorityColor } from '../config/colors';
import { TriangleAlert, RefreshCw } from 'lucide-react';
import { formatSyncDate, loadErrorMessage, refreshErrorMessage, jobErrorMessage } from '../utils/mantisDisplay';

const MantisPage = ({ source = 'recette', title = 'Mantis' }) => {
    const [searchParams] = useSearchParams();
    const currentTab = searchParams.get('tab') || 'default';

    const [data, setData] = useState([]);
    const [mantisBaseUrl, setMantisBaseUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [warning, setWarning] = useState(null);
    const [jobStatus, setJobStatus] = useState(null);

    // Diagnostic info
    const [diag, setDiag] = useState({ status: null, body: null });

    // User filters, remembered per page
    const [userFilters, setUserFilters] = useMantisFilters(`mantis_filters_${source}`);

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
            const response = await fetch(`/api/mantis/all?source=${source}`);
            const status = response.status;
            const text = await response.text();

            if (!response.ok) {
                setDiag({ status, body: text.slice(0, 300) });
                throw new Error(loadErrorMessage(status));
            }

            const result = JSON.parse(text);
            setData(result.issues || []);
            setMantisBaseUrl(result.baseUrl || '');
            setLastUpdate(result.lastUpdate);
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
            const startRes = await fetch(`/api/mantis/refresh?source=${source}`, { method: 'POST' });
            if (!startRes.ok) {
                const text = await startRes.text();
                setDiag({ status: startRes.status, body: text.slice(0, 300) });
                throw new Error(refreshErrorMessage(startRes.status));
            }
            const { jobId } = await startRes.json();

            const poll = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/mantis/status/${jobId}?source=${source}`);
                    if (!statusRes.ok) return; // Keep polling if transient error
                    const status = await statusRes.json();
                    setJobStatus(status);

                    if (status.status === 'completed') {
                        clearInterval(poll);
                        setJobStatus(null);
                        fetchData();
                    } else if (status.status === 'failed') {
                        clearInterval(poll);
                        setError(jobErrorMessage(status.error));
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

    const displayedData = useMemo(
        () => applyMantisFilters(filteredData, userFilters),
        [filteredData, userFilters]
    );


    const columns = useMemo(() => {
        if (data.length === 0) return [];
        const DEFAULT_ORDER = ['Identifiant', 'priorite_p', 'Résumé', 'État', 'Affecté à', 'Mis à jour', 'Domaine (Toray)', 'Catégorie'];
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
                                    <span style={{ color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '0.75rem' }}>Non renseignée</span>
                                    <button onClick={() => enrichSingleRow(id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-cyan)' }} title="Relire la priorité dans Mantis">↻</button>
                                </div>
                            );
                        }
                        const color = priorityColor(val);
                        return <span style={{ fontWeight: '800', color, border: `1px solid ${color}`, padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', background: 'rgba(var(--fg-rgb),0.02)' }}>{val}</span>;
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
                    <h2>{title} - {currentTabConfig.label}</h2>
                    <div className={styles.pageMeta}>
                        <span>
                            {displayedData.length} ticket{displayedData.length > 1 ? 's' : ''} affiché{displayedData.length > 1 ? 's' : ''} sur {data.length}
                        </span>
                        {lastUpdate && (
                            <span>● Mis à jour le {formatSyncDate(lastUpdate)}</span>
                        )}
                    </div>
                </div>

                <div className={styles.statusContainer}>
                    <button onClick={handleRefresh} disabled={loading || !!jobStatus} className={styles.refreshBtn}>
                        <RefreshCw size={15} aria-hidden="true" className={loading || jobStatus ? 'spin' : ''} />
                        {loading || jobStatus ? 'Synchronisation...' : 'Synchroniser Mantis'}
                    </button>
                </div>
            </div>

            {error && (
                <div className={styles.error} style={{ border: '1px solid var(--color-rose)', background: 'rgba(244, 63, 94, 0.05)', padding: '1.5rem', borderRadius: '12px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--color-rose)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><TriangleAlert size={16} aria-hidden="true" /> {error}</div>
                    {diag.body && (
                        <details style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            <summary style={{ cursor: 'pointer' }}>Détails techniques</summary>
                            <pre style={{ marginTop: '0.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', overflow: 'auto', maxHeight: '150px', whiteSpace: 'pre-wrap' }}>
                                Code {diag.status} : {diag.body}
                            </pre>
                        </details>
                    )}
                </div>
            )}

            {warning && <div className={styles.warning}>{warning}</div>}

            {jobStatus && (
                <div className={styles.progressContainer}>
                    <div className={styles.progressHeader}>
                        <span className={styles.progressTitle}>Synchronisation avec Mantis</span>
                        <span className={styles.progressPercent}>{Math.round(jobStatus.progress || 0)}%</span>
                    </div>
                    <div className={styles.progressBarTrack}>
                        <div className={styles.progressBarFill} style={{ width: `${jobStatus.progress || 0}%` }} />
                    </div>
                    {jobStatus.step && <div className={styles.progressStep}>{jobStatus.step}</div>}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
                        {jobStatus.current} / {jobStatus.total} tickets traités
                    </div>
                </div>
            )}

            {currentTab !== 'synthese-copro' && filteredData.length > 0 && (
                <MantisFilters
                    data={filteredData}
                    filters={userFilters}
                    onChange={setUserFilters}
                    resultCount={displayedData.length}
                />
            )}

            {currentTab === 'synthese-copro' ? (
                <CoproSummary data={data} loading={loading} />
            ) : currentTab === 'statistiques' ? (
                data.length > 0 && <MantisStats data={displayedData} source={source} />
            ) : displayedData.length > 0 ? (
                <div>
                    <DataTable data={displayedData} columns={columns} storageKey="mantis_column_order_v2" tabId={currentTab} />
                    {currentTabConfig.rulesText && (
                        <div style={{ marginTop: '2rem', padding: '1.25rem', background: 'rgba(var(--fg-rgb),0.03)', borderRadius: '12px', border: '1px solid rgba(var(--fg-rgb),0.05)', fontSize: '0.85rem' }}>
                            <strong style={{ color: 'var(--text-strong)' }}>Règles de sélection :</strong>
                            <span style={{ marginLeft: '0.75rem', color: 'var(--text-secondary)' }}>{currentTabConfig.rulesText}</span>
                        </div>
                    )}
                </div>
            ) : (
                !loading && (
                    <div className="card" style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-dim)', borderStyle: 'dashed' }}>
                        {filteredData.length > 0
                            ? 'Aucun ticket ne correspond aux filtres sélectionnés.'
                            : 'Aucun ticket dans cet onglet pour le moment.'}
                    </div>
                )
            )}
        </div>
    );
};

export default MantisPage;
