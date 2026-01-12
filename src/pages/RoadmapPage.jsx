import React, { useState, useEffect } from 'react';
import { DEFAULT_ROADMAP_DATA, MONTHS } from '../config/roadmapConfig';
import styles from './RoadmapPage.module.css';

const STORAGE_KEY = 'roadmap_data';

const RoadmapPage = () => {
    const [roadmapData, setRoadmapData] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : DEFAULT_ROADMAP_DATA;
    });
    const [editingItem, setEditingItem] = useState(null);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(roadmapData));
    }, [roadmapData]);

    const resetToDefault = () => {
        setRoadmapData(DEFAULT_ROADMAP_DATA);
        localStorage.removeItem(STORAGE_KEY);
    };

    const updateItem = (itemId, updates) => {
        setRoadmapData(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.id === itemId ? { ...item, ...updates } : item
            )
        }));
        setEditingItem(null);
    };

    const getGroupColor = (groupId) => {
        const group = roadmapData.groups.find(g => g.id === groupId);
        return group?.color || '#64748b';
    };

    const renderBar = (item) => {
        if (item.type === 'milestone' || item.type === 'milestone-dashed') {
            const left = ((item.month - 1) / 12) * 100;
            return (
                <div
                    className={`${styles.milestone} ${item.type === 'milestone-dashed' ? styles.dashed : ''}`}
                    style={{ left: `${left}%` }}
                    onClick={() => setEditingItem(item)}
                >
                    <span className={styles.milestoneLabel}>{item.label}</span>
                </div>
            );
        }

        const left = ((item.startMonth - 1) / 12) * 100;
        const width = ((item.endMonth - item.startMonth + 1) / 12) * 100;
        const color = getGroupColor(item.group);

        return (
            <div
                className={styles.bar}
                style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: color
                }}
                onClick={() => setEditingItem(item)}
            >
                <span className={styles.barLabel}>{item.label}</span>
            </div>
        );
    };

    const groupedItems = roadmapData.groups.map(group => ({
        ...group,
        items: roadmapData.items.filter(item => item.group === group.id)
    }));

    return (
        <div className="card">
            <div className={styles.header}>
                <h2>Roadmap {roadmapData.year}</h2>
                <button onClick={resetToDefault} className={styles.resetBtn}>
                    Réinitialiser
                </button>
            </div>

            <div className={styles.ganttContainer}>
                {/* Month Headers */}
                <div className={styles.monthsHeader}>
                    <div className={styles.labelColumn}></div>
                    <div className={styles.monthsGrid}>
                        {MONTHS.map((month, idx) => (
                            <div key={idx} className={styles.monthCell}>
                                {month}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Groups and Items */}
                {groupedItems.map(group => (
                    <div key={group.id} className={styles.groupSection}>
                        <div className={styles.groupHeader} style={{ borderLeftColor: group.color }}>
                            {group.label}
                        </div>
                        {group.items.map(item => (
                            <div key={item.id} className={styles.itemRow}>
                                <div className={styles.labelColumn}>
                                    <span className={styles.itemLabel}>{item.label}</span>
                                </div>
                                <div className={styles.barContainer}>
                                    <div className={styles.gridLines}>
                                        {MONTHS.map((_, idx) => (
                                            <div key={idx} className={styles.gridLine} />
                                        ))}
                                    </div>
                                    {renderBar(item)}
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            {/* Edit Modal */}
            {editingItem && (
                <div className={styles.modalOverlay} onClick={() => setEditingItem(null)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h3>Modifier : {editingItem.label}</h3>
                        {editingItem.type === 'bar' ? (
                            <div className={styles.modalForm}>
                                <label>
                                    Mois de début :
                                    <select
                                        value={editingItem.startMonth}
                                        onChange={e => updateItem(editingItem.id, { startMonth: parseInt(e.target.value) })}
                                    >
                                        {MONTHS.map((m, idx) => (
                                            <option key={idx} value={idx + 1}>{m}</option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Mois de fin :
                                    <select
                                        value={editingItem.endMonth}
                                        onChange={e => updateItem(editingItem.id, { endMonth: parseInt(e.target.value) })}
                                    >
                                        {MONTHS.map((m, idx) => (
                                            <option key={idx} value={idx + 1}>{m}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        ) : (
                            <div className={styles.modalForm}>
                                <label>
                                    Mois :
                                    <select
                                        value={editingItem.month}
                                        onChange={e => updateItem(editingItem.id, { month: parseInt(e.target.value) })}
                                    >
                                        {MONTHS.map((m, idx) => (
                                            <option key={idx} value={idx + 1}>{m}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        )}
                        <div className={styles.modalActions}>
                            <button onClick={() => setEditingItem(null)} className={styles.cancelBtn}>
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoadmapPage;
