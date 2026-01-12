import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styles from './OpenTopicDetailPage.module.css';

const STATUSES = ['Backlog', 'En cours', 'Bloqué', 'En attente', 'Terminé', 'Abandonné'];
const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];

const OpenTopicDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [topic, setTopic] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');
    const saveTimeoutRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchTopic();
    }, [id]);

    const fetchTopic = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/open-topics/${id}`);
            if (!res.ok) throw new Error('Sujet non trouvé');
            const data = await res.json();
            setTopic(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 2000);
    };

    const autoSave = useCallback((updates) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            setSaving(true);
            try {
                const res = await fetch(`/api/open-topics/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates)
                });
                if (!res.ok) throw new Error('Erreur sauvegarde');
                const updated = await res.json();
                setTopic(updated);
                showToast('✓ Enregistré');
            } catch (e) {
                showToast('⚠ Erreur sauvegarde');
            } finally {
                setSaving(false);
            }
        }, 800);
    }, [id]);

    const updateField = (field, value) => {
        setTopic(prev => ({ ...prev, [field]: value }));
        autoSave({ [field]: value });
    };

    const handleDelete = async () => {
        if (!confirm('Supprimer définitivement ce sujet et ses pièces jointes ?')) return;

        try {
            await fetch(`/api/open-topics/${id}`, { method: 'DELETE' });
            window.close();
        } catch (e) {
            alert('Erreur suppression');
        }
    };

    const handleFileUpload = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const formData = new FormData();
        Array.from(files).forEach(f => formData.append('files', f));

        try {
            setSaving(true);
            const res = await fetch(`/api/open-topics/${id}/attachments`, {
                method: 'POST',
                body: formData
            });
            if (!res.ok) throw new Error('Erreur upload');
            const result = await res.json();
            setTopic(result.topic);
            showToast('✓ Fichiers ajoutés');
        } catch (e) {
            showToast('⚠ Erreur upload');
        } finally {
            setSaving(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const deleteAttachment = async (attId) => {
        if (!confirm('Supprimer ce fichier ?')) return;

        try {
            const res = await fetch(`/api/open-topics/${id}/attachments/${attId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Erreur suppression');
            const result = await res.json();
            setTopic(result.topic);
            showToast('✓ Fichier supprimé');
        } catch (e) {
            showToast('⚠ Erreur suppression');
        }
    };

    const addLink = () => {
        const label = prompt('Label du lien:');
        if (!label) return;
        const url = prompt('URL:');
        if (!url) return;

        const newLinks = [...(topic.links || []), { label, url }];
        updateField('links', newLinks);
    };

    const removeLink = (idx) => {
        const newLinks = (topic.links || []).filter((_, i) => i !== idx);
        updateField('links', newLinks);
    };

    const formatSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleString('fr-FR');
    };

    if (loading) {
        return <div className={styles.container}><div className={styles.loading}>Chargement...</div></div>;
    }

    if (error) {
        return (
            <div className={styles.container}>
                <div className={styles.error}>
                    <p>{error}</p>
                    <button onClick={() => window.close()} className={styles.secondaryBtn}>Fermer</button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {toast && <div className={styles.toast}>{toast}</div>}

            {/* Header */}
            <div className={styles.header}>
                <input
                    type="text"
                    value={topic.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    className={styles.titleInput}
                    placeholder="Titre du sujet"
                />
                <div className={styles.headerActions}>
                    <button onClick={() => navigate('/open-topics')} className={styles.secondaryBtn}>
                        ← Liste
                    </button>
                    <button onClick={handleDelete} className={styles.dangerBtn}>
                        Supprimer
                    </button>
                </div>
            </div>

            {/* Meta Row */}
            <div className={styles.metaRow}>
                <div className={styles.metaItem}>
                    <label>Statut</label>
                    <select value={topic.status} onChange={(e) => updateField('status', e.target.value)}>
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className={styles.metaItem}>
                    <label>Priorité</label>
                    <select value={topic.priority} onChange={(e) => updateField('priority', e.target.value)}>
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div className={styles.metaItem}>
                    <label>Responsable</label>
                    <input
                        type="text"
                        value={topic.owner || ''}
                        onChange={(e) => updateField('owner', e.target.value)}
                        placeholder="Nom"
                    />
                </div>
                <div className={styles.metaItem}>
                    <label>Échéance</label>
                    <input
                        type="date"
                        value={topic.dueDate || ''}
                        onChange={(e) => updateField('dueDate', e.target.value)}
                    />
                </div>
            </div>

            {/* Tags */}
            <div className={styles.section}>
                <label>Tags</label>
                <input
                    type="text"
                    value={(topic.tags || []).join(', ')}
                    onChange={(e) => updateField('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                    placeholder="tag1, tag2, ..."
                    className={styles.fullInput}
                />
            </div>

            {/* Summary */}
            <div className={styles.section}>
                <label>Résumé</label>
                <input
                    type="text"
                    value={topic.summary || ''}
                    onChange={(e) => updateField('summary', e.target.value)}
                    placeholder="Résumé court"
                    className={styles.fullInput}
                />
            </div>

            {/* Description */}
            <div className={styles.section}>
                <label>Description</label>
                <textarea
                    value={topic.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Description détaillée..."
                    className={styles.descriptionArea}
                />
            </div>

            {/* Links */}
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <label>Liens</label>
                    <button onClick={addLink} className={styles.smallBtn}>+ Ajouter</button>
                </div>
                <div className={styles.linksList}>
                    {(topic.links || []).length === 0 && <span className={styles.empty}>Aucun lien</span>}
                    {(topic.links || []).map((link, idx) => (
                        <div key={idx} className={styles.linkItem}>
                            <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
                            <button onClick={() => removeLink(idx)} className={styles.removeBtn}>×</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Attachments */}
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <label>Pièces jointes</label>
                    <button onClick={() => fileInputRef.current?.click()} className={styles.smallBtn}>
                        + Ajouter fichiers
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                    />
                </div>
                <div className={styles.attachmentsList}>
                    {(topic.attachments || []).length === 0 && <span className={styles.empty}>Aucune pièce jointe</span>}
                    {(topic.attachments || []).map(att => (
                        <div key={att.id} className={styles.attachmentItem}>
                            <a href={att.url} target="_blank" rel="noopener noreferrer" className={styles.attachmentLink}>
                                📎 {att.originalName}
                            </a>
                            <span className={styles.attachmentMeta}>
                                {formatSize(att.size)} • {formatDate(att.uploadedAt)}
                            </span>
                            <button onClick={() => deleteAttachment(att.id)} className={styles.removeBtn}>×</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer Info */}
            <div className={styles.footer}>
                <span>Créé : {formatDate(topic.createdAt)}</span>
                <span>Modifié : {formatDate(topic.updatedAt)}</span>
                {saving && <span className={styles.savingIndicator}>Enregistrement...</span>}
            </div>
        </div>
    );
};

export default OpenTopicDetailPage;
