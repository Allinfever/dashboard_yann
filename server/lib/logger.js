// --- Logger Utility ---
const logger = {
    info: (rid, endpoint, status, message) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${rid || 'SYS'}] [${endpoint}] ${status ? `CODE:${status}` : ''} ${message}`);
    },
    error: (rid, endpoint, status, message) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [${rid || 'SYS'}] [${endpoint}] ${status ? `ERR_CODE:${status}` : ''} ERROR: ${message}`);
    },
    isHtml: (data) => typeof data === 'string' && data.trim().toLowerCase().startsWith('<!doctype html')
};

module.exports = logger;
