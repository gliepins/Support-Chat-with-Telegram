import pino from 'pino';
import { getPrisma } from '../db/client';

const logger = pino({ transport: { target: 'pino-pretty' } });

const API_BASE = 'https://api.telegram.org';

async function tgFetch(method: string, body: any): Promise<any> {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN not set');
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  } as any);
  const json = await res.json();
  if (!json.ok) {
    logger.warn({ method, body, json }, 'telegram api error');
  }
  return json;
}

export async function ensureTopicForConversation(conversationId: string): Promise<number> {
  const prisma = getPrisma();
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error('conversation not found');
  if (conv.threadId) return conv.threadId;
  const chatId = process.env.SUPPORT_GROUP_ID;
  if (!chatId) throw new Error('SUPPORT_GROUP_ID not set');
  const title = conv.customerName ? `${conv.customerName} — ${conv.codename}` : conv.codename;
  const resp = await tgFetch('createForumTopic', { chat_id: chatId, name: title });
  const threadId = resp.result?.message_thread_id as number;
  await prisma.conversation.update({ where: { id: conversationId }, data: { threadId } });
  try { await sendTopicControls(conversationId); } catch {}
  return threadId;
}

export async function sendAgentMessage(conversationId: string, text: string): Promise<void> {
  const prisma = getPrisma();
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || !conv.threadId) {
    await ensureTopicForConversation(conversationId);
  }
  const chatId = process.env.SUPPORT_GROUP_ID;
  const updated = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!updated?.threadId) throw new Error('thread id missing');
  await tgFetch('sendMessage', { chat_id: chatId, message_thread_id: updated.threadId, text });
}

export async function updateTopicTitleFromConversation(conversationId: string): Promise<void> {
  const prisma = getPrisma();
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error('conversation not found');
  const threadId = conv.threadId ?? (await ensureTopicForConversation(conversationId));
  const chatId = process.env.SUPPORT_GROUP_ID;
  if (!chatId) throw new Error('SUPPORT_GROUP_ID not set');
  const badge = conv.aboutNote ? ' — 📝' : '';
  const title = (conv.customerName ? `${conv.customerName} — ${conv.codename}` : conv.codename) + badge;
  await tgFetch('editForumTopic', { chat_id: chatId, message_thread_id: threadId, name: title });
}

export async function closeTopic(conversationId: string): Promise<void> {
  const prisma = getPrisma();
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error('conversation not found');
  const threadId = conv.threadId ?? (await ensureTopicForConversation(conversationId));
  const chatId = process.env.SUPPORT_GROUP_ID;
  if (!chatId) throw new Error('SUPPORT_GROUP_ID not set');
  await tgFetch('closeForumTopic', { chat_id: chatId, message_thread_id: threadId });
}

export async function sendTopicMessage(conversationId: string, text: string): Promise<{ message_id: number }> {
  const prisma = getPrisma();
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || !conv.threadId) {
    await ensureTopicForConversation(conversationId);
  }
  const chatId = process.env.SUPPORT_GROUP_ID;
  const updated = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!updated?.threadId) throw new Error('thread id missing');
  const resp = await tgFetch('sendMessage', { chat_id: chatId, message_thread_id: updated.threadId, text });
  return { message_id: resp.result?.message_id as number };
}

export async function pinTopicMessage(messageId: number): Promise<void> {
  const chatId = process.env.SUPPORT_GROUP_ID;
  await tgFetch('pinChatMessage', { chat_id: chatId, message_id: messageId, disable_notification: true });
}

export async function sendTopicControls(conversationId: string): Promise<void> {
  const prisma = getPrisma();
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error('conversation not found');
  const threadId = conv.threadId ?? (await ensureTopicForConversation(conversationId));
  const chatId = process.env.SUPPORT_GROUP_ID;
  if (!chatId) throw new Error('SUPPORT_GROUP_ID not set');
  const reply_markup = {
    inline_keyboard: [[{ text: 'Claim', callback_data: `claim:${conversationId}` }, { text: 'Close', callback_data: `close:${conversationId}` }]],
  };
  await tgFetch('sendMessage', { chat_id: chatId, message_thread_id: threadId, text: 'Actions', reply_markup });
}

export async function answerCallback(callbackQueryId: string, text?: string): Promise<void> {
  await tgFetch('answerCallbackQuery', { callback_query_id: callbackQueryId, text: text ?? '' });
}


