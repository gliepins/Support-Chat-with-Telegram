"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureTopicForConversation = ensureTopicForConversation;
exports.sendAgentMessage = sendAgentMessage;
exports.sendCustomerMessage = sendCustomerMessage;
exports.updateTopicTitleFromConversation = updateTopicTitleFromConversation;
exports.closeTopic = closeTopic;
exports.deleteTopicByThreadId = deleteTopicByThreadId;
exports.sendTopicMessage = sendTopicMessage;
exports.pinTopicMessage = pinTopicMessage;
exports.sendTopicControls = sendTopicControls;
exports.answerCallback = answerCallback;
exports.sendGroupMessage = sendGroupMessage;
const pino_1 = __importDefault(require("pino"));
const client_1 = require("../db/client");
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
const API_BASE = 'https://api.telegram.org';
function isTelegramSilent() {
    return true;
}
async function tgFetch(method, body) {
    const token = process.env.BOT_TOKEN;
    if (!token)
        throw new Error('BOT_TOKEN not set');
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) {
        logger.warn({ method, body, json }, 'telegram api error');
    }
    return json;
}
async function ensureTopicForConversation(conversationId) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv)
        throw new Error('conversation not found');
    if (conv.threadId)
        return conv.threadId;
    const chatId = process.env.SUPPORT_GROUP_ID;
    if (!chatId)
        throw new Error('SUPPORT_GROUP_ID not set');
    const title = conv.customerName ? `${conv.customerName} — ${conv.codename}` : conv.codename;
    const resp = await tgFetch('createForumTopic', { chat_id: chatId, name: title });
    const threadId = resp.result?.message_thread_id;
    await prisma.conversation.update({ where: { id: conversationId }, data: { threadId } });
    try {
        await sendTopicControls(conversationId);
    }
    catch { }
    return threadId;
}
async function sendAgentMessage(conversationId, text) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || !conv.threadId) {
        await ensureTopicForConversation(conversationId);
    }
    const chatId = process.env.SUPPORT_GROUP_ID;
    const updated = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!updated?.threadId)
        throw new Error('thread id missing');
    await tgFetch('sendMessage', { chat_id: chatId, message_thread_id: updated.threadId, text, disable_notification: isTelegramSilent() });
}
async function sendCustomerMessage(conversationId, text) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || !conv.threadId) {
        await ensureTopicForConversation(conversationId);
    }
    const chatId = process.env.SUPPORT_GROUP_ID;
    const updated = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!updated?.threadId)
        throw new Error('thread id missing');
    const display = updated.customerName && updated.customerName.trim().length > 0 ? updated.customerName.trim() : updated.codename;
    await tgFetch('sendMessage', { chat_id: chatId, message_thread_id: updated.threadId, text: `${display}: ${text}`, disable_notification: isTelegramSilent() });
}
async function updateTopicTitleFromConversation(conversationId) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv)
        throw new Error('conversation not found');
    const threadId = conv.threadId ?? (await ensureTopicForConversation(conversationId));
    const chatId = process.env.SUPPORT_GROUP_ID;
    if (!chatId)
        throw new Error('SUPPORT_GROUP_ID not set');
    const badge = conv.aboutNote ? ' — 📝' : '';
    const title = (conv.customerName ? `${conv.customerName} — ${conv.codename}` : conv.codename) + badge;
    await tgFetch('editForumTopic', { chat_id: chatId, message_thread_id: threadId, name: title });
}
async function closeTopic(conversationId) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv)
        throw new Error('conversation not found');
    const threadId = conv.threadId ?? (await ensureTopicForConversation(conversationId));
    const chatId = process.env.SUPPORT_GROUP_ID;
    if (!chatId)
        throw new Error('SUPPORT_GROUP_ID not set');
    await tgFetch('closeForumTopic', { chat_id: chatId, message_thread_id: threadId });
}
async function deleteTopicByThreadId(threadId) {
    const chatId = process.env.SUPPORT_GROUP_ID;
    if (!chatId)
        throw new Error('SUPPORT_GROUP_ID not set');
    await tgFetch('deleteForumTopic', { chat_id: chatId, message_thread_id: threadId });
}
async function sendTopicMessage(conversationId, text) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || !conv.threadId) {
        await ensureTopicForConversation(conversationId);
    }
    const chatId = process.env.SUPPORT_GROUP_ID;
    const updated = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!updated?.threadId)
        throw new Error('thread id missing');
    const resp = await tgFetch('sendMessage', { chat_id: chatId, message_thread_id: updated.threadId, text, disable_notification: isTelegramSilent() });
    return { message_id: resp.result?.message_id };
}
async function pinTopicMessage(messageId) {
    const chatId = process.env.SUPPORT_GROUP_ID;
    await tgFetch('pinChatMessage', { chat_id: chatId, message_id: messageId, disable_notification: true });
}
async function sendTopicControls(conversationId) {
    const prisma = (0, client_1.getPrisma)();
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv)
        throw new Error('conversation not found');
    const threadId = conv.threadId ?? (await ensureTopicForConversation(conversationId));
    const chatId = process.env.SUPPORT_GROUP_ID;
    if (!chatId)
        throw new Error('SUPPORT_GROUP_ID not set');
    const reply_markup = {
        inline_keyboard: [[{ text: 'Claim', callback_data: `claim:${conversationId}` }, { text: 'Close', callback_data: `close:${conversationId}` }]],
    };
    await tgFetch('sendMessage', { chat_id: chatId, message_thread_id: threadId, text: 'Actions', reply_markup, disable_notification: isTelegramSilent() });
}
async function answerCallback(callbackQueryId, text) {
    await tgFetch('answerCallbackQuery', { callback_query_id: callbackQueryId, text: text ?? '' });
}
async function sendGroupMessage(text, threadId) {
    const chatId = process.env.SUPPORT_GROUP_ID;
    if (!chatId)
        throw new Error('SUPPORT_GROUP_ID not set');
    const body = { chat_id: chatId, text, disable_notification: isTelegramSilent() };
    if (typeof threadId === 'number')
        body.message_thread_id = threadId;
    await tgFetch('sendMessage', body);
}
//# sourceMappingURL=telegramApi.js.map