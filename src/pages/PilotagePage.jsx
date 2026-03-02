import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ResponsiveContainer,
    LineChart, Line,
    BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    PieChart, Pie, Cell,
    AreaChart, Area
} from 'recharts';
import { Clock, CheckCircle, AlertCircle, TrendingUp, Inbox } from 'lucide-react';
import { DEFAULT_DEADLINES } from '../config/roadmapConfig';
import styles from './PilotagePage.module.css';

const DEADLINES_STORAGE_KEY = 'pilotage_deadlines_v2';

const PRIORITY_COLORS = {
    p1: '#dc2626',
    p2: '#ea580c',
    p3: '#3b82f6',
    nonPrio: '#94a3b8'
};

const DOMAIN_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
];

const CHART_TOOLTIP_STYLE = {
    contentStyle: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid #334155',
        borderRadius: '8px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
        padding: '10px'
    },
    itemStyle: {
        color: '#f8fafc',
        fontSize: '12px',
        fontWeight: 500
    },
    labelStyle: {
        color: '#94a3b8',
        fontSize: '11px',
        marginBottom: '4px',
        fontWeight: 600,
        textTransform: 'uppercase'
    }
};

const buildDonutGradient = (kpis) => {
    const { p1, p2, p3, non_prio, total } = kpis;
    if (total === 0) return 'conic-gradient(#e2e8f0 0deg 360deg)';
    const segments = [];
    let currentAngle = 0;
    const addSegment = (count, color) => {
        if (count > 0) {
            const angle = (count / total) * 360;
            segments.push(`${color} ${currentAngle}deg ${currentAngle + angle}deg`);
            currentAngle += angle;
        }
    };
    if (p1) addSegment(p1, PRIORITY_COLORS.p1);
    if (p2) addSegment(p2, PRIORITY_COLORS.p2);
    if (p3) addSegment(p3, PRIORITY_COLORS.p3);
    if (non_prio) addSegment(non_prio, PRIORITY_COLORS.nonPrio);
    return `conic-gradient(${segments.join(', ')})`;
};

const PilotagePage = () => {
    const navigate = useNavigate();
    const [kpis, setKpis] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [errorCode, setErrorCode] = useState(null);
    const [deadlines, setDeadlines] = useState(() => {
        const saved = localStorage.getItem(DEADLINES_STORAGE_KEY);
        return saved ? JSON.parse(saved) : DEFAULT_DEADLINES;
    });

    useEffect(() => {
        localStorage.setItem(DEADLINES_STORAGE_KEY, JSON.stringify(deadlines));
    }, [deadlines]);

    const fetchKPIs = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/mantis/kpis');
            const result = await res.json();
            if (res.ok) {
                setKpis(result);
                setError(null);
                setErrorCode(null);
            } else {
                setError(result.error || 'Erreur lors du chargement des KPIs');
                setErrorCode(result.code);
            }
        } catch (e) {
            setError('Impossible de contacter le serveur');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchKPIs();
    }, []);


    const [evolutionMode, setEvolutionMode] = useState('monthly');

    const updateDeadline = (id, field, value) => {
        setDeadlines(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
    };

    const resetDeadlines = () => {
        setDeadlines(DEFAULT_DEADLINES);
        localStorage.removeItem(DEADLINES_STORAGE_KEY);
    };

    const getDeadlineStatus = (startDate, endDate) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (today < start) return 'upcoming';
        if (today >= start && today <= end) return 'ongoing';
        return 'passed';
    };

    const renderDonut = (title, data, tabId) => {
        const gradient = buildDonutGradient(data);
        return (
            <div className={styles.donutCard}>
                <h4 className={styles.donutTitle}>{title}</h4>
                <div className={styles.donutWrapper}>
                    <div className={styles.donut} style={{ background: gradient }} onClick={() => navigate(`/mantis?tab=${tabId}`)}>
                        <div className={styles.donutCenter}>
                            <span className={styles.donutTotal}>{data.total}</span>
                            <span className={styles.donutLabel}>Total</span>
                        </div>
                    </div>
                    <div className={styles.legend}>
                        <div className={styles.legendItem} onClick={() => navigate(`/mantis?tab=${tabId}`)}>
                            <span className={styles.legendDot} style={{ backgroundColor: PRIORITY_COLORS.p1 }}></span>
                            <span className={styles.legendText}>P1: {data.p1}</span>
                        </div>
                        <div className={styles.legendItem} onClick={() => navigate(`/mantis?tab=${tabId}`)}>
                            <span className={styles.legendDot} style={{ backgroundColor: PRIORITY_COLORS.p2 }}></span>
                            <span className={styles.legendText}>P2: {data.p2}</span>
                        </div>
                        <div className={styles.legendItem} onClick={() => navigate(`/mantis?tab=${tabId}`)}>
                            <span className={styles.legendDot} style={{ backgroundColor: PRIORITY_COLORS.p3 }}></span>
                            <span className={styles.legendText}>P3: {data.p3}</span>
                        </div>
                        <div className={styles.legendItem} onClick={() => navigate(`/mantis?tab=${tabId}`)}>
                            <span className={styles.legendDot} style={{ backgroundColor: PRIORITY_COLORS.nonPrio }}></span>
                            <span className={styles.legendText}>Non prio: {data.non_prio}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (loading) return <div className="card"><div className={styles.loading}>Chargement des indicateurs...</div></div>;

    if (error) {
        return (
            <div className="card">
                <div className={styles.error} style={{ textAlign: 'center', padding: '3rem' }}>
                    <p style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>{error}</p>
                    {errorCode === 'CACHE_MISSING' ? (
                        <button onClick={() => navigate('/mantis?tab=all-mantis')} className={styles.primaryBtn}>Lancer une synchronisation Mantis</button>
                    ) : (
                        <button onClick={() => window.location.reload()} className={styles.secondaryBtn}>Réessayer</button>
                    )}
                </div>
            </div>
        );
    }

    const { global } = kpis;
    const evolutionData = global.evolution[evolutionMode];
    const lastPeriod = evolutionData[evolutionData.length - 1] || { created: 0 };

    return (
        <div className="card">
            <div className={styles.pageHeader}>
                <h2 className={styles.pageTitle}>Pilotage</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {kpis.last_sync && (
                        <span className={styles.lastSync}>
                            Dernière synchro : {new Date(kpis.last_sync).toLocaleString()}
                        </span>
                    )}
                    <button onClick={fetchKPIs} className={styles.resetBtn} style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ↻ Actualiser
                    </button>
                </div>
            </div>

            {/* Section 1: Deadlines */}
            <section className={styles.deadlinesSection}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>📅 Deadlines</h3>
                    <button onClick={resetDeadlines} className={styles.resetBtn}>Réinitialiser</button>
                </div>
                <div className={styles.deadlinesGrid}>
                    {deadlines.map(deadline => {
                        const status = getDeadlineStatus(deadline.startDate, deadline.endDate);
                        return (
                            <div key={deadline.id} className={styles.deadlineChip}>
                                <div className={styles.deadlineTop}>
                                    <span className={styles.deadlineLabel}>{deadline.label}</span>
                                    <span className={`${styles.statusBadge} ${styles[status]}`}>
                                        {status === 'upcoming' ? 'À venir' : status === 'ongoing' ? 'En cours' : 'Échu'}
                                    </span>
                                </div>
                                <div className={styles.deadlineDates}>
                                    <input type="date" value={deadline.startDate} onChange={(e) => updateDeadline(deadline.id, 'startDate', e.target.value)} className={styles.dateInput} />
                                    <span>→</span>
                                    <input type="date" value={deadline.endDate} onChange={(e) => updateDeadline(deadline.id, 'endDate', e.target.value)} className={styles.dateInput} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Section 2: KPI SD (Existing) */}
            <section className={styles.kpiSection}>
                <h3 className={styles.sectionTitle}>🎯 KPI’s SD</h3>
                <div className={styles.donutGrid}>
                    {renderDonut('SD en cours', kpis.sd_en_cours, 'sd-en-cours')}
                    {renderDonut('SD Testable', kpis.sd_testable, 'sd-testable')}
                </div>
            </section>

            {/* Section 3: Global KPIs */}
            <section className={styles.globalSection}>
                <h3 className={styles.sectionTitle}>🌎 KPI’s SD – Global</h3>

                <div className={styles.kpiGrid}>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiLabel}>Backlog Total <span style={{ fontSize: '0.6rem', opacity: 0.6 }}> (HORS RDD)</span></div>
                        <div className={styles.kpiValue} style={{ color: PRIORITY_COLORS.p3 }}>{global.backlog.total}</div>
                        <div className={styles.kpiSubValue}><Inbox size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Tickets ouverts</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiLabel}>Âge Moyen <span style={{ fontSize: '0.6rem', opacity: 0.6 }}> (HORS RDD)</span></div>
                        <div className={styles.kpiValue} style={{ color: global.backlog.age_moyen > 30 ? PRIORITY_COLORS.p1 : '#fff' }}>
                            {global.backlog.age_moyen} <span style={{ fontSize: '1rem', fontWeight: 500 }}>jours</span>
                        </div>
                        <div className={styles.kpiSubValue}><Clock size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Temps d'ouverture</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiLabel}>Résolution (Global) <span style={{ fontSize: '0.6rem', opacity: 0.6 }}> (HORS RDD)</span></div>
                        <div className={styles.kpiValue} style={{ color: 'var(--color-emerald)' }}>
                            {global.resolution.global} <span style={{ fontSize: '1rem', fontWeight: 500 }}>jours</span>
                        </div>
                        <div className={styles.kpiSubValue}><CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Temps de traitement</div>
                    </div>
                    <div className={styles.kpiCard}>
                        <div className={styles.kpiLabel}>Flux de création <span style={{ fontSize: '0.6rem', opacity: 0.6 }}> (HORS RDD)</span></div>
                        <div className={styles.kpiValue} style={{ color: 'var(--color-amber)' }}>
                            {lastPeriod.created}
                        </div>
                        <div className={styles.kpiSubValue}><TrendingUp size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> {evolutionMode === 'weekly' ? 'Semaine actuelle' : 'Mois actuel'}</div>
                    </div>
                </div>

                <div className={styles.chartGrid}>
                    {/* Evolution Chart */}
                    <div className={styles.chartCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h4 className={styles.chartTitle} style={{ marginBottom: 0 }}>Évolution des créations (12 mois)</h4>
                            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px' }}>
                                <button
                                    onClick={() => setEvolutionMode('weekly')}
                                    style={{
                                        padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '0.75rem', cursor: 'pointer',
                                        background: evolutionMode === 'weekly' ? 'var(--color-primary)' : 'transparent',
                                        color: evolutionMode === 'weekly' ? '#fff' : 'var(--text-dim)'
                                    }}
                                >Semaine</button>
                                <button
                                    onClick={() => setEvolutionMode('monthly')}
                                    style={{
                                        padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '0.75rem', cursor: 'pointer',
                                        background: evolutionMode === 'monthly' ? 'var(--color-primary)' : 'transparent',
                                        color: evolutionMode === 'monthly' ? '#fff' : 'var(--text-dim)'
                                    }}
                                >Mois</button>
                            </div>
                        </div>
                        <div className={styles.chartContainer}>
                            <ResponsiveContainer>
                                <LineChart data={evolutionData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={(val) => val.slice(5)} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                                    <Legend />
                                    <Line type="monotone" dataKey="created" name="Créations" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    <Line type="monotone" dataKey="validated" name="Validées" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* SD Evolution Chart */}
                    <div className={styles.chartCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h4 className={styles.chartTitle} style={{ marginBottom: 0 }}>Évolution des créations SD (12 mois)</h4>
                        </div>
                        <div className={styles.chartContainer}>
                            <ResponsiveContainer>
                                <LineChart data={global.sd_evolution[evolutionMode]}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={(val) => val.slice(5)} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                                    <Legend />
                                    <Line type="monotone" dataKey="created" name="Créations SD" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                                    <Line type="monotone" dataKey="validated" name="Validées SD" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Domain Distribution */}
                    <div className={styles.chartCard} style={{ display: 'flex', flexDirection: 'column' }}>
                        <h4 className={styles.chartTitle}>Répartition par Domaine <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'none', fontWeight: 400 }}>(Hors RDD)</span></h4>
                        <div className={styles.chartContainer} style={{ position: 'relative' }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={global.domaines.slice(0, 12)} innerRadius={65} outerRadius={95} paddingAngle={4} dataKey="value" stroke="none">
                                        {global.domaines.slice(0, 12).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={DOMAIN_COLORS[index % DOMAIN_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{global.domaines.reduce((acc, d) => acc + d.value, 0)}</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Total</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '1.5rem' }}>
                            {global.domaines.slice(0, 12).map((d, i) => (
                                <div key={i} style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: DOMAIN_COLORS[i % DOMAIN_COLORS.length] }}></div>
                                    <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{d.name}</span>
                                    <span style={{ fontWeight: 700, color: '#fff', marginLeft: 'auto' }}>{d.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Backlog Evolution */}
                    <div className={styles.chartCard}>
                        <h4 className={styles.chartTitle}>Évolution du nombre de Mantis ouvertes (12 mois)</h4>
                        <div className={styles.chartContainer}>
                            <ResponsiveContainer>
                                <AreaChart data={global.backlog_history[evolutionMode]}>
                                    <defs>
                                        <linearGradient id="colorBacklog" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={(val) => val.slice(5)} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        name="Mantis Ouvertes"
                                        stroke="#f59e0b"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorBacklog)"
                                        animationDuration={1500}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Open Mantis by Domain */}
                    <div className={styles.chartCard} style={{ display: 'flex', flexDirection: 'column' }}>
                        <h4 className={styles.chartTitle}>Répartition des Mantis ouvertes par domaine</h4>
                        <div className={styles.chartContainer} style={{ position: 'relative' }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie
                                        data={global.open_by_domain.slice(0, 8)}
                                        innerRadius={65}
                                        outerRadius={95}
                                        paddingAngle={4}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {global.open_by_domain.slice(0, 8).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={DOMAIN_COLORS[index % DOMAIN_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip {...CHART_TOOLTIP_STYLE} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>
                                    {global.open_by_domain.reduce((acc, d) => acc + d.value, 0)}
                                </div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Ouvertes</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '1.5rem' }}>
                            {global.open_by_domain.slice(0, 8).map((d, i) => {
                                const total = global.open_by_domain.reduce((acc, curr) => acc + curr.value, 0);
                                const percent = total > 0 ? Math.round((d.value / total) * 100) : 0;
                                return (
                                    <div key={i} style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: DOMAIN_COLORS[i % DOMAIN_COLORS.length] }}></div>
                                        <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                                        <span style={{ fontWeight: 700, color: '#fff', marginLeft: 'auto' }}>{d.value} <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>({percent}%)</span></span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </section>

            {/* Section 4: Methodology Section */}
            <section className={styles.methodologySection}>
                <h3 className={styles.sectionTitle} style={{ color: '#fff' }}>📘 Définitions / Méthodologie KPI</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                    Tous les indicateurs ci-dessous sont calculés dynamiquement depuis le cache Mantis. <strong>Attention : Le domaine "RDD" est systématiquement exclu des calculs globaux.</strong>
                </p>
                <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderLeft: '4px solid var(--color-primary)', borderRadius: '4px' }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>🔍 Règles de classification des statuts (KPI uniquement)</p>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                        Les indicateurs utilisent une classification métier différente de l'affichage brut Mantis : <br />
                        • <strong>EN COURS :</strong> Nouveau, Accepté, Validation chiffrage, Réalisation, Résolu.<br />
                        • <strong>FERMÉES :</strong> Fermé, Validé, Suspendu, Annulé.
                    </p>
                </div>
                <div className={styles.methodologyGrid}>
                    <div className={styles.methodItem}>
                        <span className={styles.methodTitle}>Backlog Total</span>
                        <p className={styles.methodDesc}>Nombre total de tickets en cours (incluant "Résolu"). Représente la charge de travail restant à valider hors RDD.</p>
                        <span className={styles.methodRule}>État ∈ EN COURS</span>
                    </div>
                    <div className={styles.methodItem}>
                        <span className={styles.methodTitle}>Âge Moyen</span>
                        <p className={styles.methodDesc}>Nombre moyen de jours depuis la soumission pour tous les tickets en cours. Identifie l'ancienneté du stock.</p>
                        <span className={styles.methodRule}>Aujourd'hui - Date de soumission</span>
                    </div>
                    <div className={styles.methodItem}>
                        <span className={styles.methodTitle}>Temps de Résolution / Validation</span>
                        <p className={styles.methodDesc}>Délai moyen entre la création et la clôture finale (Fermé/Validé/etc.). Exclut le statut intermédiaire "Résolu".</p>
                        <span className={styles.methodRule}>Date Clôture - Date Soumission</span>
                    </div>
                    <div className={styles.methodItem}>
                        <span className={styles.methodTitle}>Flux de Sortie (Validées)</span>
                        <p className={styles.methodDesc}>Volume de tickets ayant atteint une validation métier finale (Fermé/Validé/Suspendu/Annulé) sur la période.</p>
                        <span className={styles.methodRule}>Comptage par Date de Clôture</span>
                    </div>
                    <div className={styles.methodItem}>
                        <span className={styles.methodTitle}>Évolution Backlog</span>
                        <p className={styles.methodDesc}>Représente le stock de tickets restés "EN COURS" à la fin de chaque période. Permet de visualiser l'évolution de la dette Mantis.</p>
                        <span className={styles.methodRule}>Stock à date (Historique 12 mois)</span>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default PilotagePage;

