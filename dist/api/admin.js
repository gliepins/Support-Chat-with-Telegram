"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const serviceAuth_1 = require("../middleware/serviceAuth");
const conversationService_1 = require("../services/conversationService");
const json2csv_1 = require("json2csv");
const router = (0, express_1.Router)();
router.use(serviceAuth_1.requireServiceAuth);
router.get('/v1/conversations', async (req, res) => {
    const status = req.query.status || undefined;
    const list = await (0, conversationService_1.listConversations)(status);
    return res.json(list);
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
exports.default = router;
//# sourceMappingURL=admin.js.map