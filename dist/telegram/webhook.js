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
exports.telegramRouter = telegramRouter;
const express_1 = require("express");
const pino_1 = __importDefault(require("pino"));
const bot_1 = require("./bot");
const telegramApi_1 = require("../services/telegramApi");
const hub_1 = require("../ws/hub");
const client_1 = require("../db/client");
const agentService_1 = require("../services/agentService");
const conversationService_1 = require("../services/conversationService");
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
// Minimal skeleton: verify secret in path and optional header; log updates for now
function telegramRouter() {
    const router = (0, express_1.Router)();
    const secretPath = process.env.WEBHOOK_SECRET || 'secret-not-set';
    router.post(`/v1/telegram/webhook/${secretPath}`, async (req, res) => {
        const configuredHeaderSecret = process.env.TELEGRAM_HEADER_SECRET;
        if (configuredHeaderSecret) {
            const provided = req.header('x-telegram-bot-api-secret-token');
            if (provided !== configuredHeaderSecret) {
                logger.warn({ hasHeader: Boolean(provided) }, 'telegram header secret mismatch');
                return res.status(401).json({ ok: false });
            }
        }
        const update = req.body;
        logger.info({ update }, 'telegram update');
        // Fallback: intercept /help at webhook level to avoid forwarding to customer
        try {
            const msg = update && update.message;
            const text = msg && (msg.text || msg.caption);
            if (text && typeof text === 'string' && /^\/help\b/i.test(text.trim())) {
                const threadId = msg.message_thread_id;
                const help = [
                    'Commands:',
                    '/claim — assign conversation to yourself',
                    '/close — close the conversation',
                    '/note <text> — set private note',
                    '/codename <text> — set codename',
                    '/myname or /whoami — your agent display name',
                    '/myid — your Telegram id',
                ].join('\n');
                if (threadId) {
                    try {
                        const prisma = (0, client_1.getPrisma)();
                        const conv = await prisma.conversation.findFirst({ where: { threadId } });
                        if (conv) {
                            await (0, telegramApi_1.sendAgentMessage)(conv.id, help);
                        }
                    }
                    catch { }
                }
                else {
                    try {
                        await (0, telegramApi_1.sendGroupMessage)(help);
                    }
                    catch { }
                }
                return res.json({ ok: true });
            }
        }
        catch { }
        // Handle inline button callbacks
        if (update && update.callback_query) {
            try {
                const cb = update.callback_query;
                const data = cb.data || '';
                await (0, telegramApi_1.answerCallback)(cb.id, 'OK');
                const [action, conversationId] = data.split(':');
                if (conversationId) {
                    const prisma = (0, client_1.getPrisma)();
                    if (action === 'claim') {
                        const tgId = cb.from?.id;
                        if (tgId) {
                            await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'OPEN_ASSIGNED', assignedAgentTgId: BigInt(tgId) } });
                            await (0, conversationService_1.recordAudit)(conversationId, `telegram:${tgId}`, 'claim', { via: 'button' });
                            try {
                                await (0, telegramApi_1.updateTopicTitleFromConversation)(conversationId);
                            }
                            catch { }
                            try {
                                await (0, telegramApi_1.sendAgentMessage)(conversationId, `Claimed by @${cb.from?.username ?? tgId}`);
                            }
                            catch { }
                            // Announce agent joining with display name if available
                            try {
                                const tgIdStr = cb.from?.id ? String(cb.from.id) : '';
                                let label = null;
                                if (tgIdStr) {
                                    try {
                                        label = await (0, agentService_1.getAgentNameByTgId)(BigInt(tgIdStr));
                                    }
                                    catch { }
                                }
                                (0, hub_1.broadcastToConversation)(conversationId, { type: 'agent_joined', agent: label || 'Support' });
                            }
                            catch { }
                        }
                    }
                    else if (action === 'close') {
                        const tgId = cb.from?.id;
                        await (0, conversationService_1.closeConversation)(conversationId, `telegram:${tgId ?? 'unknown'}`, { suppressCustomerNote: true });
                        try {
                            const prisma = (0, client_1.getPrisma)();
                            const agent = tgId ? await prisma.agent.findUnique({ where: { tgId: BigInt(tgId) } }) : null;
                            const closing = agent && agent.isActive && agent.closingMessage ? agent.closingMessage : 'Conversation closed. You can write to reopen.';
                            // First persist to transcript and broadcast to customer
                            try {
                                const { addMessage, getAssignedAgentName } = await Promise.resolve().then(() => __importStar(require('../services/conversationService')));
                                const msgRow = await addMessage(conversationId, 'OUTBOUND', closing);
                                let label = null;
                                try {
                                    label = await getAssignedAgentName(conversationId);
                                }
                                catch { }
                                (0, hub_1.broadcastToConversation)(conversationId, { direction: 'OUTBOUND', text: msgRow.text, agent: label || 'Support' });
                                try {
                                    (0, hub_1.broadcastToConversation)(conversationId, { type: 'conversation_closed' });
                                }
                                catch { }
                            }
                            catch { }
                            // Then notify Telegram topic and close it
                            try {
                                await (0, telegramApi_1.sendAgentMessage)(conversationId, closing);
                            }
                            catch { }
                            try {
                                await (0, telegramApi_1.closeTopic)(conversationId);
                            }
                            catch { }
                        }
                        catch { }
                    }
                }
            }
            catch (e) {
                logger.warn({ err: e }, 'failed to handle callback');
            }
            return res.json({ ok: true });
        }
        // Handle regular messages
        try {
            void (0, bot_1.handleTelegramUpdate)(update);
        }
        catch { }
        return res.json({ ok: true });
    });
    return router;
}
//# sourceMappingURL=webhook.js.map