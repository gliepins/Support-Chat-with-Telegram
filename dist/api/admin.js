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
const express_1 = require("express");
const pino_1 = __importDefault(require("pino"));
const serviceAuth_1 = require("../middleware/serviceAuth");
const conversationService_1 = require("../services/conversationService");
const client_1 = require("../db/client");
const agentService_1 = require("../services/agentService");
const json2csv_1 = require("json2csv");
const telegramApi_1 = require("../services/telegramApi");
const auth_1 = require("../services/auth");
const conversationService_2 = require("../services/conversationService");
const router = (0, express_1.Router)();
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
router.use(serviceAuth_1.requireServiceAuth);
router.get('/v1/conversations', async (req, res) => {
    try {
        const status = req.query.status || 'all';
        const q = req.query.q || '';
        const list = await (0, conversationService_1.listConversations)(status, q);
        return res.json(list);
    }
    catch (e) {
        return res.status(500).json({ error: 'internal_error' });
    }
});
router.get('/v1/conversations/:id', async (req, res) => {
    const conv = await (0, conversationService_1.getConversationWithMessages)(req.params.id);
    if (!conv)
        return res.status(404).json({ error: 'not found' });
    return res.json(conv);
});
router.get('/v1/conversations/:id/export.json', async (req, res) => {
    const conv = await (0, conversationService_1.getConversationWithMessages)(req.params.id);
    if (!conv)
        return res.status(404).json({ error: 'not found' });
    return res.json({
        id: conv.id,
        codename: conv.codename,
        customerName: conv.customerName,
        status: conv.status,
        messages: conv.messages,
    });
});
router.get('/v1/conversations/:id/export.csv', async (req, res) => {
    const conv = await (0, conversationService_1.getConversationWithMessages)(req.params.id);
    if (!conv)
        return res.status(404).json({ error: 'not found' });
    const rows = conv.messages.map(m => ({
        createdAt: m.createdAt,
        direction: m.direction,
        text: m.text.replace(/\n/g, ' '),
    }));
    const parser = new json2csv_1.Parser({ fields: ['createdAt', 'direction', 'text'] });
    const csv = parser.parse(rows);
    res.header('Content-Type', 'text/csv');
    res.attachment(`conversation_${conv.id}.csv`);
    return res.send(csv);
});
router.post('/v1/moderation/close', async (req, res) => {
    const { id } = (req.body || {});
    if (!id)
        return res.status(400).json({ error: 'id required' });
    const conv = await (0, conversationService_1.closeConversation)(id, 'system');
    return res.json(conv);
});
router.post('/v1/moderation/block', async (req, res) => {
    const { id } = (req.body || {});
    if (!id)
        return res.status(400).json({ error: 'id required' });
    const conv = await (0, conversationService_1.blockConversation)(id, 'system');
    return res.json(conv);
});
// Bulk delete conversations (dangerous): by ids array or by filter
router.post('/v1/admin/conversations/bulk-delete', async (req, res) => {
    const prisma = (0, client_1.getPrisma)();
    const body = (req.body || {});
    try {
        const toDelete = Array.isArray(body.ids) && body.ids.length > 0
            ? await prisma.conversation.findMany({ where: { id: { in: body.ids } }, select: { id: true, threadId: true } })
            : [];
        let where = {};
        if (Array.isArray(body.ids) && body.ids.length > 0) {
            where.id = { in: body.ids };
        }
        else if (body.status) {
            const s = String(body.status).toLowerCase();
            if (s === 'open')
                where.status = { in: ['OPEN_UNCLAIMED', 'OPEN_ASSIGNED', 'AWAITING_CUSTOMER'] };
            else if (s === 'closed')
                where.status = 'CLOSED';
            else if (s === 'blocked')
                where.status = 'BLOCKED';
            else if (s === 'all')
                where = {};
        }
        else {
            return res.status(400).json({ error: 'ids or status required' });
        }
        const result = await prisma.conversation.deleteMany({ where });
        // Best-effort delete forum topics for those with known threadId
        for (const c of toDelete) {
            if (typeof c.threadId === 'number') {
                try {
                    await (0, telegramApi_1.deleteTopicByThreadId)(c.threadId);
                }
                catch { }
            }
        }
        return res.json({ deleted: result.count });
    }
    catch (e) {
        return res.status(500).json({ error: 'internal_error' });
    }
});
// Agents admin
router.get('/v1/admin/agents', async (_req, res) => {
    const agents = await (0, agentService_1.listAgents)();
    return res.json(agents);
});
router.post('/v1/admin/agents/upsert', async (req, res) => {
    const { tgId, displayName } = (req.body || {});
    if (!tgId || !displayName)
        return res.status(400).json({ error: 'tgId and displayName required' });
    const result = await (0, agentService_1.upsertAgent)(BigInt(tgId), displayName.trim());
    return res.json({ tgId: result.tgId.toString(), displayName: result.displayName, isActive: result.isActive });
});
router.post('/v1/admin/agents/disable', async (req, res) => {
    const { tgId } = (req.body || {});
    if (!tgId)
        return res.status(400).json({ error: 'tgId required' });
    const result = await (0, agentService_1.disableAgent)(BigInt(tgId));
    return res.json({ tgId: result.tgId.toString(), isActive: result.isActive });
});
router.post('/v1/admin/agents/enable', async (req, res) => {
    const { tgId } = (req.body || {});
    if (!tgId)
        return res.status(400).json({ error: 'tgId required' });
    const result = await (0, agentService_1.enableAgent)(BigInt(tgId));
    return res.json({ tgId: result.tgId.toString(), isActive: result.isActive });
});
router.post('/v1/admin/agents/closing-message', async (req, res) => {
    const { tgId, message } = (req.body || {});
    if (!tgId || typeof message !== 'string')
        return res.status(400).json({ error: 'tgId and message required' });
    const result = await (0, agentService_1.setAgentClosingMessage)(BigInt(tgId), message);
    return res.json({ tgId: result.tgId.toString(), closingMessage: result.closingMessage || null });
});
// Global settings: welcome message
router.get('/v1/admin/settings', async (_req, res) => {
    const prisma = (await Promise.resolve().then(() => __importStar(require('../db/client')))).getPrisma();
    const rows = await prisma.$queryRaw `SELECT value FROM "Setting" WHERE key = 'welcome_message' LIMIT 1`;
    return res.json({ welcome_message: rows && rows[0] ? rows[0].value : '' });
});
router.post('/v1/admin/settings', async (req, res) => {
    const { welcome_message } = (req.body || {});
    if (typeof welcome_message !== 'string')
        return res.status(400).json({ error: 'welcome_message required' });
    const prisma = (await Promise.resolve().then(() => __importStar(require('../db/client')))).getPrisma();
    await prisma.$executeRaw `INSERT INTO "Setting" (key, value) VALUES ('welcome_message', ${welcome_message}) ON CONFLICT (key) DO UPDATE SET value = ${welcome_message}`;
    return res.json({ ok: true });
});
// Deep health check: start → topic → welcome → WS token
router.get('/v1/admin/health/deep', async (_req, res) => {
    const prisma = (0, client_1.getPrisma)();
    const report = { startOk: false, topicOk: false, welcomeOk: false, wsTokenOk: false, errors: [] };
    let convId = null;
    let threadId = null;
    try {
        const conv = await (0, conversationService_2.createConversation)('Healthcheck');
        convId = conv.id;
        report.startOk = true;
        logger.info({ event: 'health_start_ok', conversationId: convId });
    }
    catch (e) {
        report.errors.push(`start: ${e?.message || 'error'}`);
    }
    try {
        if (convId) {
            const fresh = await prisma.conversation.findUnique({ where: { id: convId } });
            threadId = (fresh?.threadId ?? null);
            report.topicOk = typeof threadId === 'number';
            if (!report.topicOk)
                report.errors.push('topic: missing threadId');
        }
    }
    catch (e) {
        report.errors.push(`topic: ${e?.message || 'error'}`);
    }
    try {
        if (convId) {
            const rows = await prisma.$queryRaw `SELECT value FROM "Setting" WHERE key = 'welcome_message' LIMIT 1`;
            const welcome = (rows && rows[0] && rows[0].value ? rows[0].value : '').trim();
            if (!welcome) {
                report.welcomeOk = true; // no welcome configured is not an error
            }
            else {
                const msgs = await prisma.message.findMany({ where: { conversationId: convId, direction: 'OUTBOUND', text: welcome } });
                report.welcomeOk = msgs.length > 0;
                if (!report.welcomeOk)
                    report.errors.push('welcome: message not found');
            }
        }
    }
    catch (e) {
        report.errors.push(`welcome: ${e?.message || 'error'}`);
    }
    try {
        if (convId) {
            const ipHash = (0, auth_1.hashIp)('127.0.0.1');
            const token = (0, auth_1.signConversationToken)(convId, ipHash, 60);
            const parsed = (0, auth_1.verifyConversationToken)(token, ipHash);
            report.wsTokenOk = parsed.conversationId === convId;
            if (!report.wsTokenOk)
                report.errors.push('ws: token verify mismatch');
        }
    }
    catch (e) {
        report.errors.push(`ws: ${e?.message || 'error'}`);
    }
    // Cleanup best effort
    try {
        if (convId) {
            try {
                await prisma.message.deleteMany({ where: { conversationId: convId } });
            }
            catch { }
            try {
                await prisma.auditLog.deleteMany({ where: { conversationId: convId } });
            }
            catch { }
            try {
                await prisma.conversation.delete({ where: { id: convId } });
            }
            catch { }
        }
        if (threadId) {
            try {
                await (0, telegramApi_1.deleteTopicByThreadId)(threadId);
            }
            catch { }
        }
    }
    catch { }
    const ok = report.startOk && report.topicOk && report.welcomeOk && report.wsTokenOk;
    report.ok = ok;
    logger.info({ event: 'health_deep', ok, report });
    return res.json(report);
});
exports.default = router;
//# sourceMappingURL=admin.js.map