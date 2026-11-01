import React, { useMemo } from 'react';
import {
    ResponsiveContainer, LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip
} from 'recharts';
import { computeMantisStats, PRIORITY_KEYS } from '../../utils/mantisStats';
import styles from './MantisStats.module.css';

const PRIORITY_COLORS = { P1: '#e34948', P2: '#eda100', 'Non renseignée': '#64748b' };
const FLOW_COLORS = { created: '#3b82f6', closed: '#10b981' };
const AXIS = { stroke: '#64748b', fontSize: 11, tickLine: false, axisLine: false };
const GRID = { stroke: 'rgba(255,255,255,0.06)', vertical: false };
const TOOLTIP = {
    contentStyle: { backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid #334155', borderRadius: 8, fontSize: 12 },
    itemStyle: { color: '#f8fafc' },
    labelStyle: { color: '#94a3b8', fontWeight: 600 },
    cursor: { fill: 'rgba(255,255,255,0.04)' }
};

const Legend = ({ items }) => (
    <div className={styles.legend}>
        {items.map(([label, color, dashed]) => (
            <span key={label}>
                <i style={{ background: dashed ? 'transparent' : color, borderColor: color }} className={dashed ? styles.dashed : ''} />
                {label}
            </span>
        ))}
    </div>
);

const PRIORITY_LEGEND = PRIORITY_KEYS.map(k => [k, PRIORITY_COLORS[k]]);

const StackedPriorityBars = ({ data, layout = 'horizontal', height }) => (
    <div style={{ height }}>
        <ResponsiveContainer>
            <BarChart data={data} layout={layout === 'vertical' ? 'vertical' : 'horizontal'} margin={{ left: 0, right: 8 }}>
                <CartesianGrid {...GRID} vertical={layout === 'vertical'} horizontal={layout !== 'vertical'} />
                {layout === 'vertical' ? (
                    <>
                        <XAxis type="number" allowDecimals={false} {...AXIS} />
                        <YAxis type="category" dataKey="name" width={150} {...AXIS} />
                    </>
                ) : (
                    <>
                        <XAxis dataKey="label" {...AXIS} />
                        <YAxis allowDecimals={false} width={30} {...AXIS} />
                    </>
                )}
                <Tooltip {...TOOLTIP} />
                {PRIORITY_KEYS.map((k, i) => (
                    <Bar key={k} dataKey={k} stackId="p" fill={PRIORITY_COLORS[k]} maxBarSize={layout === 'vertical' ? 18 : 40}
                        radius={i === PRIORITY_KEYS.length - 1 ? (layout === 'vertical' ? [0, 3, 3, 0] : [3, 3, 0, 0]) : 0} />
                ))}
            </BarChart>
        </ResponsiveContainer>
    </div>
);

const heatColor = (value, max) => {
    if (!value) return 'transparent';
    const alpha = 0.15 + 0.7 * (value / max);
    return `rgba(59, 130, 246, ${alpha.toFixed(2)})`;
};

const MantisStats = ({ data }) => {
    const stats = useMemo(() => computeMantisStats(data), [data]);
    const { kpis } = stats;

    if (data.length === 0) {
        return <div className={styles.empty}>Aucun ticket ne correspond aux filtres sélectionnés.</div>;
    }

    const heatMax = Math.max(1, ...stats.domains.flatMap(d => PRIORITY_KEYS.map(k => d[k])));

    return (
        <div className={styles.stats}>
            <div className={styles.kpis}>
                <div className={styles.kpi}>
                    <span className={styles.kpiLabel}>Tickets ouverts</span>
                    <span className={styles.kpiValue}>{kpis.open}</span>
                    <span className={styles.kpiSub}>dont {kpis.openP1} P1</span>
                </div>
                <div className={styles.kpi}>
                    <span className={styles.kpiLabel}>Créés sur 30 jours</span>
                    <span className={styles.kpiValue}>{kpis.created30}</span>
                    <span className={styles.kpiSub}>{kpis.createdThisWeek} cette semaine</span>
                </div>
                <div className={styles.kpi}>
                    <span className={styles.kpiLabel}>Âge médian des ouverts</span>
                    <span className={styles.kpiValue}>{kpis.medianAge} j</span>
                    <span className={styles.kpiSub}>moyenne {kpis.meanAge} j</span>
                </div>
                <div className={styles.kpi}>
                    <span className={styles.kpiLabel}>Sans activité &gt; 30 jours</span>
                    <span className={styles.kpiValue} style={{ color: kpis.stale ? 'var(--color-amber)' : undefined }}>{kpis.stale}</span>
                    <span className={styles.kpiSub}>tickets ouverts</span>
                </div>
                <div className={styles.kpi}>
                    <span className={styles.kpiLabel}>Suspendus</span>
                    <span className={styles.kpiValue}>{kpis.suspended}</span>
                    <span className={styles.kpiSub}>ni ouverts ni clôturés</span>
                </div>
            </div>

            <section className={styles.card}>
                <h4 className={styles.cardTitle}>Flux hebdomadaire : créés et clôturés (12 semaines)</h4>
                <Legend items={[['Créés', FLOW_COLORS.created], ['Clôturés (Validé, Fermé, Annulé)', FLOW_COLORS.closed, true]]} />
                <div style={{ height: 220 }}>
                    <ResponsiveContainer>
                        <LineChart data={stats.weeks} margin={{ left: 0, right: 8 }}>
                            <CartesianGrid {...GRID} />
                            <XAxis dataKey="label" {...AXIS} />
                            <YAxis allowDecimals={false} width={30} {...AXIS} />
                            <Tooltip {...TOOLTIP} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} />
                            <Line type="monotone" dataKey="created" name="Créés" stroke={FLOW_COLORS.created} strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="closed" name="Clôturés" stroke={FLOW_COLORS.closed} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </section>

            <div className={styles.grid}>
                <section className={styles.card}>
                    <h4 className={styles.cardTitle}>Ancienneté des tickets ouverts</h4>
                    <Legend items={PRIORITY_LEGEND} />
                    <StackedPriorityBars data={stats.ageBuckets} height={220} />
                </section>

                <section className={styles.card}>
                    <h4 className={styles.cardTitle}>Domaines × priorité (ouverts)</h4>
                    <table className={styles.heatmap}>
                        <thead>
                            <tr><th />{PRIORITY_KEYS.map(k => <th key={k}>{k === 'Non renseignée' ? 'Non rens.' : k}</th>)}<th>Total</th></tr>
                        </thead>
                        <tbody>
                            {stats.domains.map(d => (
                                <tr key={d.name}>
                                    <td className={styles.heatLabel}>{d.name}</td>
                                    {PRIORITY_KEYS.map(k => (
                                        <td key={k} style={{ background: heatColor(d[k], heatMax) }} className={d[k] ? '' : styles.heatZero}>
                                            {d[k] || '·'}
                                        </td>
                                    ))}
                                    <td className={styles.heatTotal}>{d.total}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {stats.domains.length === 0 && <div className={styles.emptySmall}>Aucun ticket ouvert</div>}
                </section>
            </div>

            <div className={styles.grid}>
                <section className={styles.card}>
                    <h4 className={styles.cardTitle}>Ouverts par état</h4>
                    <div style={{ height: Math.max(120, stats.states.length * 40 + 30) }}>
                        <ResponsiveContainer>
                            <BarChart data={stats.states} layout="vertical" margin={{ left: 0, right: 8 }}>
                                <CartesianGrid {...GRID} vertical horizontal={false} />
                                <XAxis type="number" allowDecimals={false} {...AXIS} />
                                <YAxis type="category" dataKey="name" width={150} {...AXIS} />
                                <Tooltip {...TOOLTIP} />
                                <Bar dataKey="value" name="Tickets" fill="#3b82f6" maxBarSize={18} radius={[0, 3, 3, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <section className={styles.card}>
                    <h4 className={styles.cardTitle}>Ouverts par personne (top 8)</h4>
                    <Legend items={PRIORITY_LEGEND} />
                    <StackedPriorityBars data={stats.assignees} layout="vertical" height={Math.max(120, stats.assignees.length * 34 + 30)} />
                </section>
            </div>

            <p className={styles.note}>
                Hors P3. Les tickets « Résolu » comptent comme ouverts (en attente de validation).
                La date de clôture est approchée par la date « Mis à jour » des tickets Validés, Fermés ou Annulés.
            </p>
        </div>
    );
};

export default MantisStats;
