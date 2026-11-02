import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileStack, ListChecks, KeyRound, Bug } from 'lucide-react';
import OpenAIKeyDialog from '../components/Dossiers/OpenAIKeyDialog';
import { ETATS, formatDate } from '../utils/dossierDisplay';
import styles from './DossiersPage.module.css';

// Personal priority groups (null = not ranked yet)
const PRIORITY_GROUPS = [
    { value: 1, label: 'Priorité 1', color: 'var(--color-rose)' },
    { value: 2, label: 'Priorité 2', color: 'var(--color-amber)' },
    { value: 3, label: 'Priorité 3', color: 'var(--color-primary)' },
    { value: null, label: 'À définir', color: 'var(--text-muted)' }
];
const MAX_MANTIS_CHIPS = 4;

const byRank = (a, b) => {
    if (a.order != null && b.order != null) return a.order - b.order;
    if (a.order != null) return -1;
    if (b.order != null) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
};

const DossiersPage = () => {
    const navigate = useNavigate();
    const [dossiers, setDossiers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [newTitle, setNewTitle] = useState('');
    const [aiStatus, setAiStatus] = useState(null);
    const [search, setSearch] = useState('');
    const [keyDialogOpen, setKeyDialogOpen] = useState(false);
    const [dragId, setDragId] = useState(null);
    const [dropTarget, setDropTarget] = useState(null); // { priority, beforeId }

    const loadAiStatus = () => fetch('/api/dossiers/ai-status').then(res => res.json()).then(setAiStatus).catch(() => {});

    useEffect(() => {
        fetch('/api/dossiers')
            .then(res => (res.ok ? res.json() : Promise.reject(new Error('Impossible de charger les dossiers'))))
            .then(setDossiers)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
        loadAiStatus();
    }, []);

    const createDossier = async (e) => {
        e.preventDefault();
        const title = newTitle.trim();
        if (!title) return;
        const res = await fetch('/api/dossiers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        if (!res.ok) return setError('Création impossible');
        const created = await res.json();
        navigate(`/dossiers/${created.id}`);
    };

    const term = search.trim().toLowerCase();
    const matches = (d) => !term || `${d.title} ${d.resume} ${(d.mantis || []).map(m => m.id).join(' ')}`.toLowerCase().includes(term);
    const visible = dossiers.filter(matches);
    const active = visible.filter(d => d.status !== 'archive');
    const archived = visible.filter(d => d.status === 'archive');
    const groupOf = (list, priority) => list.filter(d => (d.priority ?? null) === priority).sort(byRank);

    const setPriority = (id, priority) => {
        setDossiers(prev => prev.map(d => (d.id === id ? { ...d, priority, order: null } : d)));
        fetch(`/api/dossiers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority })
        }).catch(() => setError('Priorité non enregistrée'));
    };

    // Moves the dragged dossier into a priority group, before `beforeId` (or at the end)
    const moveTo = (priority, beforeId) => {
        const id = dragId;
        setDragId(null);
        setDropTarget(null);
        if (!id || id === beforeId) return;
        const group = groupOf(dossiers.filter(d => d.status !== 'archive' && d.id !== id), priority).map(d => d.id);
        const at = beforeId ? group.indexOf(beforeId) : -1;
        group.splice(at < 0 ? group.length : at, 0, id);
        setDossiers(prev => prev.map(d => (group.includes(d.id) ? { ...d, priority, order: group.indexOf(d.id) } : d)));
        fetch('/api/dossiers/reorder', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority, ids: group })
        }).catch(() => setError('Classement non enregistré'));
    };

    const renderCard = (d, sortable) => {
        const etat = ETATS[d.etat];
        const mantis = d.mantis || [];
        const isDropBefore = dropTarget?.beforeId === d.id && dragId !== d.id;
        return (
            <div
                key={d.id}
                role="link"
                tabIndex={0}
                className={`${styles.card} ${dragId === d.id ? styles.dragging : ''} ${isDropBefore ? styles.dropBefore : ''}`}
                onClick={() => navigate(`/dossiers/${d.id}`)}
                onKeyDown={e => { if (e.key === 'Enter') navigate(`/dossiers/${d.id}`); }}
                draggable={sortable}
                onDragStart={sortable ? (e => { e.dataTransfer.effectAllowed = 'move'; setDragId(d.id); }) : undefined}
                onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                onDragOver={sortable && dragId ? (e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dropTarget?.beforeId !== d.id) setDropTarget({ priority: d.priority ?? null, beforeId: d.id });
                }) : undefined}
                onDrop={sortable ? (e => { e.preventDefault(); e.stopPropagation(); moveTo(d.priority ?? null, d.id); }) : undefined}
            >
                <div className={styles.cardTop}>
                    <h3>{d.title}</h3>
                    {etat && <span className={styles.etat} style={{ color: etat.color, borderColor: etat.color }}>{etat.label}</span>}
                </div>
                <p className={styles.resume}>{d.etatLibelle || d.resume || 'Pas encore de synthèse : ajoute des sources.'}</p>
                {mantis.length > 0 && (
                    <div className={styles.mantisChips}>
                        {mantis.slice(0, MAX_MANTIS_CHIPS).map(m => (
                            <span key={m.id} className={styles.mantisChip} title={m.resume || `Mantis #${m.id}`}>
                                <Bug size={12} aria-hidden="true" />
                                #{m.id}
                                {m.etat && <span className={styles.mantisEtat}>{m.etat}</span>}
                            </span>
                        ))}
                        {mantis.length > MAX_MANTIS_CHIPS && <span className={styles.mantisMore}>+{mantis.length - MAX_MANTIS_CHIPS}</span>}
                    </div>
                )}
                <div className={styles.cardMeta}>
                    <span><FileStack size={13} aria-hidden="true" /> {d.sourceCount} source{d.sourceCount > 1 ? 's' : ''}</span>
                    {d.openActions > 0 && <span><ListChecks size={13} aria-hidden="true" /> {d.openActions} action{d.openActions > 1 ? 's' : ''}</span>}
                    <span className={styles.date}>Maj {formatDate(d.updatedAt)}</span>
                </div>
                {d.status !== 'archive' && (
                    <div className={styles.priorityPicker} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        {PRIORITY_GROUPS.map(p => {
                            const selected = (d.priority ?? null) === p.value;
                            return (
                                <button
                                    key={String(p.value)}
                                    type="button"
                                    className={`${styles.priorityBtn} ${selected ? styles.prioritySelected : ''}`}
                                    style={selected ? { color: p.color, borderColor: p.color } : undefined}
                                    onClick={() => !selected && setPriority(d.id, p.value)}
                                    title={p.label}
                                >
                                    {p.value ? `P${p.value}` : '?'}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <div>
                    <h2>Dossiers</h2>
                    <p className={styles.subtitle}>Mails, Teams, Mantis, documents et recherches réunis par sujet, synthétisés par l'IA.</p>
                </div>
                <div className={styles.headerActions}>
                    <input
                        className={styles.search}
                        type="search"
                        placeholder="Rechercher…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <button
                        type="button"
                        className={styles.keyBtn}
                        onClick={() => setKeyDialogOpen(true)}
                        title={aiStatus?.configured ? `Clé OpenAI active ${aiStatus.keyHint}` : 'Configurer la clé OpenAI'}
                    >
                        <KeyRound size={15} aria-hidden="true" />
                        Clé OpenAI
                        <span className={styles.keyDot} style={{ background: aiStatus?.configured ? 'var(--color-emerald)' : 'var(--color-rose)' }} />
                    </button>
                </div>
            </div>

            {aiStatus && !aiStatus.configured && (
                <div className={styles.warning}>
                    Aucune clé OpenAI : les sources seront stockées mais pas analysées.
                    <button type="button" className={styles.warningBtn} onClick={() => setKeyDialogOpen(true)}>Ajouter la clé</button>
                </div>
            )}

            {keyDialogOpen && (
                <OpenAIKeyDialog
                    status={aiStatus}
                    onClose={() => setKeyDialogOpen(false)}
                    onSaved={() => { setKeyDialogOpen(false); loadAiStatus(); }}
                />
            )}

            <form className={styles.newForm} onSubmit={createDossier}>
                <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Nouveau dossier : ex. Interface stock SAP ↔ WMS"
                />
                <button type="submit" className={styles.primaryBtn} disabled={!newTitle.trim()}>
                    <Plus size={16} aria-hidden="true" /> Créer
                </button>
            </form>

            {error && <div className={styles.error}>{error}</div>}
            {loading ? (
                <div className={styles.empty}>Chargement…</div>
            ) : active.length === 0 && archived.length === 0 ? (
                <div className={styles.empty}>{term ? 'Aucun dossier ne correspond.' : 'Aucun dossier pour l\'instant. Crée le premier ci-dessus.'}</div>
            ) : (
                <>
                    {PRIORITY_GROUPS.map(p => {
                        const group = groupOf(active, p.value);
                        // Hide empty groups while searching, keep them as drop zones otherwise
                        if (group.length === 0 && (term || !dragId)) return null;
                        const isDropZone = dropTarget && dropTarget.priority === p.value && !dropTarget.beforeId;
                        return (
                            <section
                                key={String(p.value)}
                                className={`${styles.group} ${isDropZone ? styles.groupDrop : ''}`}
                                onDragOver={dragId ? (e => {
                                    e.preventDefault();
                                    if (!isDropZone) setDropTarget({ priority: p.value, beforeId: null });
                                }) : undefined}
                                onDrop={e => { e.preventDefault(); moveTo(p.value, null); }}
                            >
                                <h4 className={styles.groupTitle}>
                                    <span className={styles.groupDot} style={{ background: p.color }} />
                                    {p.label}
                                    <span className={styles.groupCount}>{group.length}</span>
                                </h4>
                                {group.length > 0
                                    ? <div className={styles.grid}>{group.map(d => renderCard(d, !term))}</div>
                                    : <div className={styles.groupEmpty}>Dépose une carte ici</div>}
                            </section>
                        );
                    })}
                    {archived.length > 0 && (
                        <>
                            <h4 className={styles.sectionTitle}>Archivés</h4>
                            <div className={styles.grid}>{archived.map(d => renderCard(d, false))}</div>
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default DossiersPage;
