import React, { useMemo } from 'react';
import { computeCoproSummary, COPRO_RULES } from '../../utils/mantisUtils';
import styles from './CoproSummary.module.css';
import classNames from 'classnames';

const CoproSummary = ({ data, loading }) => {
    const stats = useMemo(() => computeCoproSummary(data), [data]);

    if (loading && (!data || data.length === 0)) {
        return <div className={styles.container}>Chargement des indicateurs...</div>;
    }

    return (
        <div className={styles.container}>
            <table className={styles.tableContainer}>
                <thead>
                    <tr>
                        <th className={styles.firstCol}>Mantis</th>
                        <th>Projet</th>
                        <th>Evolution</th>
                    </tr>
                </thead>
                <tbody>
                    {/* Encours Section */}
                    <tr className={styles.rowEncours}>
                        <td className={styles.firstCol}>Encours</td>
                        <td className={styles.value}>{stats.encours.projet.total}</td>
                        <td className={styles.value}>{stats.encours.evolution.total}</td>
                    </tr>
                    <tr className={styles.rowEncoursSub}>
                        <td className={classNames(styles.firstCol, styles.subLabel)}>Dont P1</td>
                        <td>{stats.encours.projet.p1}</td>
                        <td>{stats.encours.evolution.p1}</td>
                    </tr>
                    <tr className={styles.rowEncoursSub}>
                        <td className={classNames(styles.firstCol, styles.subLabel)}>Dont P3</td>
                        <td>{stats.encours.projet.p3}</td>
                        <td>{stats.encours.evolution.p3}</td>
                    </tr>

                    {/* Resolues Section */}
                    <tr className={styles.rowResolues}>
                        <td className={styles.firstCol}>Résolues (Yann)</td>
                        <td className={styles.value}>{stats.resolues.projet.total}</td>
                        <td className={styles.value}>{stats.resolues.evolution.total}</td>
                    </tr>
                    <tr className={styles.rowResoluesSub}>
                        <td className={classNames(styles.firstCol, styles.subLabel)}>Dont P1</td>
                        <td>{stats.resolues.projet.p1}</td>
                        <td>{stats.resolues.evolution.p1}</td>
                    </tr>
                    <tr className={styles.rowResoluesSub}>
                        <td className={classNames(styles.firstCol, styles.subLabel)}>Dont P3</td>
                        <td>{stats.resolues.projet.p3}</td>
                        <td>{stats.resolues.evolution.p3}</td>
                    </tr>
                </tbody>
            </table>

            <div className={styles.rulesSection}>
                <span className={styles.rulesTitle}>Règles de calcul</span>
                <ul className={styles.rulesList}>
                    {COPRO_RULES.map((r, i) => (
                        <li key={i} className={styles.ruleItem}>
                            <span className={styles.ruleLabel}>{r.rule} :</span>
                            {r.desc}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default CoproSummary;
