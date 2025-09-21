import { MessageDirection, Prisma } from '@prisma/client';
import pino from 'pino';
import { getPrisma } from '../db/client';
import { generateCodename } from './codename';
import { ensureTopicForConversation, sendAgentMessage } from './telegramApi';
import { broadcastToConversation } from '../ws/hub';
import { getAgentNameByTgId } from './agentService';

const logger = pino({ transport: { target: 'pino-pretty' } });

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

export async function createConversation(initialName?: string, initialLocale?: string) {
  const prisma = getPrisma();
  const codename = generateCodename();
  const normLocale = (function(){ try{ if(initialLocale && typeof initialLocale==='string' && initialLocale.trim()){ return initialLocale.trim().toLowerCase().slice(0,2); } }catch(_){} return undefined; })();
  const data: Prisma.ConversationCreateInput = {
    codename,
    status: 'OPEN_UNCLAIMED',
    ...(normLocale ? { locale: normLocale as any } : {}),
    ...(initialName
      ? (() => {
          const validation = validateCustomerName(initialName);
          if (!validation.ok) {
            throw new Error(validation.reason);
          }
          return { customerName: initialName.trim() } as { customerName: string };
        })()
      : {}),
  };
  const conversation = await prisma.conversation.create({ data });
  // Proactively create the Telegram topic and post welcome (if configured)
  try {
    await ensureTopicForConversation(conversation.id);
    try { logger.info({ event: 'topic_created', conversationId: conversation.id, codename }); } catch {}
    // Also send welcome via centralized system messages if configured
    try {
      const { emitServiceMessage } = await import('./systemMessages');
      await emitServiceMessage(conversation.id, 'welcome_message', {});
    } catch (e) { try { logger.warn({ event: 'welcome_error', conversationId: conversation.id, err: e }); } catch {} }
  } catch (e) { try { logger.warn({ event: 'topic_create_error', conversationId: conversation.id, err: e }); } catch {} }
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

export async function listConversations(status?: string, q?: string) {
  const prisma = getPrisma();
  let where: any = {};
  if (status) {
    if (status.toLowerCase() === 'open') {
      where = { status: { in: ['OPEN_UNCLAIMED', 'OPEN_ASSIGNED', 'AWAITING_CUSTOMER'] } };
    } else if (status.toLowerCase() === 'closed') {
      where = { status: 'CLOSED' };
    } else if (status.toLowerCase() === 'blocked') {
      where = { status: 'BLOCKED' };
    } else if (status.toLowerCase() === 'all') {
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

export async function getConversationWithMessages(conversationId: string) {
  const prisma = getPrisma();
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: 'asc' } }, auditLogs: false },
  });
}

export async function listMessagesForConversation(conversationId: string) {
  const prisma = getPrisma();
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true, direction: true, text: true },
  });
}

export async function getAssignedAgentName(conversationId: string): Promise<string | null> {
  const prisma = getPrisma();
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv || conv.assignedAgentTgId == null) return null;
  try { return await getAgentNameByTgId(conv.assignedAgentTgId); } catch { return null }
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
      try { const { emitServiceMessage } = await import('./systemMessages'); await emitServiceMessage(conversationId, 'conversation_reopened', {}); } catch {}
    }
  }
  // Count messages before creating new one (used for metrics or future conditions)
  const messagesBefore = await prisma.message.count({ where: { conversationId } });
  const msg = await prisma.message.create({
    data: {
      conversationId,
      direction: direction as MessageDirection,
      text: trimmed,
    },
  });
  const nowField = direction === 'INBOUND' ? { lastCustomerAt: new Date() } : { lastAgentAt: new Date() };
  await prisma.conversation.update({ where: { id: conversationId }, data: nowField });
  // While unclaimed: after any inbound, show waiting note (rate-limited via template)
  if (direction === 'INBOUND') {
    try {
      const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (conv && conv.assignedAgentTgId == null) {
        try { const { emitServiceMessage } = await import('./systemMessages'); await emitServiceMessage(conversationId, 'waiting_for_agent', {}); } catch {}
      }
    } catch {}
  }
  // If inbound from customer, ensure topic exists and fan out to Telegram later via bridging flow
  return msg;
}

export async function closeConversation(conversationId: string, actor: string, opts?: { suppressCustomerNote?: boolean }) {
  const prisma = getPrisma();
  const conv = await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'CLOSED' } });
  await recordAudit(conversationId, actor, 'close', {});
  if (!opts || !opts.suppressCustomerNote) {
    try { broadcastToConversation(conversationId, { type: 'conversation_closed' }); } catch {}
  }
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


