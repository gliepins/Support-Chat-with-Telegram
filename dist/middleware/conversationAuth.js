"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireConversationAuth = requireConversationAuth;
const auth_1 = require("../services/auth");
function requireConversationAuth(req, res, next) {
    const authHeader = req.header('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
    if (!token) {
        return res.status(401).json({ error: 'missing token' });
    }
    const ip = (req.ip || '').toString();
    const ipHash = (0, auth_1.hashIp)(ip);
    try {
        const { conversationId } = (0, auth_1.verifyConversationToken)(token, ipHash);
        if (req.params.id && req.params.id !== conversationId) {
            return res.status(403).json({ error: 'conversation mismatch' });
        }
        req.conversationId = conversationId;
        return next();
    }
    catch (_e) {
        return res.status(401).json({ error: 'invalid token' });
    }
}
//# sourceMappingURL=conversationAuth.js.map