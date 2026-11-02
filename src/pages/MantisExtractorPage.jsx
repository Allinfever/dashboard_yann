import React, { useState } from 'react';
import styles from './MantisExtractorPage.module.css';

const MantisExtractorPage = () => {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState('');

    const startExtraction = async (type) => {
        setLoading(true);
        setError(null);
        setStatus(null);
        setProgress(0);
        setCurrentStep('Initialisation de l\'extraction...');

        try {
            const response = await fetch('/api/mantis/extract-full', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: type })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Erreur lors de l\'extraction');
            }

            const { jobId } = await response.json();

            // Poll for status
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/mantis/extract-status/${jobId}`);
                    if (!statusRes.ok) return;

                    const data = await statusRes.json();
                    setProgress(data.progress || 0);
                    setCurrentStep(data.step || 'En cours...');

                    if (data.status === 'completed') {
                        clearInterval(pollInterval);
                        setLoading(false);
                        setStatus('Extraction terminée avec succès !');
                        setCurrentStep('Fichier prêt.');

                        // Automatically trigger download
                        window.location.href = `/api/mantis/extract-download/${jobId}`;
                    } else if (data.status === 'failed') {
                        clearInterval(pollInterval);
                        setLoading(false);
                        setError(data.error || 'L\'extraction a échoué');
                    }
                } catch (e) {
                    console.error('Polling error:', e);
                }
            }, 2000);

        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1>Mantis & Notes Extractor</h1>
                <p className={styles.subtitle}>Extraction complète des tickets avec notes et pièces jointes pour analyse LLM</p>
            </header>

            <div className={styles.grid}>
                <div className={styles.card}>
                    <div className={styles.icon}>📁</div>
                    <h2>Domaine SD</h2>
                    <p>Extrait tous les tickets du domaine <strong>SD</strong>, incluant la description détaillée, l'historique des notes et la liste des pièces jointes.</p>
                    <button
                        className={styles.extractBtn}
                        onClick={() => startExtraction('SD')}
                        disabled={loading}
                    >
                        {loading ? 'Extraction...' : 'Extraction Mantis et Notes SD'}
                    </button>
                </div>

                <div className={styles.card}>
                    <div className={styles.icon}>📂</div>
                    <h2>Domaine RDD</h2>
                    <p>Extrait tous les tickets du domaine <strong>RDD</strong>, incluant la description détaillée, l'historique des notes et la liste des pièces jointes.</p>
                    <button
                        className={styles.extractBtn}
                        onClick={() => startExtraction('RDD')}
                        disabled={loading}
                    >
                        {loading ? 'Extraction...' : 'Extraction Mantis et Notes RDD'}
                    </button>
                </div>
            </div>

            {(loading || status || error) && (
                <div className={styles.status}>
                    <h3>État de l'opération</h3>
                    {currentStep && <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>{currentStep}</p>}

                    {loading && (
                        <div className={styles.progressContainer}>
                            <div className={styles.progressBar}>
                                <div className={styles.progressFill} style={{ width: `${progress}%` }}></div>
                            </div>
                            <div className={styles.progressInfo}>
                                <span>Progression</span>
                                <span>{Math.round(progress)}%</span>
                            </div>
                        </div>
                    )}

                    {status && <div className={styles.success}>✓ {status}</div>}
                    {error && <div className={styles.error}>⚠ {error}</div>}
                </div>
            )}
        </div>
    );
};

export default MantisExtractorPage;
