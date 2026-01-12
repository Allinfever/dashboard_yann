import React, { useState, useEffect, useMemo } from 'react';
import DataTable from '../components/UI/DataTable';
import styles from './OpenTopicsPage.module.css';

const STATUSES = ['Backlog', 'En cours', 'Bloqué', 'En attente', 'Terminé', 'Abandonné'];
const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];

const OpenTopicsPage = () => {
    const [topics, setTopics] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'

    // Filters
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterPriority, setFilterPriority] = useState('');

    // New topic form
    const [newTopic, setNewTopic] = useState({
        title: '',
        summary: '',
        description: '',
        status: 'Backlog',
        priority: 'P4',
        owner: '',
        tags: '',
        dueDate: ''
    });

    useEffect(() => {
        fetchTopics();
    }, []);

    const fetchTopics = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/open-topics');
            if (!res.ok) throw new Error('Erreur serveur');
            const data = await res.json();
            setTopics(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newTopic.title.trim()) return;

        try {
            const res = await fetch('/api/open-topics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newTopic,
                    tags: newTopic.tags ? newTopic.tags.split(',').map(t => t.trim()) : []
                })
            });
            if (!res.ok) throw new Error('Erreur création');

            setShowModal(false);
            setNewTopic({ title: '', summary: '', description: '', status: 'Backlog', priority: 'P4', owner: '', tags: '', dueDate: '' });
            fetchTopics();
        } catch (e) {
            alert('Erreur: ' + e.message);
        }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!confirm('Supprimer ce sujet ?')) return;

        try {
            await fetch(`/api/open-topics/${id}`, { method: 'DELETE' });
            fetchTopics();
        } catch (e) {
            alert('Erreur suppression');
        }
    };

    const openDetail = (id) => {
        window.open(`/open-topics/${id}`, '_blank', 'noopener,noreferrer');
    };

    const filteredTopics = useMemo(() => {
        return topics.filter(t => {
            if (search && !t.title.toLowerCase().includes(search.toLowerCase()) &&
                !t.summary.toLowerCase().includes(search.toLowerCase())) return false;
            if (filterStatus && t.status !== filterStatus) return false;
            if (filterPriority && t.priority !== filterPriority) return false;
            return true;
        });
    }, [topics, search, filterStatus, filterPriority]);

    // KPI counts
    const kpis = useMemo(() => ({
        total: topics.length,
        enCours: topics.filter(t => t.status === 'En cours').length,
        bloque: topics.filter(t => t.status === 'Bloqué').length,
        termine: topics.filter(t => t.status === 'Terminé').length
    }), [topics]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('fr-FR');
    };

    // Table Columns Definition
    const columns = useMemo(() => [
        {
            header: 'Priorité',
            accessorKey: 'priority',
            cell: ({ getValue, row }) => (
                <span className={`${styles.priorityBadge} ${styles[getValue().toLowerCase()]}`} onClick={() => openDetail(row.original.id)} style={{ cursor: 'pointer' }}>
                    {getValue()}
                </span>
            )
        },
        {
            header: 'Statut',
            accessorKey: 'status',
            cell: ({ getValue }) => (
                <span className={`${styles.statusBadge} ${styles[getValue().replace(/\s/g, '').toLowerCase()]}`}>
                    {getValue()}
                </span>
            )
        },
        {
            header: 'Titre',
            accessorKey: 'title',
            cell: ({ getValue, row }) => (
                <span onClick={() => openDetail(row.original.id)} style={{ fontWeight: 600, color: 'var(--color-primary)', cursor: 'pointer' }}>
                    {getValue()}
                </span>
            )
        },
        {
            header: 'Résumé',
            accessorKey: 'summary',
        },
        {
            header: 'Responsable',
            accessorKey: 'owner',
        },
        {
            header: 'Échéance',
            accessorKey: 'dueDate',
            cell: ({ getValue }) => formatDate(getValue())
        },
        {
            header: 'Mis à jour',
            accessorKey: 'updatedAt',
            cell: ({ getValue }) => formatDate(getValue())
        },
        {
            header: 'Action',
            id: 'actions',
            cell: ({ row }) => (
                <button
                    className={styles.deleteBtn}
                    onClick={(e) => handleDelete(row.original.id, e)}
                >
                    🗑️
                </button>
            )
        }
    ], []);

    if (loading) {
        return <div className="card"><div className={styles.loading}>Chargement...</div></div>;
    }

    return (
        <div className="card">
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <h2>Sujets Ouverts</h2>
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'cards' ? styles.active : ''}`}
                            onClick={() => setViewMode('cards')}
                        >
                            🎴 Cards
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'table' ? styles.active : ''}`}
                            onClick={() => setViewMode('table')}
                        >
                            📋 Table
                        </button>
                    </div>
                </div>
                <button onClick={() => setShowModal(true)} className={styles.primaryBtn}>
                    + Nouveau sujet
                </button>
            </div>

            {/* KPIs */}
            <div className={styles.kpiBar}>
                <span className={styles.kpiBadge}>Total: {kpis.total}</span>
                <span className={`${styles.kpiBadge} ${styles.ongoing}`}>En cours: {kpis.enCours}</span>
                <span className={`${styles.kpiBadge} ${styles.blocked}`}>Bloqué: {kpis.bloque}</span>
                <span className={`${styles.kpiBadge} ${styles.done}`}>Terminé: {kpis.termine}</span>
            </div>

            {/* Filters (only for Cards, as Table has its own) */}
            {viewMode === 'cards' && (
                <div className={styles.filters}>
                    <input
                        type="text"
                        placeholder="Rechercher..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={styles.searchInput}
                    />
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={styles.filterSelect}>
                        <option value="">Tous les statuts</option>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={styles.filterSelect}>
                        <option value="">Toutes priorités</option>
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            )}

            {error && <div className={styles.error}>{error}</div>}

            {/* Cards Grid or Table */}
            {viewMode === 'cards' ? (
                <div className={styles.cardsGrid}>
                    {filteredTopics.length === 0 ? (
                        <div className={styles.empty}>Aucun sujet trouvé</div>
                    ) : (
                        filteredTopics.map(topic => (
                            <div
                                key={topic.id}
                                className={styles.topicCard}
                                onClick={() => openDetail(topic.id)}
                            >
                                <div className={styles.cardHeader}>
                                    <span className={`${styles.priorityBadge} ${styles[topic.priority.toLowerCase()]}`}>
                                        {topic.priority}
                                    </span>
                                    <span className={`${styles.statusBadge} ${styles[topic.status.replace(/\s/g, '').toLowerCase()]}`}>
                                        {topic.status}
                                    </span>
                                </div>
                                <h3 className={styles.cardTitle}>{topic.title}</h3>
                                <p className={styles.cardSummary}>{topic.summary || 'Pas de résumé'}</p>
                                <div className={styles.cardMeta}>
                                    {topic.owner && <span>👤 {topic.owner}</span>}
                                    {topic.dueDate && <span>📅 {formatDate(topic.dueDate)}</span>}
                                </div>
                                <div className={styles.cardFooter}>
                                    <span className={styles.cardDate}>Màj: {formatDate(topic.updatedAt)}</span>
                                    <button
                                        className={styles.deleteBtn}
                                        onClick={(e) => handleDelete(topic.id, e)}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        )
                        ))}
                </div>
            ) : (
                <DataTable
                    data={topics}
                    columns={columns}
                    storageKey="open_topics_table_order"
                    entityLabel="sujets"
                    filenamePrefix="sujets_ouverts"
                />
            )}


            {/* Create Modal */}
            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h3>Nouveau sujet</h3>
                        <form onSubmit={handleCreate}>
                            <div className={styles.formGroup}>
                                <label>Titre *</label>
                                <input
                                    type="text"
                                    value={newTopic.title}
                                    onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Résumé</label>
                                <input
                                    type="text"
                                    value={newTopic.summary}
                                    onChange={(e) => setNewTopic({ ...newTopic, summary: e.target.value })}
                                />
                            </div>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Statut</label>
                                    <select
                                        value={newTopic.status}
                                        onChange={(e) => setNewTopic({ ...newTopic, status: e.target.value })}
                                    >
                                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Priorité</label>
                                    <select
                                        value={newTopic.priority}
                                        onChange={(e) => setNewTopic({ ...newTopic, priority: e.target.value })}
                                    >
                                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Responsable</label>
                                    <input
                                        type="text"
                                        value={newTopic.owner}
                                        onChange={(e) => setNewTopic({ ...newTopic, owner: e.target.value })}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Échéance</label>
                                    <input
                                        type="date"
                                        value={newTopic.dueDate}
                                        onChange={(e) => setNewTopic({ ...newTopic, dueDate: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label>Tags (séparés par virgule)</label>
                                <input
                                    type="text"
                                    value={newTopic.tags}
                                    onChange={(e) => setNewTopic({ ...newTopic, tags: e.target.value })}
                                    placeholder="tag1, tag2"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Description</label>
                                <textarea
                                    value={newTopic.description}
                                    onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                                    rows={4}
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" onClick={() => setShowModal(false)} className={styles.cancelBtn}>
                                    Annuler
                                </button>
                                <button type="submit" className={styles.primaryBtn}>
                                    Créer
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OpenTopicsPage;
