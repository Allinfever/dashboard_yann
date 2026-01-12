import React, { useState, useEffect, useMemo, useRef } from 'react';
import styles from './DocumentationPage.module.css';

const VIEWS = [
    { id: 'general', label: 'Général', icon: '📄' },
    { id: 'technique', label: 'Technique', icon: '⚙️' },
    { id: 'process', label: 'Processus', icon: '🔄' }
];

const DocumentationPage = () => {
    const [spaces, setSpaces] = useState([]);
    const [items, setItems] = useState([]);
    const [activeSpaceId, setActiveSpaceId] = useState(null);
    const [activeView, setActiveView] = useState('general');
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Modal states
    const [showSpaceModal, setShowSpaceModal] = useState(false);
    const [showItemModal, setShowItemModal] = useState(false);
    const [editingSpace, setEditingSpace] = useState(null);
    const [itemType, setItemType] = useState('url'); // 'url' or 'file'
    const [newSpaceName, setNewSpaceName] = useState('');

    const [newItem, setNewItem] = useState({
        title: '',
        url: '',
        description: '',
        tags: ''
    });
    const fileInputRef = useRef(null);
    const [selectedFile, setSelectedFile] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (activeSpaceId) {
            fetchItems();
        }
    }, [activeSpaceId, activeView, search]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/documentation/spaces');
            const data = await res.json();
            setSpaces(data);
            if (data.length > 0 && !activeSpaceId) {
                setActiveSpaceId(data[0].id);
            }
        } catch (e) {
            console.error('Fetch error:', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchItems = async () => {
        try {
            const params = new URLSearchParams({
                spaceId: activeSpaceId,
                view: activeView,
                search: search
            });
            const res = await fetch(`/api/documentation/items?${params}`);
            const data = await res.json();
            setItems(data);
        } catch (e) {
            console.error('Fetch items error:', e);
        }
    };

    // --- Space Actions ---

    const handleCreateSpace = async (e) => {
        e.preventDefault();
        if (!newSpaceName.trim()) return;

        try {
            const url = editingSpace ? `/api/documentation/spaces/${editingSpace.id}` : '/api/documentation/spaces';
            const method = editingSpace ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newSpaceName })
            });
            if (res.ok) {
                setShowSpaceModal(false);
                setNewSpaceName('');
                setEditingSpace(null);
                fetchData();
            }
        } catch (e) {
            alert('Erreur: ' + e.message);
        }
    };

    const handleDeleteSpace = async (id, e) => {
        e.stopPropagation();
        if (!confirm('Supprimer cet espace et toute sa documentation ?')) return;

        try {
            const res = await fetch(`/api/documentation/spaces/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (activeSpaceId === id) setActiveSpaceId(null);
                fetchData();
            }
        } catch (e) {
            alert('Erreur suppression');
        }
    };

    // --- Item Actions ---

    const handleCreateItem = async (e) => {
        e.preventDefault();
        if (!newItem.title.trim()) return;

        try {
            let res;
            if (itemType === 'url') {
                res = await fetch('/api/documentation/items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...newItem,
                        spaceId: activeSpaceId,
                        view: activeView,
                        type: 'url',
                        tags: newItem.tags.split(',').map(t => t.trim()).filter(Boolean)
                    })
                });
            } else {
                if (!selectedFile) throw new Error('Veuillez sélectionner un fichier');
                const formData = new FormData();
                formData.append('file', selectedFile);
                formData.append('spaceId', activeSpaceId);
                formData.append('view', activeView);
                formData.append('title', newItem.title);
                formData.append('description', newItem.description);
                formData.append('tags', JSON.stringify(newItem.tags.split(',').map(t => t.trim()).filter(Boolean)));

                res = await fetch('/api/documentation/items/file', {
                    method: 'POST',
                    body: formData
                });
            }

            if (res.ok) {
                setShowItemModal(false);
                setNewItem({ title: '', url: '', description: '', tags: '' });
                setSelectedFile(null);
                fetchItems();
            }
        } catch (e) {
            alert('Erreur: ' + e.message);
        }
    };

    const handleDeleteItem = async (id) => {
        if (!confirm('Supprimer cette ressource ?')) return;
        try {
            await fetch(`/api/documentation/items/${id}`, { method: 'DELETE' });
            fetchItems();
        } catch (e) {
            alert('Erreur suppression');
        }
    };

    const toggleFavorite = async (item) => {
        try {
            await fetch(`/api/documentation/items/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isFavorite: !item.isFavorite })
            });
            fetchItems();
        } catch (e) {
            console.error('Favorite error:', e);
        }
    };

    const formatSize = (bytes) => {
        if (!bytes) return '-';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    return (
        <div className={styles.pageContainer}>
            {/* Vertical Tabs (Spaces) */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                    <h3>Espaces</h3>
                    <button onClick={() => { setEditingSpace(null); setNewSpaceName(''); setShowSpaceModal(true); }} className={styles.addSpaceBtn}>
                        +
                    </button>
                </div>
                <div className={styles.spaceList}>
                    {spaces.map(space => (
                        <div
                            key={space.id}
                            className={`${styles.spaceItem} ${activeSpaceId === space.id ? styles.active : ''}`}
                            onClick={() => setActiveSpaceId(space.id)}
                        >
                            <span className={styles.spaceName}>📁 {space.name}</span>
                            <div className={styles.spaceActions}>
                                <button onClick={(e) => { e.stopPropagation(); setEditingSpace(space); setNewSpaceName(space.name); setShowSpaceModal(true); }} className={styles.miniBtn}>✎</button>
                                <button onClick={(e) => handleDeleteSpace(space.id, e)} className={styles.miniBtn}>×</button>
                            </div>
                        </div>
                    ))}
                    {spaces.length === 0 && !loading && <div className={styles.emptySidebar}>Aucun espace</div>}
                </div>
            </aside>

            {/* Main Content */}
            <main className={styles.content}>
                {/* Horizontal Tabs */}
                <div className={styles.viewTabs}>
                    {VIEWS.map(view => (
                        <button
                            key={view.id}
                            className={`${styles.viewTab} ${activeView === view.id ? styles.active : ''}`}
                            onClick={() => setActiveView(view.id)}
                        >
                            <span className={styles.viewIcon}>{view.icon}</span>
                            {view.label}
                        </button>
                    ))}
                </div>

                {/* Toolbar */}
                <div className={styles.toolbar}>
                    <input
                        type="text"
                        placeholder="Rechercher une ressource..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={styles.searchInput}
                    />
                    <button onClick={() => setShowItemModal(true)} className={styles.primaryBtn}>
                        + Ajouter une ressource
                    </button>
                </div>

                {/* Items Grid */}
                <div className={styles.itemGrid}>
                    {items.length === 0 ? (
                        <div className={styles.emptyState}>
                            <p>Aucune ressource trouvée dans cette section.</p>
                        </div>
                    ) : (
                        items.map(item => (
                            <div key={item.id} className={`${styles.itemCard} ${item.isFavorite ? styles.favorite : ''}`}>
                                <div className={styles.cardHeader}>
                                    <span className={styles.itemTypeIcon}>
                                        {item.type === 'url' ? '🔗' : '📎'}
                                    </span>
                                    <div className={styles.cardActions}>
                                        <button onClick={() => toggleFavorite(item)} className={styles.favBtn}>
                                            {item.isFavorite ? '⭐' : '☆'}
                                        </button>
                                        <button onClick={() => handleDeleteItem(item.id)} className={styles.delBtn}>×</button>
                                    </div>
                                </div>
                                <h4 className={styles.itemTitle}>{item.title}</h4>
                                {item.description && <p className={styles.itemDesc}>{item.description}</p>}
                                <div className={styles.itemTags}>
                                    {(item.tags || []).map(tag => (
                                        <span key={tag} className={styles.tag}>#{tag}</span>
                                    ))}
                                </div>
                                <div className={styles.cardFooter}>
                                    <span className={styles.itemDate}>
                                        {item.type === 'file' ? formatSize(item.file?.size) : 'Lien URL'}
                                    </span>
                                    <a
                                        href={item.type === 'url' ? item.url : item.file?.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.openBtn}
                                    >
                                        {item.type === 'url' ? 'Ouvrir' : 'Télécharger'}
                                    </a>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {/* Space Modal */}
            {showSpaceModal && (
                <div className={styles.modalOverlay} onClick={() => setShowSpaceModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h3>{editingSpace ? 'Renommer l\'espace' : 'Nouvel espace'}</h3>
                        <form onSubmit={handleCreateSpace}>
                            <div className={styles.formGroup}>
                                <label>Nom de l'espace</label>
                                <input
                                    type="text"
                                    value={newSpaceName}
                                    onChange={(e) => setNewSpaceName(e.target.value)}
                                    autoFocus
                                    required
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" onClick={() => setShowSpaceModal(false)} className={styles.cancelBtn}>Annuler</button>
                                <button type="submit" className={styles.primaryBtn}>{editingSpace ? 'Enregistrer' : 'Créer'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Item Modal */}
            {showItemModal && (
                <div className={styles.modalOverlay} onClick={() => setShowItemModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <h3>Nouvelle ressource</h3>
                        <div className={styles.typeToggle}>
                            <button className={itemType === 'url' ? styles.active : ''} onClick={() => setItemType('url')}>Lien URL</button>
                            <button className={itemType === 'file' ? styles.active : ''} onClick={() => setItemType('file')}>Fichier</button>
                        </div>
                        <form onSubmit={handleCreateItem}>
                            <div className={styles.formGroup}>
                                <label>Titre</label>
                                <input
                                    type="text"
                                    value={newItem.title}
                                    onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                                    required
                                />
                            </div>
                            {itemType === 'url' ? (
                                <div className={styles.formGroup}>
                                    <label>URL</label>
                                    <input
                                        type="url"
                                        value={newItem.url}
                                        onChange={(e) => setNewItem({ ...newItem, url: e.target.value })}
                                        required
                                    />
                                </div>
                            ) : (
                                <div className={styles.formGroup}>
                                    <label>Fichier</label>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={(e) => setSelectedFile(e.target.files[0])}
                                        required={!selectedFile}
                                    />
                                </div>
                            )}
                            <div className={styles.formGroup}>
                                <label>Description</label>
                                <textarea
                                    value={newItem.description}
                                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Tags (séparés par virgule)</label>
                                <input
                                    type="text"
                                    value={newItem.tags}
                                    onChange={(e) => setNewItem({ ...newItem, tags: e.target.value })}
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" onClick={() => setShowItemModal(false)} className={styles.cancelBtn}>Annuler</button>
                                <button type="submit" className={styles.primaryBtn}>Ajouter</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DocumentationPage;
