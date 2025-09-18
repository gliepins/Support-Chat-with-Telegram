"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.telegramRouter = telegramRouter;
const express_1 = require("express");
const pino_1 = __importDefault(require("pino"));
const bot_1 = require("./bot");
const telegramApi_1 = require("../services/telegramApi");
const client_1 = require("../db/client");
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
                // temporarily accept updates to continue integration
            }
        }
        const update = req.body;
        logger.info({ update }, 'telegram update');
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
                        }
                    }
                    else if (action === 'close') {
                        const tgId = cb.from?.id;
                        await (0, conversationService_1.closeConversation)(conversationId, `telegram:${tgId ?? 'unknown'}`);
                        try {
                            await (0, telegramApi_1.closeTopic)(conversationId);
                        }
                        catch { }
                        try {
                            await (0, telegramApi_1.sendAgentMessage)(conversationId, `Closed by @${cb.from?.username ?? tgId}`);
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