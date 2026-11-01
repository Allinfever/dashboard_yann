import React, { useState, useMemo, useEffect, useRef } from 'react';
import classNames from 'classnames';
import {
    FACETS, DATE_FIELDS, DATE_PRESETS, EMPTY_LABEL, EMPTY_FILTERS,
    valueOf, resolveRange, describeDate, hasDateFilter, rowMatches
} from '../../utils/mantisFilters';
import styles from './MantisFilters.module.css';

// --- Dropdown shell (closes on outside click / Escape) ---
const Dropdown = ({ label, active, badge, children }) => {
    const [open, setOpen] = useState(false);
    const [alignRight, setAlignRight] = useState(false);
    const ref = useRef(null);

    const toggle = () => {
        // Open towards the left when the panel would overflow the window
        if (!open && ref.current) {
            setAlignRight(ref.current.getBoundingClientRect().left + 300 > window.innerWidth);
        }
        setOpen(o => !o);
    };

    useEffect(() => {
        if (!open) return undefined;
        const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div className={styles.dropdown} ref={ref}>
            <button
                type="button"
                className={classNames(styles.trigger, { [styles.triggerActive]: active, [styles.triggerOpen]: open })}
                onClick={toggle}
                aria-expanded={open}
            >
                {label}
                {badge && <span className={styles.badge}>{badge}</span>}
                <span className={styles.caret}>▾</span>
            </button>
            {open && <div className={classNames(styles.panel, { [styles.panelRight]: alignRight })}>{children}</div>}
        </div>
    );
};

const FacetFilter = ({ facet, options, selected, onChange }) => {
    const [search, setSearch] = useState('');
    const visible = options.filter(o => (o.value || EMPTY_LABEL).toLowerCase().includes(search.toLowerCase()));

    const toggle = (value) => onChange(
        selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]
    );

    return (
        <Dropdown
            label={facet.label}
            active={selected.length > 0}
            badge={selected.length > 0 ? selected.length : null}
        >
            {options.length > 8 && (
                <input
                    className={styles.panelSearch}
                    placeholder="Rechercher..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                />
            )}
            <div className={styles.panelActions}>
                <button type="button" onClick={() => onChange(visible.map(o => o.value))}>Tout cocher</button>
                <button type="button" onClick={() => onChange([])} disabled={selected.length === 0}>Effacer</button>
            </div>
            <div className={styles.optionList}>
                {visible.map(o => (
                    <label key={o.value} className={classNames(styles.option, { [styles.optionMuted]: o.count === 0 })}>
                        <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                        <span className={styles.optionLabel}>{o.value || EMPTY_LABEL}</span>
                        <span className={styles.optionCount}>{o.count}</span>
                    </label>
                ))}
                {visible.length === 0 && <div className={styles.noOption}>Aucune valeur</div>}
            </div>
        </Dropdown>
    );
};

const DateFilter = ({ dateField, filter, onChange }) => {
    const active = hasDateFilter(filter);
    const range = active ? resolveRange(filter) : { from: '', to: '' };

    return (
        <Dropdown label={dateField.label} active={active} badge={active ? '1' : null}>
            <div className={styles.presetList}>
                {DATE_PRESETS.map(p => (
                    <button
                        key={p.id}
                        type="button"
                        className={classNames(styles.preset, { [styles.presetActive]: filter?.preset === p.id })}
                        onClick={() => onChange(filter?.preset === p.id ? null : { preset: p.id })}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            <div className={styles.dateInputs}>
                <label>
                    Du
                    <input type="date" value={range.from} onChange={(e) => onChange({ from: e.target.value, to: range.to })} />
                </label>
                <label>
                    Au
                    <input type="date" value={range.to} onChange={(e) => onChange({ from: range.from, to: e.target.value })} />
                </label>
            </div>
            <div className={styles.panelActions}>
                <button type="button" onClick={() => onChange(null)} disabled={!active}>Effacer</button>
            </div>
        </Dropdown>
    );
};

const MantisFilters = ({ data, filters, onChange, resultCount }) => {
    // Only offer filters for columns present in the data with more than one value
    const facetOptions = useMemo(() => {
        const result = {};
        FACETS.forEach(facet => {
            if (!data.some(row => facet.field in row)) return;
            const all = new Set(data.map(row => valueOf(row, facet.field)));
            const selected = filters.facets[facet.field] || [];
            if (all.size < 2 && selected.length === 0) return;

            // Counts take every other active filter into account
            const counts = new Map();
            data.forEach(row => {
                if (!rowMatches(row, filters, facet.field)) return;
                const v = valueOf(row, facet.field);
                counts.set(v, (counts.get(v) || 0) + 1);
            });
            selected.forEach(v => all.add(v));

            result[facet.field] = [...all]
                .map(value => ({ value, count: counts.get(value) || 0 }))
                .sort((a, b) => {
                    if (facet.field === 'priorite_p') return (a.value || 'Z').localeCompare(b.value || 'Z');
                    return b.count - a.count || a.value.localeCompare(b.value);
                });
        });
        return result;
    }, [data, filters]);

    const dateFields = DATE_FIELDS.filter(d => data.some(row => valueOf(row, d.field)));

    const setFacet = (field, values) => onChange(prev => ({ ...prev, facets: { ...prev.facets, [field]: values } }));
    const setDate = (field, filter) => onChange(prev => ({ ...prev, dates: { ...prev.dates, [field]: filter } }));

    const chips = [
        ...FACETS.flatMap(facet => (filters.facets[facet.field] || []).map(value => ({
            key: `${facet.field}:${value}`,
            label: `${facet.label} : ${value || EMPTY_LABEL}`,
            remove: () => setFacet(facet.field, filters.facets[facet.field].filter(v => v !== value))
        }))),
        ...DATE_FIELDS.filter(d => hasDateFilter(filters.dates[d.field])).map(d => ({
            key: `date:${d.field}`,
            label: `${d.label} : ${describeDate(filters.dates[d.field])}`,
            remove: () => setDate(d.field, null)
        }))
    ];

    return (
        <div className={styles.bar}>
            <div className={styles.row}>
                <span className={styles.title}>Filtres</span>
                {FACETS.filter(f => facetOptions[f.field]).map(facet => (
                    <FacetFilter
                        key={facet.field}
                        facet={facet}
                        options={facetOptions[facet.field]}
                        selected={filters.facets[facet.field] || []}
                        onChange={(values) => setFacet(facet.field, values)}
                    />
                ))}
                {dateFields.map(d => (
                    <DateFilter
                        key={d.field}
                        dateField={d}
                        filter={filters.dates[d.field]}
                        onChange={(filter) => setDate(d.field, filter)}
                    />
                ))}
            </div>
            {chips.length > 0 && (
                <div className={styles.row}>
                    <span className={styles.resultCount}>{resultCount} résultat{resultCount > 1 ? 's' : ''}</span>
                    {chips.map(chip => (
                        <button key={chip.key} type="button" className={styles.chip} onClick={chip.remove} title="Retirer ce filtre">
                            {chip.label}
                            <span className={styles.chipClose}>×</span>
                        </button>
                    ))}
                    <button type="button" className={styles.clearAll} onClick={() => onChange(EMPTY_FILTERS)}>
                        Tout effacer
                    </button>
                </div>
            )}
        </div>
    );
};

export default MantisFilters;
