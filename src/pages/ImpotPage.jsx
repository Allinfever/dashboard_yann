import React, { useState, useEffect, useMemo } from 'react';
import styles from './ImpotPage.module.css';

const STORAGE_KEY = 'impot_echeances_v1';

const DEFAULT_ECHEANCES = [
    { id: 1, libelle: 'TVA mensuelle', type: 'TVA', dateLimite: '2026-06-15', montant: null, statut: 'À déclarer' },
    { id: 2, libelle: 'Acompte IS - 2e échéance', type: 'IS', dateLimite: '2026-06-15', montant: null, statut: 'À déclarer' },
    { id: 3, libelle: 'CVAE - Solde', type: 'CVAE', dateLimite: '2026-06-15', montant: null, statut: 'À déclarer' },
    { id: 4, libelle: 'TVA mensuelle', type: 'TVA', dateLimite: '2026-07-15', montant: null, statut: 'À déclarer' },
    { id: 5, libelle: 'CFE - Acompte', type: 'CFE', dateLimite: '2026-06-15', montant: null, statut: 'À déclarer' }
];

const STATUT_OPTIONS = ['À déclarer', 'Déclaré', 'Payé', 'En retard'];
const TYPE_COLORS = {
    TVA: 'var(--color-primary)',
    IS: 'var(--color-cyan)',
    CVAE: 'var(--color-amber)',
    CFE: 'var(--color-rose)',
    Autre: 'var(--text-secondary)'
};

const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysUntil = (iso) => {
    if (!iso) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(iso);
    return Math.round((target - today) / (1000 * 60 * 60 * 24));
};

const formatMontant = (val) => {
    if (val === null || val === undefined || val === '') return '—';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val);
};

const ImpotPage = () => {
    const [echeances, setEcheances] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : DEFAULT_ECHEANCES;
    });
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState(null);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(echeances));
    }, [echeances]);

    const kpis = useMemo(() => {
        const aDeclarer = echeances.filter(e => e.statut === 'À déclarer');
        const enRetard = echeances.filter(e => {
            const days = daysUntil(e.dateLimite);
            return e.statut !== 'Payé' && days !== null && days < 0;
        });
        const totalDu = echeances
            .filter(e => e.statut !== 'Payé' && e.montant)
            .reduce((sum, e) => sum + Number(e.montant || 0), 0);
        const prochaine = [...echeances]
            .filter(e => e.statut !== 'Payé')
            .sort((a, b) => new Date(a.dateLimite) - new Date(b.dateLimite))[0];

        return {
            aDeclarer: aDeclarer.length,
            enRetard: enRetard.length,
            totalDu,
            prochaine
        };
    }, [echeances]);

    const sortedEcheances = useMemo(() => {
        return [...echeances].sort((a, b) => new Date(a.dateLimite) - new Date(b.dateLimite));
    }, [echeances]);

    const startEdit = (row) => {
        setEditingId(row.id);
        setDraft({ ...row });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setDraft(null);
    };

    const saveEdit = () => {
        setEcheances(prev => prev.map(e => (e.id === draft.id ? { ...draft, montant: draft.montant === '' ? null : Number(draft.montant) } : e)));
        cancelEdit();
    };

    const addEcheance = () => {
        const newId = echeances.length ? Math.max(...echeances.map(e => e.id)) + 1 : 1;
        const newRow = {
            id: newId,
            libelle: 'Nouvelle échéance',
            type: 'TVA',
            dateLimite: new Date().toISOString().slice(0, 10),
            montant: null,
            statut: 'À déclarer'
        };
        setEcheances(prev => [...prev, newRow]);
        startEdit(newRow);
    };

    const deleteEcheance = (id) => {
        setEcheances(prev => prev.filter(e => e.id !== id));
        if (editingId === id) cancelEdit();
    };

    const resetDefaults = () => {
        if (confirm('Réinitialiser les échéances par défaut ?')) {
            setEcheances(DEFAULT_ECHEANCES);
            localStorage.removeItem(STORAGE_KEY);
        }
    };

    const getRowClass = (row) => {
        if (row.statut === 'Payé') return styles.rowPaid;
        const days = daysUntil(row.dateLimite);
        if (days !== null && days < 0) return styles.rowLate;
        if (days !== null && days <= 7) return styles.rowSoon;
        return '';
    };

    return (
        <div className="card">
            <div className={styles.header}>
                <h2>Impôt</h2>
                <div className={styles.headerActions}>
                    <button onClick={addEcheance} className={styles.addBtn}>+ Échéance</button>
                    <button onClick={resetDefaults} className={styles.resetBtn}>Réinitialiser</button>
                </div>
            </div>

            <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>À déclarer</div>
                    <div className={styles.kpiValue}>{kpis.aDeclarer}</div>
                </div>
                <div className={`${styles.kpiCard} ${kpis.enRetard > 0 ? styles.kpiAlert : ''}`}>
                    <div className={styles.kpiLabel}>En retard</div>
                    <div className={styles.kpiValue}>{kpis.enRetard}</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>Total dû</div>
                    <div className={styles.kpiValue}>{formatMontant(kpis.totalDu)}</div>
                </div>
                <div className={styles.kpiCard}>
                    <div className={styles.kpiLabel}>Prochaine échéance</div>
                    <div className={styles.kpiValueSmall}>
                        {kpis.prochaine ? (
                            <>
                                <div>{kpis.prochaine.libelle}</div>
                                <div className={styles.kpiSub}>{formatDate(kpis.prochaine.dateLimite)}</div>
                            </>
                        ) : '—'}
                    </div>
                </div>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Libellé</th>
                            <th>Type</th>
                            <th>Date limite</th>
                            <th>J-</th>
                            <th>Montant</th>
                            <th>Statut</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedEcheances.map(row => {
                            const days = daysUntil(row.dateLimite);
                            const isEditing = editingId === row.id;
                            return (
                                <tr key={row.id} className={getRowClass(row)}>
                                    {isEditing ? (
                                        <>
                                            <td>
                                                <input
                                                    value={draft.libelle}
                                                    onChange={e => setDraft({ ...draft, libelle: e.target.value })}
                                                    className={styles.input}
                                                />
                                            </td>
                                            <td>
                                                <select
                                                    value={draft.type}
                                                    onChange={e => setDraft({ ...draft, type: e.target.value })}
                                                    className={styles.input}
                                                >
                                                    {Object.keys(TYPE_COLORS).map(t => (
                                                        <option key={t} value={t}>{t}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>
                                                <input
                                                    type="date"
                                                    value={draft.dateLimite}
                                                    onChange={e => setDraft({ ...draft, dateLimite: e.target.value })}
                                                    className={styles.input}
                                                />
                                            </td>
                                            <td className={styles.dim}>—</td>
                                            <td>
                                                <input
                                                    type="number"
                                                    value={draft.montant ?? ''}
                                                    onChange={e => setDraft({ ...draft, montant: e.target.value })}
                                                    placeholder="€"
                                                    className={styles.input}
                                                />
                                            </td>
                                            <td>
                                                <select
                                                    value={draft.statut}
                                                    onChange={e => setDraft({ ...draft, statut: e.target.value })}
                                                    className={styles.input}
                                                >
                                                    {STATUT_OPTIONS.map(s => (
                                                        <option key={s} value={s}>{s}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className={styles.actionsCell}>
                                                <button onClick={saveEdit} className={styles.iconBtn} title="Enregistrer">✓</button>
                                                <button onClick={cancelEdit} className={styles.iconBtn} title="Annuler">✕</button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td>{row.libelle}</td>
                                            <td>
                                                <span
                                                    className={styles.typeBadge}
                                                    style={{ borderColor: TYPE_COLORS[row.type] || TYPE_COLORS.Autre, color: TYPE_COLORS[row.type] || TYPE_COLORS.Autre }}
                                                >
                                                    {row.type}
                                                </span>
                                            </td>
                                            <td>{formatDate(row.dateLimite)}</td>
                                            <td className={days !== null && days < 0 ? styles.late : days !== null && days <= 7 ? styles.soon : ''}>
                                                {days === null ? '—' : days < 0 ? `+${Math.abs(days)}j` : `${days}j`}
                                            </td>
                                            <td>{formatMontant(row.montant)}</td>
                                            <td>
                                                <span className={`${styles.statutBadge} ${styles[`statut${row.statut.replace(/[^a-zA-Z]/g, '')}`] || ''}`}>
                                                    {row.statut}
                                                </span>
                                            </td>
                                            <td className={styles.actionsCell}>
                                                <button onClick={() => startEdit(row)} className={styles.iconBtn} title="Modifier">✎</button>
                                                <button onClick={() => deleteEcheance(row.id)} className={styles.iconBtn} title="Supprimer">🗑</button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                        {sortedEcheances.length === 0 && (
                            <tr>
                                <td colSpan={7} className={styles.emptyRow}>Aucune échéance enregistrée.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ImpotPage;
