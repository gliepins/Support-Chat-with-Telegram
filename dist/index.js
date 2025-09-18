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
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pino_1 = __importDefault(require("pino"));
const pino_http_1 = __importDefault(require("pino-http"));
const http_1 = __importDefault(require("http"));
const public_1 = __importDefault(require("./api/public"));
const admin_1 = __importDefault(require("./api/admin"));
const server_1 = require("./ws/server");
const webhook_1 = require("./telegram/webhook");
const scheduler_1 = require("./services/scheduler");
const path_1 = __importDefault(require("path"));
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4010;
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
const app = (0, express_1.default)();
app.set('trust proxy', true);
app.use(express_1.default.json());
app.use((0, cors_1.default)({ origin: true, credentials: false }));
app.use((0, helmet_1.default)());
app.use((0, pino_http_1.default)({ logger }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/metrics', async (_req, res) => {
    try {
        const { getPrisma } = await Promise.resolve().then(() => __importStar(require('./db/client')));
        const prisma = getPrisma();
        const [open, closed, blocked] = await Promise.all([
            prisma.conversation.count({ where: { status: { in: ['OPEN_UNCLAIMED', 'OPEN_ASSIGNED', 'AWAITING_CUSTOMER'] } } }),
            prisma.conversation.count({ where: { status: 'CLOSED' } }),
            prisma.conversation.count({ where: { status: 'BLOCKED' } }),
        ]);
        res.type('text/plain').send(`support_open ${open}\n` +
            `support_closed ${closed}\n` +
            `support_blocked ${blocked}\n`);
    }
    catch {
        res.status(500).type('text/plain').send('error');
    }
});
// Serve OpenAPI stub (useful for quick integration checks)
app.get('/docs/openapi.yaml', (_req, res) => {
    res.sendFile(require('path').join(__dirname, 'docs', 'openapi.yaml'));
});
// Serve widget script
app.get('/widget.js', (_req, res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.type('application/javascript');
    res.sendFile(path_1.default.join(__dirname, 'public', 'widget.js'));
});
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
//# sourceMappingURL=index.js.map