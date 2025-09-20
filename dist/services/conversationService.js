"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCustomerName = validateCustomerName;
exports.createConversation = createConversation;
exports.setNickname = setNickname;
exports.listConversations = listConversations;
exports.getConversationWithMessages = getConversationWithMessages;
exports.listMessagesForConversation = listMessagesForConversation;
exports.getAssignedAgentName = getAssignedAgentName;
exports.addMessage = addMessage;
exports.closeConversation = closeConversation;
exports.blockConversation = blockConversation;
exports.recordAudit = recordAudit;
const pino_1 = __importDefault(require("pino"));
const client_1 = require("../db/client");
const codename_1 = require("./codename");
const telegramApi_1 = require("./telegramApi");
const hub_1 = require("../ws/hub");
const agentService_1 = require("./agentService");
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
function validateCustomerName(name) {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 32) {
        return { ok: false, reason: 'name must be 2-32 characters' };
    }
    const linkLike = /https?:\/\//i.test(trimmed) || /\bwww\./i.test(trimmed) || /\.[a-z]{2,}/i.test(trimmed);
    if (linkLike) {
        return { ok: false, reason: 'links are not allowed' };
    }
    return { ok: true };
}
async function createConversation(initialName) {
    const prisma = (0, client_1.getPrisma)();
    const codename = (0, codename_1.generateCodename)();
    const conversation = await prisma.conversation.create({
        data: {
            codename,
            status: 'OPEN_UNCLAIMED',
            ...(initialName
                ? (() => {
                    const validation = validateCustomerName(initialName);
                    if (!validation.ok) {
                        throw new Error(validation.reason);
                    }
                    return { customerName: initialName.trim() };
                })()
                : {}),
        },
    });
    // Proactively create the Telegram topic and post welcome (if configured)
    try {
        await (0, telegramApi_1.ensureTopicForConversation)(conversation.id);
        try {
            logger.info({ event: 'topic_created', conversationId: conversation.id, codename });
        }
        catch { }
        // Also send welcome to the customer side as first OUTBOUND message
        try {
            const rows = await prisma.$queryRaw `SELECT value FROM "Setting" WHERE key = 'welcome_message' LIMIT 1`;
            const welcome = (rows && rows[0] && rows[0].value ? rows[0].value : '').trim();
            if (welcome) {
                const msg = await addMessage(conversation.id, 'OUTBOUND', welcome);
                try {
                    logger.info({ event: 'welcome_sent', conversationId: conversation.id });
                }
                catch { }
                try {
                    (0, hub_1.broadcastToConversation)(conversation.id, { direction: 'OUTBOUND', text: msg.text, agent: 'Support' });
                }
                catch { }
            }
        }
        catch (e) {
            try {
                logger.warn({ event: 'welcome_error', conversationId: conversation.id, err: e });
            }
            catch { }
        }
    }
    catch (e) {
        try {
            logger.warn({ event: 'topic_create_error', conversationId: conversation.id, err: e });
        }
        catch { }
    }
    return conversation;
}
async function setNickname(conversationId, name) {
    const prisma = (0, client_1.getPrisma)();
    const validation = validateCustomerName(name);
    if (!validation.ok) {
        throw new Error(validation.reason);
    }
    const conversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: { customerName: name.trim() },
    });
    await recordAudit(conversationId, 'system', 'set_nickname', { length: name.trim().length });
    return conversation;
}
async function listConversations(status, q) {
    const prisma = (0, client_1.getPrisma)();
    let where = {};
    if (status) {
        if (status.toLowerCase() === 'open') {
            where = { status: { in: ['OPEN_UNCLAIMED', 'OPEN_ASSIGNED', 'AWAITING_CUSTOMER'] } };
        }
        else if (status.toLowerCase() === 'closed') {
            where = { status: 'CLOSED' };
        }
        else if (status.toLowerCase() === 'blocked') {
            where = { status: 'BLOCKED' };
        }
        else if (status.toLowerCase() === 'all') {
            where = {};
        }
    }
    if (q && q.trim().length > 0) {
        const term = q.trim();
        where.AND = (where.AND || []).concat([{ OR: [
                    { codename: { contains: term, mode: 'insensitive' } },
                    { customerName: { contains: term, mode: 'insensitive' } },
                ] }]);
    }
    const list = await prisma.conversation.findMany({ where, orderBy: { updatedAt: 'desc' } });
    // Ensure JSON-safe (BigInt -> string)
    return list.map((c) => ({
        ...c,
        assignedAgentTgId: c.assignedAgentTgId == null ? null : c.assignedAgentTgId.toString(),
    }));
}
async function getConversationWithMessages(conversationId) {
    const prisma = (0, client_1.getPrisma)();
    return prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } }, auditLogs: false },
    });
}
async function listMessagesForConversation(conversationId) {
    const prisma = (0, client_1.getPrisma)();
    return prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, direction: true, text: true },
    });
}
async function getAssignedAgentName(conversationId) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || conv.assignedAgentTgId == null)
        return null;
    try {
        return await (0, agentService_1.getAgentNameByTgId)(conv.assignedAgentTgId);
    }
    catch {
        return null;
    }
}
async function addMessage(conversationId, direction, text) {
    const prisma = (0, client_1.getPrisma)();
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > 4000) {
        throw new Error('message length invalid');
    }
    // Reopen logic on customer message
    if (direction === 'INBOUND') {
        const existing = await prisma.conversation.findUnique({ where: { id: conversationId } });
        if (existing && (existing.status === 'CLOSED' || existing.status === 'BLOCKED')) {
            if (existing.status === 'BLOCKED') {
                throw new Error('conversation blocked');
            }
            await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'OPEN_UNCLAIMED' } });
        }
    }
    const msg = await prisma.message.create({
        data: {
            conversationId,
            direction: direction,
            text: trimmed,
        },
    });
    const nowField = direction === 'INBOUND' ? { lastCustomerAt: new Date() } : { lastAgentAt: new Date() };
    await prisma.conversation.update({ where: { id: conversationId }, data: nowField });
    // If inbound from customer, ensure topic exists and fan out to Telegram later via bridging flow
    return msg;
}
async function closeConversation(conversationId, actor) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'CLOSED' } });
    await recordAudit(conversationId, actor, 'close', {});
    try {
        (0, hub_1.broadcastToConversation)(conversationId, { type: 'conversation_closed' });
    }
    catch { }
    return conv;
}
async function blockConversation(conversationId, actor) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'BLOCKED' } });
    await recordAudit(conversationId, actor, 'block', {});
    return conv;
}
async function recordAudit(conversationId, actor, action, meta) {
    const prisma = (0, client_1.getPrisma)();
    await prisma.auditLog.create({
        data: {
            conversationId,
            actor,
            action,
            meta: meta,
        },
    });
}
//# sourceMappingURL=conversationService.js.map