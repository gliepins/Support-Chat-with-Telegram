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
function startsWithSlash(text) {
    return text.trim().startsWith('/');
}
function isKnownCommandText(text) {
    const first = (text.trim().split(/\s+/)[0] || '').toLowerCase();
    const [base = ''] = first.split('@');
    return ['/help', '/claim', '/close', '/note', '/codename', '/myname', '/whoami', '/myid'].includes(base);
}
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
        const text = String(msg.text ?? msg.caption ?? '');
        if (text.length === 0)
            return;
        const safeText = text;
        if (/^\/help\b/.test(safeText)) {
            try {
                logger.info({ event: 'help_root_caught', text });
            }
            catch { }
            const help = [
                'Commands:',
                '/claim — assign conversation to yourself (in topic)',
                '/close — close the conversation (in topic)',
                '/note <text> — set private note (in topic)',
                '/codename <text> — set codename (in topic)',
                '/myname or /whoami — your agent display name',
                '/myid — your Telegram id',
            ].join('\n');
            try {
                await (0, telegramApi_1.sendGroupMessage)(help);
            }
            catch { }
            return;
        }
        if ((/^\/myname\b/.test(safeText) || /^\/whoami\b/.test(safeText))) {
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
        if (/^\/myid\b/.test(safeText)) {
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
    const text = String(msg.text ?? msg.caption ?? '');
    if (text.length === 0)
        return;
    const safeText = text;
    // Log any slash messages for troubleshooting
    try {
        if (safeText.trim().startsWith('/')) {
            const base = (safeText.trim().split(/\s+/)[0] || '').toLowerCase();
            const baseNoBot = base.split('@')[0];
            logger.info({ event: 'slash_in_topic', raw: text, base, baseNoBot, threadId });
        }
    }
    catch { }
    // Robust base command extraction
    const baseCmd = (safeText.trim().split(/\s+/)[0] || '').toLowerCase().split('@')[0];
    if (baseCmd === '/help') {
        try {
            logger.info({ event: 'help_topic_caught', text, threadId });
        }
        catch { }
        const help = [
            'Commands:',
            '/claim — assign conversation to yourself',
            '/close — close the conversation',
            '/note <text> — set private note',
            '/codename <text> — set codename',
            '/myname or /whoami — your agent display name',
            '/myid — your Telegram id',
        ].join('\n');
        try {
            await (0, telegramApi_1.sendAgentMessage)(conversation.id, help);
        }
        catch { }
        return;
    }
    // /codename (set conversation codename silently)
    if (safeText.startsWith('/codename')) {
        const rest = safeText.replace(/^\/codename\s*/, '').trim();
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
    if ((/^\/myname\b/.test(safeText) || /^\/whoami\b/.test(safeText))) {
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
    if (/^\/myid\b/.test(safeText)) {
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
    if (safeText.startsWith('/note')) {
        const note = safeText.replace(/^\/note\s*/, '').trim();
        await prisma.conversation.update({ where: { id: conversation.id }, data: { aboutNote: note || null } });
        await (0, conversationService_1.recordAudit)(conversation.id, `telegram:${msg.from?.id ?? 'unknown'}`, 'set_note', { length: note.length });
        try {
            await (0, telegramApi_1.updateTopicTitleFromConversation)(conversation.id);
        }
        catch { }
        return;
    }
    // /claim (assign to current Telegram user)
    if (safeText.startsWith('/claim')) {
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
    if (safeText.startsWith('/close')) {
        const tgId = msg.from?.id;
        await (0, conversationService_1.closeConversation)(conversation.id, `telegram:${tgId ?? 'unknown'}`, { suppressCustomerNote: true });
        try {
            const prisma = (0, client_1.getPrisma)();
            const updated = await prisma.conversation.findUnique({ where: { id: conversation.id } });
            const convLocale = String(updated?.locale || 'default');
            let closingText = null;
            if (tgId) {
                try {
                    closingText = await (0, agentService_1.getClosingMessageForAgentLocale)(BigInt(tgId), convLocale);
                }
                catch { }
            }
            if (!closingText)
                closingText = 'Conversation closed. You can write to reopen.';
            // First persist to customer transcript and broadcast
            const created = await (0, conversationService_1.addMessage)(conversation.id, 'OUTBOUND', closingText);
            let label = null;
            try {
                label = await (0, conversationService_1.getAssignedAgentName)(conversation.id);
            }
            catch { }
            (0, hub_1.broadcastToConversation)(conversation.id, { direction: 'OUTBOUND', text: created.text, agent: label || (msg.from?.username ? '@' + msg.from.username : undefined) });
            // Notify closed state immediately to clients
            try {
                (0, hub_1.broadcastToConversation)(conversation.id, { type: 'conversation_closed' });
            }
            catch { }
            // Then post to Telegram topic
            try {
                await (0, telegramApi_1.sendAgentMessage)(conversation.id, closingText);
            }
            catch { }
        }
        catch { }
        try {
            await (0, telegramApi_1.closeTopic)(conversation.id);
        }
        catch { }
        return;
    }
    // Intercept any unknown slash command so it never reaches the customer
    if (startsWithSlash(safeText) && !isKnownCommandText(safeText)) {
        try {
            await (0, telegramApi_1.sendAgentMessage)(conversation.id, 'Unknown command. Send /help for available commands.');
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
    const created = await (0, conversationService_1.addMessage)(conversation.id, 'OUTBOUND', safeText);
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