"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashIp = hashIp;
exports.signConversationToken = signConversationToken;
exports.verifyConversationToken = verifyConversationToken;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
function getJwtSecret() {
    const secret = process.env.CONVERSATION_JWT_SECRET || process.env.SERVICE_TOKEN;
    if (!secret) {
        logger.error('Missing CONVERSATION_JWT_SECRET or SERVICE_TOKEN. Cannot sign/verify conversation tokens.');
        throw new Error('Missing token secret');
    }
    if (!process.env.CONVERSATION_JWT_SECRET) {
        logger.warn('Using SERVICE_TOKEN as JWT secret. Set CONVERSATION_JWT_SECRET for better isolation.');
    }
    return secret;
}
function hashIp(ipAddress) {
    return crypto_1.default.createHash('sha256').update(ipAddress).digest('hex');
}
function signConversationToken(conversationId, ipHash, ttlSeconds = 60 * 60) {
    const secret = getJwtSecret();
    return jsonwebtoken_1.default.sign({ sub: conversationId, ip: ipHash }, secret, { expiresIn: ttlSeconds });
}
function verifyConversationToken(token, ipHash) {
    const secret = getJwtSecret();
    const payload = jsonwebtoken_1.default.verify(token, secret);
    if (!payload || typeof payload.sub !== 'string') {
        throw new Error('Invalid token payload');
    }
    return { conversationId: payload.sub };
}
//# sourceMappingURL=auth.js.map