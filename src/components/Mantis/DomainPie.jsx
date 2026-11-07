import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DOMAIN_PALETTE } from '../../config/colors';
import styles from './DomainPie.module.css';

const NO_DOMAIN = 'Sans domaine';
const NO_DOMAIN_COLOR = '#94a3b8';
const domainOf = (row) => (row['Domaine (Toray)'] || '').trim() || NO_DOMAIN;

// Donut of the rows by domain. Colors come from `allRows` (biggest domain first),
// so a domain keeps the same color whatever the filters leave in `rows`.
const DomainPie = ({ rows, allRows }) => {
    const [active, setActive] = useState(null);

    const colorOf = useMemo(() => {
        const counts = {};
        allRows.forEach(row => { const d = domainOf(row); counts[d] = (counts[d] || 0) + 1; });
        const names = Object.keys(counts).filter(n => n !== NO_DOMAIN).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
        const map = Object.fromEntries(names.map((n, i) => [n, DOMAIN_PALETTE[i % DOMAIN_PALETTE.length]]));
        return (name) => map[name] || NO_DOMAIN_COLOR;
    }, [allRows]);

    const slices = useMemo(() => {
        const counts = {};
        rows.forEach(row => { const d = domainOf(row); counts[d] = (counts[d] || 0) + 1; });
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    }, [rows]);

    const total = rows.length;
    if (total === 0) return null;
    const max = slices[0].value;
    const focused = slices.find(s => s.name === active);
    const pct = (value) => {
        const p = (value / total) * 100;
        return p < 1 ? '<1 %' : `${Math.round(p)} %`;
    };

    return (
        <section className={styles.card}>
            <header className={styles.header}>
                <h3>Répartition par domaine</h3>
                <span>{total} mantis · {slices.length} domaine{slices.length > 1 ? 's' : ''}</span>
            </header>
            <div className={styles.body}>
                <div className={styles.chart}>
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie
                                data={slices}
                                dataKey="value"
                                nameKey="name"
                                innerRadius="64%"
                                outerRadius="96%"
                                paddingAngle={slices.length > 1 ? 2 : 0}
                                cornerRadius={5}
                                stroke="none"
                                startAngle={90}
                                endAngle={-270}
                                animationDuration={450}
                                onMouseEnter={(slice) => setActive(slice.name)}
                                onMouseLeave={() => setActive(null)}
                            >
                                {slices.map(s => (
                                    <Cell
                                        key={s.name}
                                        fill={colorOf(s.name)}
                                        fillOpacity={!active || active === s.name ? 1 : 0.25}
                                        className={styles.slice}
                                    />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div className={styles.center}>
                        <strong>{focused ? focused.value : total}</strong>
                        <span>{focused ? `${focused.name} · ${pct(focused.value)}` : 'mantis'}</span>
                    </div>
                </div>
                <ul className={styles.legend}>
                    {slices.map(s => (
                        <li
                            key={s.name}
                            className={active && active !== s.name ? styles.dimmed : ''}
                            onMouseEnter={() => setActive(s.name)}
                            onMouseLeave={() => setActive(null)}
                        >
                            <i style={{ background: colorOf(s.name) }} />
                            <span className={styles.name}>{s.name}</span>
                            <span className={styles.bar}>
                                <span style={{ width: `${(s.value / max) * 100}%`, background: colorOf(s.name) }} />
                            </span>
                            <span className={styles.count}>{s.value}</span>
                            <span className={styles.pct}>{pct(s.value)}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
};

export default DomainPie;
