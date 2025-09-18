"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCustomerName = validateCustomerName;
exports.createConversation = createConversation;
exports.setNickname = setNickname;
exports.listConversations = listConversations;
exports.getConversationWithMessages = getConversationWithMessages;
exports.addMessage = addMessage;
exports.closeConversation = closeConversation;
exports.blockConversation = blockConversation;
exports.recordAudit = recordAudit;
const client_1 = require("../db/client");
const codename_1 = require("./codename");
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
async function listConversations(status) {
    const prisma = (0, client_1.getPrisma)();
    const where = status ? { status: status } : {};
    return prisma.conversation.findMany({ where, orderBy: { updatedAt: 'desc' } });
}
async function getConversationWithMessages(conversationId) {
    const prisma = (0, client_1.getPrisma)();
    return prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: 'asc' } }, auditLogs: false },
    });
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