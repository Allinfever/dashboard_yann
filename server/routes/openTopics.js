// ============================================================
// OPEN TOPICS MODULE - Ticketing System
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { DATA_DIR, UPLOADS_ROOT } = require('../lib/storage');

const router = express.Router();


const TOPICS_FILE = path.join(DATA_DIR, 'open_topics.json');
const UPLOADS_DIR = path.join(UPLOADS_ROOT, 'open-topics');

// Ensure directories exist
[path.dirname(TOPICS_FILE), UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer config for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}-${safeFilename}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const allowed = ['image/', 'application/pdf', 'text/', 'application/msword', 'application/vnd.', 'application/zip', 'application/x-'];
        const ok = allowed.some(t => file.mimetype.startsWith(t) || file.mimetype.includes(t));
        cb(null, ok);
    }
});

// Helper functions for topics
const readTopics = () => {
    if (fs.existsSync(TOPICS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf-8'));
        } catch (e) {
            return [];
        }
    }
    return [];
};

const writeTopicsAtomic = (topics) => {
    const tempFile = TOPICS_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(topics, null, 2));
    fs.renameSync(tempFile, TOPICS_FILE);
};

// Serve uploaded files
router.use('/uploads/open-topics', express.static(UPLOADS_DIR));

// GET /api/open-topics - List all topics with filtering
router.get('/api/open-topics', (req, res) => {
    try {
        let topics = readTopics();
        const { search, status, priority, tag, owner, sortBy = 'updatedAt', sortDir = 'desc' } = req.query;

        if (search) {
            const s = search.toLowerCase();
            topics = topics.filter(t =>
                t.title.toLowerCase().includes(s) ||
                t.summary.toLowerCase().includes(s) ||
                (t.description || '').toLowerCase().includes(s)
            );
        }
        if (status) topics = topics.filter(t => t.status === status);
        if (priority) topics = topics.filter(t => t.priority === priority);
        if (owner) topics = topics.filter(t => t.owner?.toLowerCase().includes(owner.toLowerCase()));
        if (tag) topics = topics.filter(t => t.tags?.includes(tag));

        topics.sort((a, b) => {
            const aVal = a[sortBy] || '';
            const bVal = b[sortBy] || '';
            return sortDir === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
        });

        res.json(topics);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/open-topics - Create new topic
router.post('/api/open-topics', (req, res) => {
    try {
        const { title, summary, description, status, priority, owner, tags, dueDate, links } = req.body;
        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Title is required' });
        }

        const topics = readTopics();
        const now = new Date().toISOString();
        const newTopic = {
            id: uuidv4(),
            title: title.trim(),
            summary: summary || '',
            description: description || '',
            status: status || 'Backlog',
            priority: priority || 'P4',
            owner: owner || '',
            tags: tags || [],
            dueDate: dueDate || null,
            links: links || [],
            attachments: [],
            createdAt: now,
            updatedAt: now
        };

        topics.push(newTopic);
        writeTopicsAtomic(topics);
        res.status(201).json(newTopic);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/open-topics/:id - Get single topic
router.get('/api/open-topics/:id', (req, res) => {
    try {
        const topics = readTopics();
        const topic = topics.find(t => t.id === req.params.id);
        if (!topic) return res.status(404).json({ error: 'Topic not found' });
        res.json(topic);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/open-topics/:id - Update topic
router.put('/api/open-topics/:id', (req, res) => {
    try {
        const topics = readTopics();
        const idx = topics.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Topic not found' });

        const { title, summary, description, status, priority, owner, tags, dueDate, links } = req.body;

        if (title !== undefined) topics[idx].title = title.trim();
        if (summary !== undefined) topics[idx].summary = summary;
        if (description !== undefined) topics[idx].description = description;
        if (status !== undefined) topics[idx].status = status;
        if (priority !== undefined) topics[idx].priority = priority;
        if (owner !== undefined) topics[idx].owner = owner;
        if (tags !== undefined) topics[idx].tags = tags;
        if (dueDate !== undefined) topics[idx].dueDate = dueDate;
        if (links !== undefined) topics[idx].links = links;

        topics[idx].updatedAt = new Date().toISOString();
        writeTopicsAtomic(topics);
        res.json(topics[idx]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/open-topics/:id - Delete topic
router.delete('/api/open-topics/:id', (req, res) => {
    try {
        let topics = readTopics();
        const topic = topics.find(t => t.id === req.params.id);
        if (!topic) return res.status(404).json({ error: 'Topic not found' });

        // Delete attachments
        (topic.attachments || []).forEach(att => {
            const filePath = path.join(UPLOADS_DIR, att.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });

        topics = topics.filter(t => t.id !== req.params.id);
        writeTopicsAtomic(topics);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/open-topics/:id/attachments - Upload attachments
router.post('/api/open-topics/:id/attachments', upload.array('files', 10), (req, res) => {
    try {
        const topics = readTopics();
        const idx = topics.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Topic not found' });

        const newAttachments = (req.files || []).map(file => ({
            id: uuidv4(),
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            uploadedAt: new Date().toISOString(),
            url: `/uploads/open-topics/${file.filename}`
        }));

        topics[idx].attachments = [...(topics[idx].attachments || []), ...newAttachments];
        topics[idx].updatedAt = new Date().toISOString();
        writeTopicsAtomic(topics);

        res.json({ attachments: newAttachments, topic: topics[idx] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/open-topics/:id/attachments/:attachmentId - Delete attachment
router.delete('/api/open-topics/:id/attachments/:attachmentId', (req, res) => {
    try {
        const topics = readTopics();
        const idx = topics.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Topic not found' });

        const att = (topics[idx].attachments || []).find(a => a.id === req.params.attachmentId);
        if (!att) return res.status(404).json({ error: 'Attachment not found' });

        // Delete file
        const filePath = path.join(UPLOADS_DIR, att.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        topics[idx].attachments = topics[idx].attachments.filter(a => a.id !== req.params.attachmentId);
        topics[idx].updatedAt = new Date().toISOString();
        writeTopicsAtomic(topics);

        res.json({ success: true, topic: topics[idx] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
