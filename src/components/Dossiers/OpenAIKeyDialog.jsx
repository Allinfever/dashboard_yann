import React, { useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import styles from './OpenAIKeyDialog.module.css';

const OpenAIKeyDialog = ({ status, onClose, onSaved }) => {
    const [apiKey, setApiKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const save = async (e) => {
        e.preventDefault();
        if (!apiKey.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/dossiers/ai-key', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: apiKey.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Enregistrement impossible');
            onSaved();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!confirm('Retirer la clé enregistrée ?')) return;
        await fetch('/api/dossiers/ai-key', { method: 'DELETE' });
        onSaved();
    };

    return (
        <div className={styles.backdrop} onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <form className={styles.dialog} onSubmit={save} onKeyDown={e => e.key === 'Escape' && onClose()}>
                <div className={styles.head}>
                    <KeyRound size={18} aria-hidden="true" />
                    <h3>Clé OpenAI</h3>
                    <button type="button" className={styles.close} onClick={onClose} title="Fermer"><X size={16} /></button>
                </div>

                <p className={styles.status}>
                    {status?.configured
                        ? <>Clé active <strong>{status.keyHint}</strong>{status.origin === 'env' ? ' (fichier .env.local)' : ' (enregistrée)'}</>
                        : 'Aucune clé configurée.'}
                </p>

                <input
                    type="password"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    className={styles.input}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="Colle ta clé : sk-…"
                />
                <p className={styles.hint}>La clé est vérifiée auprès d'OpenAI puis conservée sur le serveur : pas besoin de la ressaisir.</p>
                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.actions}>
                    {status?.origin === 'saved' && <button type="button" className={styles.linkBtn} onClick={remove}>Retirer la clé</button>}
                    <button type="button" className={styles.secondaryBtn} onClick={onClose}>Annuler</button>
                    <button type="submit" className={styles.primaryBtn} disabled={saving || !apiKey.trim()}>
                        {saving && <Loader2 size={14} className="spin" />} {saving ? 'Vérification…' : 'Enregistrer'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default OpenAIKeyDialog;
