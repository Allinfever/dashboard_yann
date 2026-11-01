import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    flexRender,
} from '@tanstack/react-table';
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    closestCenter,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './DataTable.module.css';

// --- Blacklisted columns (never show) ---
const COLUMN_BLACKLIST = [
    'Type de développement',
    'Visibilité',
    'Reproductibilité',
    'Projet'
];

// --- Helper: accent and case insensitive text ---
const normalizeText = (val) => (val ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// --- Helper: every searched word must appear somewhere in the row ---
// IDs are also searchable without their leading zeros ("17259" finds "0017259")
const matchesSearch = (row, words) => {
    const text = Object.values(row)
        .map(v => {
            const s = normalizeText(v);
            return /^0+\d+$/.test(s) ? `${s} ${s.replace(/^0+/, '')}` : s;
        })
        .join(' | ');
    return words.every(word => text.includes(word));
};

const columnFilterFn = (row, columnId, value) =>
    normalizeText(row.getValue(columnId)).includes(normalizeText(value).trim());

// --- Helper: Check if column is empty across all rows ---
const isColumnEmpty = (rows, key) => {
    if (!rows || rows.length === 0) return true;
    return rows.every(row => {
        const val = row[key];
        return val === null || val === undefined || (typeof val === 'string' && val.trim() === '');
    });
};


// --- Helper: Build visible columns (filter blacklist + empty) ---
const buildVisibleColumns = (rows, allColumns) => {
    return allColumns.filter(col => {
        const key = col.id || col.accessorKey;
        // Remove blacklisted
        if (COLUMN_BLACKLIST.includes(key)) return false;
        // Remove empty columns
        if (isColumnEmpty(rows, key)) return false;
        return true;
    });
};

// --- Sortable Header Component ---
const SortableHeader = ({ header, table }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: header.id,
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.8 : 1,
    };

    return (
        <th
            ref={setNodeRef}
            style={style}
            className={styles.th}
            colSpan={header.colSpan}
        >
            <div className={styles.headerContent}>
                <div
                    className={styles.dragHandle}
                    {...attributes}
                    {...listeners}
                >
                    ⠿
                </div>
                <div
                    onClick={header.column.getToggleSortingHandler()}
                    className={styles.sortableLabel}
                >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{
                        asc: ' 🔼',
                        desc: ' 🔽',
                    }[header.column.getIsSorted()] ?? null}
                </div>
            </div>

            {/* Column Filter */}
            <div className={styles.filterContainer}>
                <input
                    value={(header.column.getFilterValue() ?? '')}
                    onChange={(e) => header.column.setFilterValue(e.target.value)}
                    placeholder={`Filtrer...`}
                    className={styles.columnFilter}
                    onClick={(e) => e.stopPropagation()}
                />
            </div>
        </th>
    );
};

const DataTable = ({
    data,
    columns: rawColumns,
    storageKey = 'table_column_order',
    tabId = 'default',
    entityLabel = 'mantis',
    filenamePrefix = 'mantis'
}) => {
    const [sorting, setSorting] = useState([]);
    const [globalFilter, setGlobalFilter] = useState('');
    const [columnFilters, setColumnFilters] = useState([]);
    const [isExporting, setIsExporting] = useState(false);

    // Filter columns: remove blacklist + empty
    const columns = useMemo(() => {
        return buildVisibleColumns(data, rawColumns);
    }, [data, rawColumns]);

    // Persistent Column Order
    const [columnOrder, setColumnOrder] = useState(() => {
        const saved = localStorage.getItem(storageKey);
        const initialOrder = columns.map(c => c.id || c.accessorKey);
        if (!saved) return initialOrder;

        const parsed = JSON.parse(saved);
        const newKeys = initialOrder.filter(key => !parsed.includes(key));
        return [...parsed.filter(key => initialOrder.includes(key)), ...newKeys];
    });

    useEffect(() => {
        const currentKeys = columns.map(c => c.id || c.accessorKey);
        setColumnOrder(prevOrder => {
            const validOrder = prevOrder.filter(key => currentKeys.includes(key));
            const missingKeys = currentKeys.filter(key => !validOrder.includes(key));
            if (missingKeys.length > 0 || validOrder.length !== prevOrder.length) {
                return [...validOrder, ...missingKeys];
            }
            return prevOrder;
        });
    }, [columns]);

    useEffect(() => {
        localStorage.setItem(storageKey, JSON.stringify(columnOrder));
    }, [columnOrder, storageKey]);

    const searchedData = useMemo(() => {
        const words = normalizeText(globalFilter).split(/\s+/).filter(Boolean);
        return words.length === 0 ? data : data.filter(row => matchesSearch(row, words));
    }, [data, globalFilter]);

    const table = useReactTable({
        data: searchedData,
        columns,
        defaultColumn: { filterFn: columnFilterFn },
        state: {
            sorting,
            columnFilters,
            columnOrder,
        },
        initialState: {
            pagination: {
                pageSize: 100,
            },
        },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnOrderChange: setColumnOrder,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
    });

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor)
    );

    function handleDragEnd(event) {
        const { active, over } = event;
        if (active && over && active.id !== over.id) {
            setColumnOrder((old) => {
                const oldIndex = old.indexOf(active.id);
                const newIndex = old.indexOf(over.id);
                return arrayMove(old, oldIndex, newIndex);
            });
        }
    }

    const resetOrder = () => {
        const defaultOrder = columns.map(c => c.id || c.accessorKey);
        setColumnOrder(defaultOrder);
        localStorage.removeItem(storageKey);
    };

    // --- Excel Export ---
    const exportExcel = useCallback(async () => {
        setIsExporting(true);
        try {
            const filteredRows = table.getFilteredRowModel().rows;
            const visibleColumnIds = columnOrder.filter(id => {
                const col = columns.find(c => (c.id || c.accessorKey) === id);
                if (!col) return false;
                const key = col.id || col.accessorKey;
                if (COLUMN_BLACKLIST.includes(key)) return false;
                // Check if empty in the current filtered set
                if (isColumnEmpty(filteredRows.map(r => r.original), key)) return false;
                return true;
            });

            // Map rows to original objects but only with visible columns and in correct order
            const exportData = filteredRows.map(row => {
                const obj = {};
                visibleColumnIds.forEach(id => {
                    obj[id] = row.original[id];
                });
                return obj;
            });

            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            const timeStr = now.toTimeString().slice(0, 5).replace(':', '-');
            const filename = `${filenamePrefix}_${tabId}_${dateStr}_${timeStr}`;

            const response = await fetch('/api/mantis/export/xlsx', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: exportData,
                    filename: filename,
                    tabName: tabId
                })
            });

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename}.xlsx`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Export error', e);
            alert('Échec de l\'export Excel');
        } finally {
            setIsExporting(false);
        }
    }, [table, columnOrder, columns, tabId, filenamePrefix]);


    const filteredCount = table.getFilteredRowModel().rows.length;

    return (
        <div className={styles.tableContainer}>
            <div className={styles.controls}>
                <div className={styles.leftControls}>
                    <span className={styles.rowCount}>
                        {filteredCount}
                        <span className={styles.rowCountLabel}>{entityLabel}</span>
                    </span>
                    <input
                        value={globalFilter ?? ''}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        placeholder="Rechercher (mots, n° de ticket...)"
                        className={styles.searchInput}
                    />
                    {(globalFilter || columnFilters.length > 0) && (
                        <button
                            onClick={() => { setGlobalFilter(''); setColumnFilters([]); }}
                            className={styles.resetBtn}
                            title="Vider la recherche et les filtres de colonnes"
                        >
                            Effacer la recherche
                        </button>
                    )}
                </div>
                <div className={styles.controlsRight}>
                    <button
                        onClick={exportExcel}
                        className={styles.exportBtn}
                        disabled={isExporting}
                    >
                        {isExporting ? 'Génération...' : '📊 Exporter Excel'}
                    </button>
                    <button onClick={resetOrder} className={styles.resetBtn}>
                        Réinitialiser colonnes
                    </button>
                </div>

                <div className={styles.paginationInfo}>
                    {filteredCount} lignes filtrées sur {data.length}
                </div>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                >
                                    <SortableContext
                                        items={columnOrder}
                                        strategy={horizontalListSortingStrategy}
                                    >
                                        {headerGroup.headers.map((header) => (
                                            <SortableHeader
                                                key={header.id}
                                                header={header}
                                                table={table}
                                            />
                                        ))}
                                    </SortableContext>
                                </DndContext>
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {table.getRowModel().rows.map((row) => (
                            <tr key={row.id} className={styles.tr}>
                                {row.getVisibleCells().map((cell) => {
                                    const colId = cell.column.id;
                                    const isResume = colId === 'Résumé' || colId === 'summary';
                                    return (
                                        <td key={cell.id} className={isResume ? styles.tdResume : styles.td}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className={styles.pagination}>
                <div className={styles.pageJump}>
                    <button
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                        className={styles.pageBtn}
                    >
                        «
                    </button>
                    <button
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        className={styles.pageBtn}
                    >
                        ‹
                    </button>
                </div>
                <span className={styles.pageInfo}>
                    Page <strong>{table.getState().pagination.pageIndex + 1}</strong> sur{' '}
                    <strong>{table.getPageCount()}</strong>
                </span>
                <div className={styles.pageJump}>
                    <button
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        className={styles.pageBtn}
                    >
                        ›
                    </button>
                    <button
                        onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                        disabled={!table.getCanNextPage()}
                        className={styles.pageBtn}
                    >
                        »
                    </button>
                </div>
                <select
                    value={table.getState().pagination.pageSize}
                    onChange={e => {
                        table.setPageSize(Number(e.target.value))
                    }}
                    className={styles.pageSizeSelect}
                >
                    {[50, 100, 200, 500].map(pageSize => (
                        <option key={pageSize} value={pageSize}>
                            Afficher {pageSize}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};


export default DataTable;
