"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/env");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pino_1 = __importDefault(require("pino"));
const pino_http_1 = __importDefault(require("pino-http"));
const http_1 = __importDefault(require("http"));
const public_1 = __importDefault(require("./api/public"));
const hub_1 = require("./ws/hub");
const admin_1 = __importDefault(require("./api/admin"));
const server_1 = require("./ws/server");
const webhook_1 = require("./telegram/webhook");
const scheduler_1 = require("./services/scheduler");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const systemMessages_1 = require("./services/systemMessages");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4010;
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
const app = (0, express_1.default)();
app.set('trust proxy', true);
app.use(express_1.default.json());
app.use((0, cors_1.default)({ origin: true, credentials: false }));
app.use((0, helmet_1.default)());
app.use((0, pino_http_1.default)({ logger }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (_req, res) => {
    try {
        const required = ['DATABASE_URL', 'SERVICE_TOKEN', 'BOT_TOKEN', 'SUPPORT_GROUP_ID', 'WEBHOOK_SECRET'];
        const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
        if (missing.length > 0) {
            return res.status(503).json({ ready: false, missing });
        }
        const { getPrisma } = await Promise.resolve().then(() => __importStar(require('./db/client')));
        const prisma = getPrisma();
        // simple query to validate DB connectivity
        await prisma.$queryRaw `SELECT 1`;
        return res.json({ ready: true });
    }
    catch {
        return res.status(503).json({ ready: false });
    }
});
// Quiet favicon to avoid 401/404 noise in admin
app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
});
app.get('/metrics', async (_req, res) => {
    try {
        const { getPrisma } = await Promise.resolve().then(() => __importStar(require('./db/client')));
        const prisma = getPrisma();
        const [open, closed, blocked] = await Promise.all([
            prisma.conversation.count({ where: { status: { in: ['OPEN_UNCLAIMED', 'OPEN_ASSIGNED', 'AWAITING_CUSTOMER'] } } }),
            prisma.conversation.count({ where: { status: 'CLOSED' } }),
            prisma.conversation.count({ where: { status: 'BLOCKED' } }),
        ]);
        const ws = (0, hub_1.getWsMetrics)();
        const tgErrors = globalThis.__telegram_errors__ || 0;
        res.type('text/plain').send(`support_open ${open}\n` +
            `support_closed ${closed}\n` +
            `support_blocked ${blocked}\n` +
            `ws_connections ${ws.wsConnections}\n` +
            `ws_outbound_messages ${ws.wsMessagesOutbound}\n` +
            `telegram_errors_total ${tgErrors}\n`);
    }
    catch {
        res.status(500).type('text/plain').send('error');
    }
});
// Serve OpenAPI stub (useful for quick integration checks)
app.get('/docs/openapi.yaml', (_req, res) => {
    res.sendFile(require('path').join(__dirname, 'docs', 'openapi.yaml'));
});
// Serve widget script (minified if available). If a version (?v=...) is provided,
// enable long-lived immutable caching; otherwise use a short TTL.
app.get('/widget.js', (req, res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.type('application/javascript');
    const version = (req.query && req.query.v) ? String(req.query.v) : '';
    if (version) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    else {
        res.setHeader('Cache-Control', 'public, max-age=300');
    }
    const minPath = path_1.default.join(__dirname, 'public', 'widget.min.js');
    const plainPath = path_1.default.join(__dirname, 'public', 'widget.js');
    try {
        if (fs_1.default.existsSync(minPath)) {
            return res.sendFile(minPath);
        }
    }
    catch { }
    return res.sendFile(plainPath);
});
// Also expose the minified name explicitly (same cache rules)
app.get('/widget.min.js', (req, res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.type('application/javascript');
    const version = (req.query && req.query.v) ? String(req.query.v) : '';
    if (version) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    else {
        res.setHeader('Cache-Control', 'public, max-age=300');
    }
    const minPath = path_1.default.join(__dirname, 'public', 'widget.min.js');
    const plainPath = path_1.default.join(__dirname, 'public', 'widget.js');
    try {
        if (fs_1.default.existsSync(minPath)) {
            return res.sendFile(minPath);
        }
    }
    catch { }
    return res.sendFile(plainPath);
});
// Minimal admin UI (static)
app.use('/admin', express_1.default.static(path_1.default.join(__dirname, 'public', 'admin')));
app.use(public_1.default);
// Mount Telegram webhook BEFORE admin routes to avoid service auth capturing it
app.use((0, webhook_1.telegramRouter)());
app.use(admin_1.default);
// Create HTTP server to allow WS upgrade
const server = http_1.default.createServer(app);
(0, server_1.attachWsServer)(server, '/v1/ws');
// Gracefully accept Telegram webhook even if JSON parsing fails
// to avoid delivery failures during early integration
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, req, res, _next) => {
    if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
        if (req.path.startsWith('/v1/telegram/webhook/')) {
            return res.json({ ok: true });
        }
    }
    return res.status(500).json({ error: 'internal_error' });
});
server.listen(PORT, () => logger.info(`Support Chat API listening on ${PORT}`));
(0, scheduler_1.startSchedulers)();
(0, systemMessages_1.seedDefaultMessageTemplates)().catch(() => { });
//# sourceMappingURL=index.js.map