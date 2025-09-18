"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTelegramUpdate = handleTelegramUpdate;
const pino_1 = __importDefault(require("pino"));
const client_1 = require("../db/client");
const conversationService_1 = require("../services/conversationService");
const telegramApi_1 = require("../services/telegramApi");
const hub_1 = require("../ws/hub");
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
async function handleTelegramUpdate(update) {
    const prisma = (0, client_1.getPrisma)();
    const msg = update.message;
    if (!msg || !msg.chat || !msg.message_thread_id) {
        return; // ignore non-topic messages
    }
    if (msg.from?.is_bot) {
        return; // ignore bot's own messages
    }
    const chatId = msg.chat.id;
    const threadId = msg.message_thread_id;
    const supportGroupIdEnv = process.env.SUPPORT_GROUP_ID;
    if (!supportGroupIdEnv || chatId.toString() !== supportGroupIdEnv) {
        return; // ignore other chats
    }
    // Find conversation by threadId
    const conversation = await prisma.conversation.findFirst({ where: { threadId } });
    if (!conversation) {
        logger.warn({ threadId }, 'no conversation found for thread');
        return;
    }
    const text = msg.text || msg.caption;
    if (!text)
        return;
    // /note command (private note; not sent to customer)
    if (typeof text === 'string' && text.startsWith('/note')) {
        const note = text.replace(/^\/note\s*/, '').trim();
        await prisma.conversation.update({ where: { id: conversation.id }, data: { aboutNote: note || null } });
        await (0, conversationService_1.recordAudit)(conversation.id, `telegram:${msg.from?.id ?? 'unknown'}`, 'set_note', { length: note.length });
        try {
            await (0, telegramApi_1.updateTopicTitleFromConversation)(conversation.id);
        }
        catch { }
        return;
    }
    // /claim (assign to current Telegram user)
    if (typeof text === 'string' && text.startsWith('/claim')) {
        const tgId = msg.from?.id;
        if (!tgId)
            return;
        await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'OPEN_ASSIGNED', assignedAgentTgId: BigInt(tgId) } });
        await (0, conversationService_1.recordAudit)(conversation.id, `telegram:${tgId}`, 'claim', {});
        try {
            await (0, telegramApi_1.updateTopicTitleFromConversation)(conversation.id);
        }
        catch { }
        try {
            await (0, telegramApi_1.sendAgentMessage)(conversation.id, `Claimed by @${msg.from?.username ?? tgId}`);
        }
        catch { }
        return;
    }
    // /close (close conversation and topic)
    if (typeof text === 'string' && text.startsWith('/close')) {
        const tgId = msg.from?.id;
        await (0, conversationService_1.closeConversation)(conversation.id, `telegram:${tgId ?? 'unknown'}`);
        try {
            await (0, telegramApi_1.closeTopic)(conversation.id);
        }
        catch { }
        try {
            await (0, telegramApi_1.sendAgentMessage)(conversation.id, `Closed by @${msg.from?.username ?? tgId}`);
        }
        catch { }
        return;
    }
    const created = await (0, conversationService_1.addMessage)(conversation.id, 'OUTBOUND', text);
    (0, hub_1.broadcastToConversation)(conversation.id, { direction: 'OUTBOUND', text: created.text });
}
//# sourceMappingURL=bot.js.map