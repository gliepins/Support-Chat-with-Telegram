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
const systemMessages_1 = require("../services/systemMessages");
const conversationAuth_1 = require("../middleware/conversationAuth");
const rateLimit_1 = require("../middleware/rateLimit");
const router = (0, express_1.Router)();
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
const START_POINTS = Number(process.env.START_IP_POINTS || 20);
const START_DURATION = Number(process.env.START_IP_DURATION_SEC || 60);
router.post('/v1/conversations/start', (0, rateLimit_1.ipRateLimit)(START_POINTS, START_DURATION), async (req, res) => {
    try {
        const { name, locale } = (req.body || {});
        const conversation = await (0, conversationService_1.createConversation)(name, locale);
        // Store locale if provided
        if (locale && typeof locale === 'string' && locale.trim().length > 0) {
            const norm = locale.trim().toLowerCase().slice(0, 2);
            try {
                const prisma = (0, client_1.getPrisma)();
                await prisma.conversation.update({ where: { id: conversation.id }, data: { locale: norm } });
            }
            catch { }
        }
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
// Update conversation locale at runtime (allows SPA language switch)
router.patch('/v1/conversations/:id/locale', conversationAuth_1.requireConversationAuth, async (req, res) => {
    try {
        const { locale } = (req.body || {});
        if (!locale || typeof locale !== 'string' || !locale.trim()) {
            return res.status(400).json({ error: 'locale required' });
        }
        const prisma = (0, client_1.getPrisma)();
        const norm = locale.trim().toLowerCase().slice(0, 2);
        const updated = await prisma.conversation.update({ where: { id: req.params.id }, data: { locale: norm } });
        return res.json({ id: updated.id, locale: updated.locale });
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
        const convRow = await prisma.conversation.findUnique({ where: { id }, select: { status: true, locale: true } });
        const status = String(convRow?.status || '');
        const convLocale = String(convRow?.locale || 'default');
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
        let closedNote;
        if (status === 'CLOSED') {
            try {
                const tpl = await (0, systemMessages_1.getTemplateOrDefault)('closed_history_note', convLocale);
                if (tpl.enabled && tpl.toCustomerWs && typeof tpl.text === 'string' && tpl.text.trim().length > 0) {
                    closedNote = tpl.text;
                }
            }
            catch { }
        }
        return res.json({ status: status || 'OPEN_UNCLAIMED', messages: enriched, closed_note: closedNote });
    }
    catch (e) {
        return res.status(400).json({ error: 'bad request' });
    }
});
//# sourceMappingURL=public.js.map