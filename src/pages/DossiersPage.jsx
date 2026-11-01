import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileStack, ListChecks, KeyRound } from 'lucide-react';
import OpenAIKeyDialog from '../components/Dossiers/OpenAIKeyDialog';
import { ETATS, formatDate } from '../utils/dossierDisplay';
import styles from './DossiersPage.module.css';

const DossiersPage = () => {
    const navigate = useNavigate();
    const [dossiers, setDossiers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [newTitle, setNewTitle] = useState('');
    const [aiStatus, setAiStatus] = useState(null);
    const [search, setSearch] = useState('');
    const [keyDialogOpen, setKeyDialogOpen] = useState(false);

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
    const visible = dossiers.filter(d => !term || `${d.title} ${d.resume}`.toLowerCase().includes(term));
    const active = visible.filter(d => d.status !== 'archive');
    const archived = visible.filter(d => d.status === 'archive');

    const renderCard = (d) => {
        const etat = ETATS[d.etat];
        return (
            <button key={d.id} type="button" className={styles.card} onClick={() => navigate(`/dossiers/${d.id}`)}>
                <div className={styles.cardTop}>
                    <h3>{d.title}</h3>
                    {etat && <span className={styles.etat} style={{ color: etat.color, borderColor: etat.color }}>{etat.label}</span>}
                </div>
                <p className={styles.resume}>{d.etatLibelle || d.resume || 'Pas encore de synthèse : ajoute des sources.'}</p>
                <div className={styles.cardMeta}>
                    <span><FileStack size={13} aria-hidden="true" /> {d.sourceCount} source{d.sourceCount > 1 ? 's' : ''}</span>
                    {d.openActions > 0 && <span><ListChecks size={13} aria-hidden="true" /> {d.openActions} action{d.openActions > 1 ? 's' : ''}</span>}
                    <span className={styles.date}>Maj {formatDate(d.updatedAt)}</span>
                </div>
            </button>
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
                    <div className={styles.grid}>{active.map(renderCard)}</div>
                    {archived.length > 0 && (
                        <>
                            <h4 className={styles.sectionTitle}>Archivés</h4>
                            <div className={styles.grid}>{archived.map(renderCard)}</div>
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default DossiersPage;
