"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pino_1 = __importDefault(require("pino"));
const auth_1 = require("../services/auth");
const conversationService_1 = require("../services/conversationService");
const client_1 = require("../db/client");
const telegramApi_1 = require("../services/telegramApi");
const conversationAuth_1 = require("../middleware/conversationAuth");
const rateLimit_1 = require("../middleware/rateLimit");
const router = (0, express_1.Router)();
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
router.post('/v1/conversations/start', (0, rateLimit_1.ipRateLimit)(20, 60), async (req, res) => {
    try {
        const { name } = (req.body || {});
        const conversation = await (0, conversationService_1.createConversation)(name);
        const ipHash = (0, auth_1.hashIp)((req.ip || '').toString());
        const token = (0, auth_1.signConversationToken)(conversation.id, ipHash);
        try {
            logger.info({ event: 'conversation_start', conversationId: conversation.id, codename: conversation.codename });
        }
        catch { }
        return res.json({ conversation_id: conversation.id, token, codename: conversation.codename });
    }
    catch (e) {
        try {
            logger.warn({ event: 'conversation_start_error', err: e });
        }
        catch { }
        return res.status(400).json({ error: e?.message || 'bad request' });
    }
});
router.patch('/v1/conversations/:id/name', conversationAuth_1.requireConversationAuth, (0, rateLimit_1.keyRateLimit)(10, 24 * 60 * 60, (req) => `rename:${req.conversationId}`), async (req, res) => {
    try {
        const { name } = (req.body || {});
        if (!name) {
            return res.status(400).json({ error: 'name required' });
        }
        const id = req.params.id;
        const updated = await (0, conversationService_1.setNickname)(id, name);
        try {
            await (0, telegramApi_1.updateTopicTitleFromConversation)(id);
        }
        catch { }
        return res.json({ id: updated.id, customerName: updated.customerName });
    }
    catch (e) {
        return res.status(400).json({ error: e?.message || 'bad request' });
    }
});
exports.default = router;
// Lightweight messages fetch for restoring widget state
router.get('/v1/conversations/:id/messages', async (req, res) => {
    try {
        const id = req.params.id;
        const prisma = (0, client_1.getPrisma)();
        const conv = await prisma.conversation.findUnique({ where: { id }, select: { status: true } });
        const msgs = await (0, conversationService_1.listMessagesForConversation)(id);
        let agent = null;
        try {
            agent = await (0, conversationService_1.getAssignedAgentName)(id);
        }
        catch { }
        const enriched = msgs.map((m) => {
            if (m.direction === 'OUTBOUND') {
                return { ...m, agent: agent || 'Support' };
            }
            return m;
        });
        return res.json({ status: conv?.status || 'OPEN_UNCLAIMED', messages: enriched });
    }
    catch (e) {
        return res.status(400).json({ error: 'bad request' });
    }
});
//# sourceMappingURL=public.js.map