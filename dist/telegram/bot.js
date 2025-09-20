"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTelegramUpdate = handleTelegramUpdate;
const pino_1 = __importDefault(require("pino"));
const client_1 = require("../db/client");
const conversationService_1 = require("../services/conversationService");
const agentService_1 = require("../services/agentService");
const telegramApi_1 = require("../services/telegramApi");
const hub_1 = require("../ws/hub");
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
async function handleTelegramUpdate(update) {
    const prisma = (0, client_1.getPrisma)();
    const msg = update.message;
    if (!msg || !msg.chat) {
        return;
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
    // If in group root (no thread), handle only agent utility commands and exit
    if (!threadId) {
        const text = msg.text || msg.caption;
        if (!text)
            return;
        if (typeof text === 'string' && (/^\/myname\b/.test(text) || /^\/whoami\b/.test(text))) {
            const tgIdNum = msg.from?.id;
            if (!tgIdNum)
                return;
            try {
                const name = await (0, agentService_1.getAgentNameByTgId)(BigInt(tgIdNum));
                const reply = name ? `Your agent name is: ${name}` : 'No agent name set. Ask an admin to assign one in Admin → Agents.';
                await (0, telegramApi_1.sendGroupMessage)(reply);
            }
            catch {
                await (0, telegramApi_1.sendGroupMessage)('Could not look up your agent name right now.');
            }
        }
        if (typeof text === 'string' && /^\/myid\b/.test(text)) {
            const tgIdNum = msg.from?.id;
            if (!tgIdNum)
                return;
            try {
                await (0, telegramApi_1.sendGroupMessage)(`Your Telegram user id: ${tgIdNum}`);
            }
            catch { }
        }
        return;
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
    // /codename (set conversation codename silently)
    if (typeof text === 'string' && text.startsWith('/codename')) {
        const rest = text.replace(/^\/codename\s*/, '').trim();
        if (rest.length < 2 || rest.length > 48) {
            try {
                await (0, telegramApi_1.sendAgentMessage)(conversation.id, 'Codename must be 2-48 characters.');
            }
            catch { }
            return;
        }
        await prisma.conversation.update({ where: { id: conversation.id }, data: { codename: rest } });
        await (0, conversationService_1.recordAudit)(conversation.id, `telegram:${msg.from?.id ?? 'unknown'}`, 'set_codename', { length: rest.length });
        try {
            await (0, telegramApi_1.updateTopicTitleFromConversation)(conversation.id);
        }
        catch { }
        try {
            await (0, telegramApi_1.sendAgentMessage)(conversation.id, `Codename updated.`);
        }
        catch { }
        return;
    }
    // /myname or /whoami (reply with assigned agent display name)
    if (typeof text === 'string' && (/^\/myname\b/.test(text) || /^\/whoami\b/.test(text))) {
        const tgIdNum = msg.from?.id;
        if (!tgIdNum)
            return;
        let reply = '';
        try {
            const name = await (0, agentService_1.getAgentNameByTgId)(BigInt(tgIdNum));
            if (name) {
                reply = `Your agent name is: ${name}`;
            }
            else {
                reply = 'No agent name set. Ask an admin to assign one in Admin → Agents.';
            }
        }
        catch {
            reply = 'Could not look up your agent name right now.';
        }
        try {
            await (0, telegramApi_1.sendAgentMessage)(conversation.id, reply);
        }
        catch { }
        return;
    }
    // /myid (reply with numeric Telegram user id)
    if (typeof text === 'string' && /^\/myid\b/.test(text)) {
        const tgIdNum = msg.from?.id;
        if (!tgIdNum)
            return;
        try {
            await (0, telegramApi_1.sendAgentMessage)(conversation.id, `Your Telegram user id: ${tgIdNum}`);
        }
        catch { }
        return;
    }
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
        try {
            const label = await (0, conversationService_1.getAssignedAgentName)(conversation.id);
            (0, hub_1.broadcastToConversation)(conversation.id, { type: 'agent_joined', agent: label || 'Support' });
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
            const prisma = (0, client_1.getPrisma)();
            const agent = tgId ? await prisma.agent.findUnique({ where: { tgId: BigInt(tgId) } }) : null;
            const closing = agent?.closingMessage && agent.isActive ? agent.closingMessage : null;
            await (0, telegramApi_1.sendAgentMessage)(conversation.id, closing || `Closed by @${msg.from?.username ?? tgId}`);
        }
        catch { }
        return;
    }
    // Prevent sending to customer until conversation is claimed
    if (conversation.status === 'OPEN_UNCLAIMED') {
        try {
            await (0, telegramApi_1.sendAgentMessage)(conversation.id, 'Please /claim this conversation before replying.');
        }
        catch { }
        return;
    }
    if (conversation.status === 'CLOSED') {
        try {
            await (0, telegramApi_1.sendAgentMessage)(conversation.id, 'Conversation is closed. Send /claim to reopen or reply from customer will reopen.');
        }
        catch { }
        return;
    }
    const created = await (0, conversationService_1.addMessage)(conversation.id, 'OUTBOUND', text);
    let agentName = null;
    try {
        agentName = await (0, conversationService_1.getAssignedAgentName)(conversation.id);
        if (!agentName && msg.from?.id) {
            agentName = await (0, agentService_1.getAgentNameByTgId)(BigInt(msg.from.id));
        }
    }
    catch { }
    (0, hub_1.broadcastToConversation)(conversation.id, { direction: 'OUTBOUND', text: created.text, agent: agentName || (msg.from?.username ? '@' + msg.from.username : undefined) });
}
//# sourceMappingURL=bot.js.map