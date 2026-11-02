// ============================================================
// DOCUMENTATION MODULE - Personal SharePoint
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { DATA_DIR, UPLOADS_ROOT } = require('../lib/storage');

const router = express.Router();

const DOC_FILE = path.join(DATA_DIR, 'documentation.json');
const DOC_UPLOADS_DIR = path.join(UPLOADS_ROOT, 'documentation');

// Ensure directories exist
[path.dirname(DOC_FILE), DOC_UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer config for documentation uploads
const docStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, DOC_UPLOADS_DIR),
    filename: (req, file, cb) => {
        const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${uuidv4()}-${safeFilename}`);
    }
});

const uploadDoc = multer({
    storage: docStorage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// Helper functions for documentation
const readDocData = () => {
    if (fs.existsSync(DOC_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DOC_FILE, 'utf-8'));
        } catch (e) {
            return { spaces: [], items: [] };
        }
    }
    return {
        spaces: [
            { id: 'default', name: 'Général', order: 0, createdAt: new Date().toISOString() }
        ], items: []
    };
};

const writeDocDataAtomic = (data) => {
    const tempFile = DOC_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, DOC_FILE);
};

router.use('/uploads/documentation', express.static(DOC_UPLOADS_DIR));

// --- SPACES ENDPOINTS ---

router.get('/api/documentation/spaces', (req, res) => {
    const data = readDocData();
    res.json(data.spaces.sort((a, b) => a.order - b.order));
});

router.post('/api/documentation/spaces', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const data = readDocData();
    const newSpace = {
        id: uuidv4(),
        name,
        order: data.spaces.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    data.spaces.push(newSpace);
    writeDocDataAtomic(data);
    res.status(201).json(newSpace);
});

router.put('/api/documentation/spaces/:id', (req, res) => {
    const data = readDocData();
    const idx = data.spaces.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Space not found' });

    const { name, order } = req.body;
    if (name !== undefined) data.spaces[idx].name = name;
    if (order !== undefined) data.spaces[idx].order = order;
    data.spaces[idx].updatedAt = new Date().toISOString();

    writeDocDataAtomic(data);
    res.json(data.spaces[idx]);
});

router.delete('/api/documentation/spaces/:id', (req, res) => {
    const data = readDocData();
    const spaceIdx = data.spaces.findIndex(s => s.id === req.params.id);
    if (spaceIdx === -1) return res.status(404).json({ error: 'Space not found' });

    // Delete files associated with items in this space
    const itemsToDelete = data.items.filter(item => item.spaceId === req.params.id);
    itemsToDelete.forEach(item => {
        if (item.type === 'file' && item.file?.filename) {
            const filePath = path.join(DOC_UPLOADS_DIR, item.file.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    });

    // Filter out space and its items
    data.spaces = data.spaces.filter(s => s.id !== req.params.id);
    data.items = data.items.filter(item => item.spaceId !== req.params.id);

    writeDocDataAtomic(data);
    res.json({ success: true });
});

// --- ITEMS ENDPOINTS ---

router.get('/api/documentation/items', (req, res) => {
    const data = readDocData();
    const { spaceId, view, search } = req.query;

    let items = data.items;
    if (spaceId) items = items.filter(i => i.spaceId === spaceId);
    if (view) items = items.filter(i => i.view === view);
    if (search) {
        const s = search.toLowerCase();
        items = items.filter(i =>
            i.title.toLowerCase().includes(s) ||
            (i.description || '').toLowerCase().includes(s) ||
            (i.tags || []).some(t => t.toLowerCase().includes(s))
        );
    }

    res.json(items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
});

router.post('/api/documentation/items', (req, res) => {
    const { spaceId, view, title, type, url, description, tags } = req.body;
    if (!spaceId || !view || !title) return res.status(400).json({ error: 'Missing required fields' });

    const data = readDocData();
    const newItem = {
        id: uuidv4(),
        spaceId,
        view,
        title,
        type: type || 'url',
        url: url || '',
        description: description || '',
        tags: tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    data.items.push(newItem);
    writeDocDataAtomic(data);
    res.status(201).json(newItem);
});

router.post('/api/documentation/items/file', uploadDoc.single('file'), (req, res) => {
    const { spaceId, view, title, description, tags } = req.body;
    if (!spaceId || !view || !title || !req.file) {
        return res.status(400).json({ error: 'Missing required fields or file' });
    }

    const data = readDocData();
    const newItem = {
        id: uuidv4(),
        spaceId,
        view,
        title,
        type: 'file',
        description: description || '',
        tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : [],
        file: {
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            uploadedAt: new Date().toISOString(),
            url: `/uploads/documentation/${req.file.filename}`
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    data.items.push(newItem);
    writeDocDataAtomic(data);
    res.status(201).json(newItem);
});

router.put('/api/documentation/items/:id', (req, res) => {
    const data = readDocData();
    const idx = data.items.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });

    const { title, description, tags, url, isFavorite } = req.body;
    if (title !== undefined) data.items[idx].title = title;
    if (description !== undefined) data.items[idx].description = description;
    if (tags !== undefined) data.items[idx].tags = tags;
    if (url !== undefined) data.items[idx].url = url;
    if (isFavorite !== undefined) data.items[idx].isFavorite = isFavorite;

    data.items[idx].updatedAt = new Date().toISOString();
    writeDocDataAtomic(data);
    res.json(data.items[idx]);
});

router.delete('/api/documentation/items/:id', (req, res) => {
    const data = readDocData();
    const idx = data.items.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Item not found' });

    const item = data.items[idx];
    if (item.type === 'file' && item.file?.filename) {
        const filePath = path.join(DOC_UPLOADS_DIR, item.file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    data.items.splice(idx, 1);
    writeDocDataAtomic(data);
    res.json({ success: true });
});

module.exports = router;
