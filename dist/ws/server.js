"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachWsServer = attachWsServer;
const ws_1 = require("ws");
const pino_1 = __importDefault(require("pino"));
const conversationService_1 = require("../services/conversationService");
const hub_1 = require("./hub");
const auth_1 = require("../services/auth");
const telegramApi_1 = require("../services/telegramApi");
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
function parseUrl(urlString) {
    const u = new URL(urlString, 'http://localhost');
    return { pathname: u.pathname, searchParams: u.searchParams };
}
function getClientIpForUpgrade(request) {
    // Prefer X-Forwarded-For (may contain a list - take the first non-empty)
    const xff = request.headers?.['x-forwarded-for'];
    if (xff && typeof xff === 'string') {
        const first = xff.split(',')[0]?.trim();
        if (first)
            return first;
    }
    // Fallback to remoteAddress
    return (request.socket?.remoteAddress || '').toString();
}
function attachWsServer(httpServer, pathPrefix = '/v1/ws') {
    const wss = new ws_1.WebSocketServer({ noServer: true });
    httpServer.on('upgrade', (request, socket, head) => {
        try {
            const { pathname, searchParams } = parseUrl(request.url || '/');
            if (!pathname.startsWith(pathPrefix)) {
                return;
            }
            const token = searchParams.get('token') || '';
            if (!token) {
                try {
                    logger.warn({ event: 'ws_upgrade_missing_token' });
                }
                catch { }
                socket.destroy();
                return;
            }
            const ip = getClientIpForUpgrade(request);
            const ipHash = (0, auth_1.hashIp)(ip);
            let conversationId;
            try {
                conversationId = (0, auth_1.verifyConversationToken)(token, ipHash).conversationId;
            }
            catch (_e) {
                try {
                    logger.warn({ event: 'ws_upgrade_bad_token' });
                }
                catch { }
                socket.destroy();
                return;
            }
            try {
                logger.info({ event: 'ws_upgrade_ok', conversationId });
            }
            catch { }
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, conversationId);
            });
        }
        catch (e) {
            try {
                logger.warn({ event: 'ws_upgrade_exception', err: e });
            }
            catch { }
            socket.destroy();
            return;
        }
    });
    wss.on('connection', (ws, conversationId) => {
        try {
            logger.info({ event: 'ws_connected', conversationId });
        }
        catch { }
        (0, hub_1.addClientToConversation)(conversationId, ws);
        // Simple per-connection token bucket: allow N messages per T seconds
        const maxPoints = Number(process.env.WS_MSGS_PER_WINDOW || 30);
        const windowMs = Number(process.env.WS_WINDOW_MS || 10000);
        let tokens = maxPoints;
        let lastRefill = Date.now();
        function allowMessage() {
            const now = Date.now();
            const elapsed = now - lastRefill;
            if (elapsed > windowMs) {
                const buckets = Math.floor(elapsed / windowMs);
                tokens = Math.min(maxPoints, tokens + buckets * maxPoints);
                lastRefill = now - (elapsed % windowMs);
            }
            if (tokens > 0) {
                tokens -= 1;
                return true;
            }
            return false;
        }
        ws.on('message', async (data) => {
            try {
                // Inbound hardening: size and type
                if (data && data.length && data.length > (Number(process.env.WS_MAX_MSG_BYTES || 4096))) {
                    try {
                        ws.send(JSON.stringify({ error: 'too_large' }));
                    }
                    catch { }
                    try {
                        ws.close(1009, 'too large');
                    }
                    catch { }
                    return;
                }
                if (typeof data.toString !== 'function') {
                    try {
                        ws.close(1003, 'invalid');
                    }
                    catch { }
                    ;
                    return;
                }
                if (!allowMessage()) {
                    try {
                        ws.send(JSON.stringify({ error: 'rate_limited' }));
                    }
                    catch { }
                    try {
                        logger.warn({ event: 'ws_rate_limited', conversationId });
                    }
                    catch { }
                    try {
                        ws.close(1008, 'rate limit');
                    }
                    catch { }
                    return;
                }
                const text = data.toString();
                if (typeof text !== 'string' || text.length === 0) {
                    return;
                }
                if (text.length > 4000) {
                    try {
                        ws.send(JSON.stringify({ error: 'message_too_long' }));
                    }
                    catch { }
                    ;
                    return;
                }
                await (0, conversationService_1.addMessage)(conversationId, 'INBOUND', text);
                try {
                    await (0, telegramApi_1.ensureTopicForConversation)(conversationId);
                    await (0, telegramApi_1.sendCustomerMessage)(conversationId, text);
                }
                catch { }
                // Echo to all clients in this conversation (customer can have multiple tabs)
                (0, hub_1.broadcastToConversation)(conversationId, { direction: 'INBOUND', text });
                // Telegram bridge will send OUTBOUND via its own path later
            }
            catch (e) {
                logger.warn({ err: e }, 'failed to handle ws message');
                try {
                    ws.send(JSON.stringify({ error: 'message rejected' }));
                }
                catch { }
            }
        });
        ws.on('close', () => {
            (0, hub_1.removeClientFromConversation)(conversationId, ws);
            try {
                logger.info({ event: 'ws_closed', conversationId });
            }
            catch { }
        });
        try {
            ws.send(JSON.stringify({ ok: true }));
        }
        catch { }
    });
    return wss;
}
//# sourceMappingURL=server.js.map