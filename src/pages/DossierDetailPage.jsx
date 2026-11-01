import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import classNames from 'classnames';
import {
    ArrowLeft, RefreshCw, Download, Trash2, Upload, Loader2, AlertTriangle, ChevronDown, Send, Copy, ExternalLink,
    Mail, MessagesSquare, Bug, FileText, Sheet, Globe, Image as ImageIcon, StickyNote, Sparkles, RotateCw, Paperclip, X
} from 'lucide-react';
import { ETATS, SOURCE_TYPES, formatDate } from '../utils/dossierDisplay';
import styles from './DossierDetailPage.module.css';

const TYPE_ICONS = { email: Mail, teams: MessagesSquare, mantis: Bug, document: FileText, tableur: Sheet, web: Globe, image: ImageIcon, note: StickyNote };

const QUICK_PROMPTS = [
    { label: 'Point d\'avancement', prompt: 'Fais un point d\'avancement synthétique du dossier : où on en est, ce qui a bougé récemment, ce qui reste à faire.' },
    { label: 'Qu\'est-ce qui bloque ?', prompt: 'Qu\'est-ce qui bloque ou risque de bloquer ce sujet, et qui peut le débloquer ?' },
    { label: 'Mail de relance', prompt: 'Rédige un mail de relance concis et courtois aux personnes qui ont des actions en attente, avec un objet.' },
    { label: 'Compte rendu', prompt: 'Rédige un compte rendu structuré du dossier (contexte, décisions, actions avec responsables et échéances, points ouverts).' },
    { label: 'Préparer le CoPro', prompt: 'Prépare les 3 à 5 lignes à présenter en comité projet sur ce sujet (état, risques, décisions attendues).' }
];

// Same ordering as the server: oldest first, S1..Sn
const computeRefs = (sources) => {
    const ordered = [...sources].sort((a, b) => (a.date || a.createdAt).localeCompare(b.date || b.createdAt));
    return Object.fromEntries(ordered.map((s, i) => [s.id, `S${i + 1}`]));
};

const Section = ({ title, children, count }) => (
    <section className={styles.ficheSection}>
        <h4>{title}{count !== undefined && <span className={styles.count}>{count}</span>}</h4>
        {children}
    </section>
);

const DossierDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [dossier, setDossier] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('fiche');
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [pasteText, setPasteText] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [expanded, setExpanded] = useState(null);
    const [fullTexts, setFullTexts] = useState({});
    const [lightbox, setLightbox] = useState(null);
    const [chatInput, setChatInput] = useState('');
    const [chatPending, setChatPending] = useState(false);
    const [chatError, setChatError] = useState(null);
    const fileInputRef = useRef(null);
    const chatEndRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/dossiers/${id}`);
            if (!res.ok) throw new Error('Dossier introuvable');
            setDossier(await res.json());
        } catch (e) {
            setError(e.message);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    // Poll while sources are being analyzed or the fiche is being rebuilt
    const busy = dossier && (dossier.ficheStatus === 'updating' || dossier.sources.some(s => s.status === 'processing'));
    useEffect(() => {
        if (!busy) return;
        const timer = setInterval(load, 2000);
        return () => clearInterval(timer);
    }, [busy, load]);

    useEffect(() => {
        if (!lightbox) return;
        const onKey = (e) => e.key === 'Escape' && setLightbox(null);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [lightbox]);

    useEffect(() => {
        if (tab === 'chat') chatEndRef.current?.scrollIntoView({ block: 'end' });
    }, [tab, dossier?.chat?.length, chatPending]);

    const refs = useMemo(() => (dossier ? computeRefs(dossier.sources) : {}), [dossier]);
    const sourcesById = useMemo(() => Object.fromEntries((dossier?.sources || []).map(s => [s.id, s])), [dossier]);
    const sortedSources = useMemo(
        () => [...(dossier?.sources || [])].sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt)),
        [dossier]
    );

    const save = async (updates) => {
        const res = await fetch(`/api/dossiers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if (res.ok) setDossier(await res.json());
    };

    // --- Adding sources ---
    const submitSources = async ({ files = [], text = '' }) => {
        if (files.length === 0 && !text.trim()) return;
        const form = new FormData();
        files.forEach(f => form.append('files', f));
        if (text.trim()) form.append('text', text);
        setUploading(true);
        setUploadError(null);
        try {
            const res = await fetch(`/api/dossiers/${id}/sources`, { method: 'POST', body: form });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Ajout impossible');
            await load();
            return true;
        } catch (e) {
            setUploadError(e.message);
            return false;
        } finally {
            setUploading(false);
        }
    };

    const addPasted = async () => {
        if (await submitSources({ text: pasteText })) setPasteText('');
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const files = [...e.dataTransfer.files];
        if (files.length) return submitSources({ files });
        const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
        if (text) submitSources({ text });
    };

    // Pasted files (screenshots, copied files) are added directly
    const handlePaste = (e) => {
        const files = [...(e.clipboardData?.files || [])];
        if (files.length) {
            e.preventDefault();
            submitSources({ files });
        }
    };

    const sourceAction = async (sourceId, method, suffix = '', body) => {
        await fetch(`/api/dossiers/${id}/sources/${sourceId}${suffix}`, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined
        });
        load();
    };

    const deleteSource = (source) => {
        if (!confirm(`Retirer « ${source.title} » du dossier ?`)) return;
        sourceAction(source.id, 'DELETE');
    };

    const toggleFullText = async (sourceId) => {
        if (fullTexts[sourceId] !== undefined) {
            setFullTexts(prev => { const next = { ...prev }; delete next[sourceId]; return next; });
            return;
        }
        const res = await fetch(`/api/dossiers/${id}/sources/${sourceId}`);
        const data = await res.json();
        setFullTexts(prev => ({ ...prev, [sourceId]: data.text || '' }));
    };

    const focusSource = (sourceId) => {
        setExpanded(sourceId);
        requestAnimationFrame(() => document.getElementById(`source-${sourceId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    };

    // --- Fiche ---
    const regenerate = async () => {
        await fetch(`/api/dossiers/${id}/fiche`, { method: 'POST' });
        load();
    };

    const toggleAction = (index) => {
        const done = dossier.fiche.actions.map((a, i) => (i === index ? a.statut !== 'fait' : a.statut === 'fait'));
        save({ actionsDone: done.flatMap((d, i) => (d ? [i] : [])) });
    };

    const deleteDossier = async () => {
        if (!confirm('Supprimer définitivement ce dossier, ses sources et ses fichiers ?')) return;
        await fetch(`/api/dossiers/${id}`, { method: 'DELETE' });
        navigate('/dossiers');
    };

    // --- Chat ---
    const sendChat = async (message) => {
        const text = (message ?? chatInput).trim();
        if (!text || chatPending) return;
        setTab('chat');
        setChatPending(true);
        setChatError(null);
        setDossier(prev => ({ ...prev, chat: [...prev.chat, { role: 'user', content: text, at: new Date().toISOString() }] }));
        setChatInput('');
        try {
            const res = await fetch(`/api/dossiers/${id}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erreur de l\'assistant');
            setDossier(prev => ({ ...prev, chat: data.chat }));
        } catch (e) {
            setChatError(e.message);
            setChatInput(text);
            load();
        } finally {
            setChatPending(false);
        }
    };

    const clearChat = async () => {
        if (!confirm('Effacer la conversation ?')) return;
        await fetch(`/api/dossiers/${id}/chat`, { method: 'DELETE' });
        load();
    };

    // [S3] references become clickable chips
    const SourceChip = ({ sourceId, fallback }) => {
        const source = sourcesById[sourceId];
        if (!source) return <span className={styles.chipMissing}>{fallback}</span>;
        return (
            <button type="button" className={styles.chip} title={source.title} onClick={() => focusSource(source.id)}>
                {refs[source.id]}
            </button>
        );
    };

    const chips = (list, refMap) => (list || []).map(ref => <SourceChip key={ref} sourceId={refMap?.[ref]} fallback={ref} />);

    const renderMarkdown = (content, refMap) => (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                a: ({ href, children }) => {
                    if (href?.startsWith('#src-')) return <SourceChip sourceId={refMap?.[href.slice(5)]} fallback={children} />;
                    return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                }
            }}
        >
            {content.replace(/\[(S\d+)\](?!\()/g, '[$1](#src-$1)')}
        </ReactMarkdown>
    );

    if (error) return <div className={styles.page}><div className={styles.error}>{error}</div><Link to="/dossiers">← Retour aux dossiers</Link></div>;
    if (!dossier) return <div className={styles.page}><div className={styles.muted}>Chargement…</div></div>;

    const fiche = dossier.fiche;
    const etat = fiche && ETATS[fiche.etat];
    const mantisSources = dossier.sources.filter(s => s.mantisId && s.status !== 'error');
    const mantisLink = (mid) => (dossier.mantisBaseUrl ? `${dossier.mantisBaseUrl}/view.php?id=${mid}` : null);

    return (
        <div className={styles.page} onPaste={handlePaste}>
            {/* Header */}
            <div className={styles.header}>
                <Link to="/dossiers" className={styles.back} title="Tous les dossiers"><ArrowLeft size={18} /></Link>
                <input
                    key={dossier.title}
                    className={styles.titleInput}
                    defaultValue={dossier.title}
                    onBlur={e => e.target.value.trim() && e.target.value !== dossier.title && save({ title: e.target.value.trim() })}
                    onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                />
                <div className={styles.headerActions}>
                    <select className={styles.select} value={dossier.status} onChange={e => save({ status: e.target.value })}>
                        <option value="actif">Actif</option>
                        <option value="archive">Archivé</option>
                    </select>
                    <a className={styles.iconBtn} href={`/api/dossiers/${id}/export.md`} title="Exporter en Markdown"><Download size={16} /></a>
                    <button type="button" className={styles.iconBtn} onClick={deleteDossier} title="Supprimer le dossier"><Trash2 size={16} /></button>
                </div>
            </div>

            <div className={styles.layout}>
                {/* Left: fiche / assistant */}
                <div className={styles.mainCol}>
                    <div className={styles.tabs}>
                        <button type="button" className={classNames(styles.tab, { [styles.tabActive]: tab === 'fiche' })} onClick={() => setTab('fiche')}>Fiche</button>
                        <button type="button" className={classNames(styles.tab, { [styles.tabActive]: tab === 'chat' })} onClick={() => setTab('chat')}>
                            Assistant{dossier.chat.length > 0 && <span className={styles.count}>{dossier.chat.length / 2 | 0}</span>}
                        </button>
                        <div className={styles.tabSpacer} />
                        {tab === 'fiche' && (
                            <button type="button" className={styles.ghostBtn} onClick={regenerate} disabled={dossier.ficheStatus === 'updating' || dossier.sources.length === 0}>
                                {dossier.ficheStatus === 'updating' ? <Loader2 size={14} className={styles.spin} /> : <RefreshCw size={14} />}
                                {dossier.ficheStatus === 'updating' ? 'Mise à jour…' : 'Régénérer'}
                            </button>
                        )}
                        {tab === 'chat' && dossier.chat.length > 0 && (
                            <button type="button" className={styles.ghostBtn} onClick={clearChat}><Trash2 size={14} /> Effacer</button>
                        )}
                    </div>

                    {tab === 'fiche' && (
                        <div className={styles.panel}>
                            {dossier.ficheStatus === 'error' && (
                                <div className={styles.error}><AlertTriangle size={14} /> Échec de la mise à jour de la fiche : {dossier.ficheError}</div>
                            )}
                            {!fiche ? (
                                <div className={styles.emptyFiche}>
                                    <Sparkles size={22} />
                                    <p>{dossier.ficheStatus === 'updating' ? 'Analyse des sources en cours…' : 'Ajoute des sources à droite : la fiche se construira automatiquement.'}</p>
                                </div>
                            ) : (
                                <>
                                    <div className={styles.etatBanner} style={{ borderColor: etat?.color }}>
                                        <span className={styles.etatLabel} style={{ color: etat?.color }}>{etat?.label}</span>
                                        <span>{fiche.etat_libelle}</span>
                                    </div>
                                    <Section title="Synthèse"><p className={styles.resume}>{fiche.resume}</p></Section>

                                    {fiche.prochaines_etapes.length > 0 && (
                                        <Section title="Prochaines étapes">
                                            <ul className={styles.list}>{fiche.prochaines_etapes.map((s, i) => <li key={i}>{s}</li>)}</ul>
                                        </Section>
                                    )}

                                    <Section title="Actions" count={fiche.actions.filter(a => a.statut !== 'fait').length}>
                                        {fiche.actions.length === 0 ? <p className={styles.muted}>Aucune action identifiée.</p> : (
                                            <ul className={styles.actions}>
                                                {fiche.actions.map((a, i) => (
                                                    <li key={i} className={classNames({ [styles.done]: a.statut === 'fait' })}>
                                                        <input type="checkbox" checked={a.statut === 'fait'} onChange={() => toggleAction(i)} />
                                                        <div>
                                                            <span className={styles.who}>{a.qui || '—'}</span> {a.quoi}
                                                            {a.echeance && <span className={styles.due}>{a.echeance}</span>}
                                                            {chips(a.sources, fiche.refs)}
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </Section>

                                    {fiche.decisions.length > 0 && (
                                        <Section title="Décisions">
                                            <ul className={styles.list}>
                                                {fiche.decisions.map((d, i) => (
                                                    <li key={i}>{d.date && <span className={styles.due}>{d.date}</span>} {d.texte} {chips(d.sources, fiche.refs)}</li>
                                                ))}
                                            </ul>
                                        </Section>
                                    )}

                                    {fiche.questions.length > 0 && (
                                        <Section title="Questions ouvertes">
                                            <ul className={styles.list}>{fiche.questions.map((q, i) => <li key={i}>{q.texte} {chips(q.sources, fiche.refs)}</li>)}</ul>
                                        </Section>
                                    )}

                                    {fiche.risques.length > 0 && (
                                        <Section title="Risques">
                                            <ul className={styles.list}>{fiche.risques.map((r, i) => <li key={i}>{r.texte} {chips(r.sources, fiche.refs)}</li>)}</ul>
                                        </Section>
                                    )}

                                    {mantisSources.length > 0 && (
                                        <Section title="Mantis liés" count={mantisSources.length}>
                                            <ul className={styles.mantisList}>
                                                {mantisSources.map(s => (
                                                    <li key={s.id}>
                                                        {mantisLink(s.mantisId) ? <a href={mantisLink(s.mantisId)} target="_blank" rel="noopener noreferrer">#{s.mantisId}</a> : <span>#{s.mantisId}</span>}
                                                        <span className={styles.mantisSummary}>{s.mantis?.resume || s.title}</span>
                                                        {s.mantis && <span className={styles.mantisState}>{s.mantis.etat}{s.mantis.priorite && ` · ${s.mantis.priorite}`}</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </Section>
                                    )}

                                    {fiche.acteurs.length > 0 && (
                                        <Section title="Acteurs">
                                            <div className={styles.actors}>
                                                {fiche.acteurs.map((a, i) => <span key={i} className={styles.actor}><strong>{a.nom}</strong> {a.role}</span>)}
                                            </div>
                                        </Section>
                                    )}
                                    <p className={styles.generated}>Fiche générée le {new Date(fiche.generatedAt).toLocaleString('fr-FR')}</p>
                                </>
                            )}

                            <Section title="Mes notes">
                                <textarea
                                    key={dossier.id}
                                    className={styles.notes}
                                    defaultValue={dossier.notes}
                                    placeholder="Contexte, consignes ou éléments que l'IA doit prendre en compte…"
                                    onBlur={e => e.target.value !== dossier.notes && save({ notes: e.target.value })}
                                />
                            </Section>
                        </div>
                    )}

                    {tab === 'chat' && (
                        <div className={classNames(styles.panel, styles.chatPanel)}>
                            <div className={styles.messages}>
                                {dossier.chat.length === 0 && !chatPending && (
                                    <div className={styles.emptyFiche}>
                                        <Sparkles size={22} />
                                        <p>Pose une question sur le dossier ou lance une action rapide.</p>
                                    </div>
                                )}
                                {dossier.chat.map((m, i) => (
                                    <div key={i} className={classNames(styles.message, m.role === 'user' ? styles.userMsg : styles.botMsg)}>
                                        {m.role === 'user' ? m.content : (
                                            <>
                                                <div className={styles.markdown}>{renderMarkdown(m.content, m.refs)}</div>
                                                <button type="button" className={styles.copyBtn} onClick={() => navigator.clipboard.writeText(m.content)} title="Copier"><Copy size={13} /></button>
                                            </>
                                        )}
                                    </div>
                                ))}
                                {chatPending && <div className={classNames(styles.message, styles.botMsg, styles.muted)}><Loader2 size={14} className={styles.spin} /> Réflexion…</div>}
                                {chatError && <div className={styles.error}>{chatError}</div>}
                                <div ref={chatEndRef} />
                            </div>
                            <div className={styles.quick}>
                                {QUICK_PROMPTS.map(q => (
                                    <button key={q.label} type="button" className={styles.quickBtn} disabled={chatPending} onClick={() => sendChat(q.prompt)}>{q.label}</button>
                                ))}
                            </div>
                            <div className={styles.chatInput}>
                                <textarea
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                                    placeholder="Question sur le dossier… (Entrée pour envoyer, Maj+Entrée pour un saut de ligne)"
                                    rows={2}
                                />
                                <button type="button" className={styles.sendBtn} onClick={() => sendChat()} disabled={chatPending || !chatInput.trim()} title="Envoyer"><Send size={16} /></button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: sources */}
                <div className={styles.sideCol}>
                    <div
                        className={classNames(styles.dropZone, { [styles.dropActive]: dragOver })}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                    >
                        <textarea
                            className={styles.pasteArea}
                            value={pasteText}
                            onChange={e => setPasteText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addPasted(); } }}
                            placeholder={'Colle un email, un échange Teams, une note…\nou des n° Mantis (12345, 12346) / des URL\n\nOu glisse ici des fichiers : .eml .msg .docx .xlsx .pdf images…'}
                            rows={5}
                        />
                        <div className={styles.dropActions}>
                            <button type="button" className={styles.ghostBtn} onClick={() => fileInputRef.current?.click()}><Paperclip size={14} /> Fichiers</button>
                            <input ref={fileInputRef} type="file" multiple hidden onChange={e => { submitSources({ files: [...e.target.files] }); e.target.value = ''; }} />
                            <span className={styles.hint}>⌘+Entrée</span>
                            <button type="button" className={styles.primaryBtn} onClick={addPasted} disabled={uploading || !pasteText.trim()}>
                                {uploading ? <Loader2 size={14} className={styles.spin} /> : <Upload size={14} />} Ajouter
                            </button>
                        </div>
                        {dragOver && <div className={styles.dropOverlay}>Déposer pour ajouter au dossier</div>}
                    </div>
                    {uploadError && <div className={styles.error}>{uploadError}</div>}

                    <h4 className={styles.sourcesTitle}>Sources <span className={styles.count}>{dossier.sources.length}</span></h4>
                    {sortedSources.length === 0 && <p className={styles.muted}>Aucune source pour l'instant.</p>}
                    <ul className={styles.sources}>
                        {sortedSources.map(s => {
                            const Icon = TYPE_ICONS[s.type] || FileText;
                            const a = s.analysis;
                            const open = expanded === s.id;
                            const fileUrl = s.file ? `/api/dossiers/${id}/sources/${s.id}/file` : null;
                            const isMailFile = /\.(eml|msg)$/i.test(s.file?.name || '');
                            const imageUrl = s.file?.mimetype?.startsWith('image/') ? `/api/dossiers/${id}/sources/${s.id}/file?inline=1` : null;
                            return (
                                <li key={s.id} id={`source-${s.id}`} className={classNames(styles.source, { [styles.sourceOpen]: open })}>
                                    <div className={styles.sourceRow}>
                                    <button type="button" className={styles.sourceHead} onClick={() => setExpanded(open ? null : s.id)}>
                                        <span className={styles.ref}>{refs[s.id]}</span>
                                        <Icon size={15} className={styles.typeIcon} aria-label={SOURCE_TYPES[s.type]} />
                                        <span className={styles.sourceTitle}>{s.title}</span>
                                        {s.status === 'processing' && <Loader2 size={14} className={styles.spin} />}
                                        {s.status === 'error' && <AlertTriangle size={14} className={styles.errIcon} />}
                                        <span className={styles.sourceDate}>{formatDate(s.date || s.createdAt)}</span>
                                        <ChevronDown size={14} className={classNames(styles.chevron, { [styles.chevronOpen]: open })} />
                                    </button>
                                    {isMailFile && (
                                        <a className={styles.outlookBtn} href={fileUrl} title="Ouvrir le mail d'origine dans Outlook">
                                            <Mail size={13} aria-hidden="true" /> Outlook
                                        </a>
                                    )}
                                    </div>
                                    {imageUrl && (
                                        <button type="button" className={classNames(styles.thumb, { [styles.thumbLarge]: open })} onClick={() => setLightbox({ url: imageUrl, title: s.title })} title="Agrandir">
                                            <img src={imageUrl} alt={s.title} loading="lazy" />
                                        </button>
                                    )}
                                    {!open && a?.resume && <p className={styles.sourceResume}>{a.resume}</p>}
                                    {s.mantis && <div className={styles.mantisState}>{s.mantis.etat}{s.mantis.priorite && ` · ${s.mantis.priorite}`}{s.mantis.affecte && ` · ${s.mantis.affecte}`}</div>}
                                    {s.status === 'error' && (
                                        <div className={styles.sourceError}>
                                            {s.error}
                                            <button type="button" className={styles.ghostBtn} onClick={() => sourceAction(s.id, 'POST', '/retry')}><RotateCw size={13} /> Réessayer</button>
                                        </div>
                                    )}
                                    {open && (
                                        <div className={styles.sourceBody}>
                                            {s.autoFrom && sourcesById[s.autoFrom] && <p className={styles.muted}>Ajouté automatiquement (cité dans {refs[s.autoFrom]})</p>}
                                            {a && (
                                                <>
                                                    {a.auteurs.length > 0 && <p className={styles.muted}>{a.auteurs.join(', ')}</p>}
                                                    <p>{a.resume}</p>
                                                    {a.points_cles.length > 0 && <><h5>Points clés</h5><ul className={styles.list}>{a.points_cles.map((p, i) => <li key={i}>{p}</li>)}</ul></>}
                                                    {a.decisions.length > 0 && <><h5>Décisions</h5><ul className={styles.list}>{a.decisions.map((p, i) => <li key={i}>{p}</li>)}</ul></>}
                                                    {a.actions.length > 0 && <><h5>Actions</h5><ul className={styles.list}>{a.actions.map((p, i) => <li key={i}><span className={styles.who}>{p.qui}</span> {p.quoi}{p.echeance && <span className={styles.due}>{p.echeance}</span>}</li>)}</ul></>}
                                                    {a.questions.length > 0 && <><h5>Questions</h5><ul className={styles.list}>{a.questions.map((p, i) => <li key={i}>{p}</li>)}</ul></>}
                                                </>
                                            )}
                                            <textarea
                                                key={s.id}
                                                className={styles.sourceNote}
                                                defaultValue={s.note}
                                                placeholder="Ma note sur cette source (prise en compte par l'IA)…"
                                                onBlur={e => e.target.value !== s.note && sourceAction(s.id, 'PUT', '', { note: e.target.value })}
                                            />
                                            <div className={styles.sourceActions}>
                                                {s.textLength > 0 && <button type="button" className={styles.ghostBtn} onClick={() => toggleFullText(s.id)}><FileText size={13} /> {fullTexts[s.id] !== undefined ? 'Masquer le texte' : 'Texte'}</button>}
                                                {s.file && <a className={styles.ghostBtn} href={fileUrl}><Download size={13} /> {s.file.name}</a>}
                                                {s.url && <a className={styles.ghostBtn} href={s.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Ouvrir</a>}
                                                {s.mantisId && mantisLink(s.mantisId) && <a className={styles.ghostBtn} href={mantisLink(s.mantisId)} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Mantis</a>}
                                                <button type="button" className={classNames(styles.ghostBtn, styles.dangerText)} onClick={() => deleteSource(s)}><Trash2 size={13} /> Retirer</button>
                                            </div>
                                            {fullTexts[s.id] !== undefined && <pre className={styles.fullText}>{fullTexts[s.id]}</pre>}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>

            {lightbox && (
                <div className={styles.lightbox} onClick={() => setLightbox(null)}>
                    <img src={lightbox.url} alt={lightbox.title} onClick={e => e.stopPropagation()} />
                    <div className={styles.lightboxBar} onClick={e => e.stopPropagation()}>
                        <span>{lightbox.title}</span>
                        <a href={lightbox.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Nouvel onglet</a>
                        <button type="button" onClick={() => setLightbox(null)} title="Fermer (Échap)"><X size={16} /></button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DossierDetailPage;
