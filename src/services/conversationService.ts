import { MessageDirection, Prisma } from '@prisma/client';
import { getPrisma } from '../db/client';
import { generateCodename } from './codename';
import { ensureTopicForConversation, sendAgentMessage } from './telegramApi';

export function validateCustomerName(name: string): { ok: true } | { ok: false; reason: string } {
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

export async function createConversation(initialName?: string) {
  const prisma = getPrisma();
  const codename = generateCodename();
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
            return { customerName: initialName.trim() } as Prisma.ConversationCreateInput;
          })()
        : {}),
    } as Prisma.ConversationCreateInput,
  });
  return conversation;
}

export async function setNickname(conversationId: string, name: string) {
  const prisma = getPrisma();
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

export async function listConversations(status?: string) {
  const prisma = getPrisma();
  const where = status ? { status: status as any } : {};
  return prisma.conversation.findMany({ where, orderBy: { updatedAt: 'desc' } });
}

export async function getConversationWithMessages(conversationId: string) {
  const prisma = getPrisma();
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, auditLogs: false },
  });
}

export async function addMessage(conversationId: string, direction: 'INBOUND' | 'OUTBOUND', text: string) {
  const prisma = getPrisma();
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
      direction: direction as MessageDirection,
      text: trimmed,
    },
  });
  const nowField = direction === 'INBOUND' ? { lastCustomerAt: new Date() } : { lastAgentAt: new Date() };
  await prisma.conversation.update({ where: { id: conversationId }, data: nowField });
  // If inbound from customer, ensure topic exists and fan out to Telegram later via bridging flow
  return msg;
}

export async function closeConversation(conversationId: string, actor: string) {
  const prisma = getPrisma();
  const conv = await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'CLOSED' } });
  await recordAudit(conversationId, actor, 'close', {});
  return conv;
}

export async function blockConversation(conversationId: string, actor: string) {
  const prisma = getPrisma();
  const conv = await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'BLOCKED' } });
  await recordAudit(conversationId, actor, 'block', {});
  return conv;
}

export async function recordAudit(conversationId: string, actor: string, action: string, meta: unknown) {
  const prisma = getPrisma();
  await prisma.auditLog.create({
    data: {
      conversationId,
      actor,
      action,
      meta: meta as any,
    },
  });
}


