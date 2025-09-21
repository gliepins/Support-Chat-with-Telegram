import pino from 'pino';
import { getPrisma } from '../db/client';
import { addMessage, getAssignedAgentName } from './conversationService';
import { sendTopicMessage, pinTopicMessage } from './telegramApi';
import { broadcastToConversation } from '../ws/hub';

const logger = pino({ transport: { target: 'pino-pretty' } });

type EmitContext = {
  agentName?: string | null;
  customerName?: string | null;
  codename?: string | null;
  locale?: string | null;
  [k: string]: unknown;
};

const lastSentByKeyConv = new Map<string, number>();

function render(text: string, ctx: EmitContext): string {
  const replacements: Record<string, string> = {
    customer_name: (ctx.customerName ?? '').toString(),
    agent_name: (ctx.agentName ?? '').toString(),
    codename: (ctx.codename ?? '').toString(),
  };
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m: string, k: string) => (replacements[k] ?? `{${k}}`));
}

async function loadConversationContext(conversationId: string): Promise<EmitContext> {
  const prisma = getPrisma();
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  let agentName: string | null = null;
  try { agentName = await getAssignedAgentName(conversationId); } catch {}
  return { customerName: conv?.customerName ?? null, codename: conv?.codename ?? null, agentName, locale: (conv as any)?.locale ?? 'default' };
}

export async function getTemplateOrDefault(key: string, locale?: string): Promise<{
  enabled: boolean;
  text: string;
  toCustomerWs: boolean;
  toCustomerPersist: boolean;
  toTelegram: boolean;
  pinInTopic: boolean;
  rateLimitPerConvSec?: number | null;
}> {
  const prisma = getPrisma();
  try {
    // Prefer requested locale, fallback to default then legacy
    const desired = (locale && String(locale).trim()) ? String(locale).trim() : 'default';
    const lc2 = desired.toLowerCase().slice(0,2);
    let row = await (prisma as any).messageTemplateLocale.findFirst({ where: { key, locale: desired } });
    if (!row) row = await (prisma as any).messageTemplateLocale.findFirst({ where: { key, locale: lc2 } });
    if (!row) row = await (prisma as any).messageTemplateLocale.findFirst({ where: { key, locale: 'default' } });
    if (row) {
      return {
        enabled: !!row.enabled,
        text: String(row.text || ''),
        toCustomerWs: !!row.toCustomerWs,
        toCustomerPersist: !!row.toCustomerPersist,
        toTelegram: !!row.toTelegram,
        pinInTopic: !!row.pinInTopic,
        rateLimitPerConvSec: row.rateLimitPerConvSec ?? null,
      };
    }
    // Fallback to legacy table if locales not populated
    const legacy = await (prisma as any).messageTemplate.findUnique({ where: { key } });
    if (legacy) {
      return {
        enabled: !!legacy.enabled,
        text: String(legacy.text || ''),
        toCustomerWs: !!legacy.toCustomerWs,
        toCustomerPersist: !!legacy.toCustomerPersist,
        toTelegram: !!legacy.toTelegram,
        pinInTopic: !!legacy.pinInTopic,
        rateLimitPerConvSec: legacy.rateLimitPerConvSec ?? null,
      };
    }
  } catch (e) {
    try { logger.warn({ err: e }, 'message_template_lookup_failed'); } catch {}
  }
  // Fallback defaults
  if (key === 'welcome_message') {
    // Prefer Setting.welcome_message if present
    try {
      const prisma = getPrisma();
      const rows = await (prisma as any).$queryRaw`SELECT value FROM "Setting" WHERE key = 'welcome_message' LIMIT 1` as Array<{ value: string }>;
      const welcome = (rows && rows[0] && rows[0].value ? rows[0].value : '').trim();
      if (welcome) {
        return { enabled: true, text: welcome, toCustomerWs: true, toCustomerPersist: true, toTelegram: false, pinInTopic: false };
      }
    } catch {}
    return { enabled: false, text: '', toCustomerWs: false, toCustomerPersist: false, toTelegram: false, pinInTopic: false };
  }
  if (key === 'waiting_for_agent') {
    return { enabled: true, text: 'Thanks for your message — waiting for a support agent to join.', toCustomerWs: true, toCustomerPersist: true, toTelegram: false, pinInTopic: false };
  }
  if (key === 'conversation_reopened') {
    return { enabled: true, text: 'Welcome back — we have reopened your chat and an agent will join shortly.', toCustomerWs: true, toCustomerPersist: true, toTelegram: false, pinInTopic: false };
  }
  if (key === 'unclaimed_reminder_5m') {
    return { enabled: true, text: 'Reminder: Conversation unclaimed. Use Claim button or /claim.', toCustomerWs: false, toCustomerPersist: false, toTelegram: true, pinInTopic: false };
  }
  if (key === 'unclaimed_reminder_15m_pin') {
    return { enabled: true, text: 'Reminder: Still unclaimed. Pinning for visibility.', toCustomerWs: false, toCustomerPersist: false, toTelegram: true, pinInTopic: true };
  }
  if (key === 'closed_history_note') {
    return { enabled: true, text: 'Conversation closed. Start new?', toCustomerWs: true, toCustomerPersist: false, toTelegram: false, pinInTopic: false };
  }
  return { enabled: false, text: '', toCustomerWs: false, toCustomerPersist: false, toTelegram: false, pinInTopic: false };
}

export async function emitServiceMessage(conversationId: string, key: string, extraContext?: EmitContext): Promise<void> {
  const ctxBase = await loadConversationContext(conversationId);
  const ctx = Object.assign({}, ctxBase, extraContext || {});
  // Try locale-specific template first
  let tpl = await getTemplateOrDefault(key, (ctx.locale as string) || 'default');
  if (!tpl.enabled) return;
  const text = render(tpl.text, ctx);
  try { logger.info({ event: 'system_msg_eval', key, flags: { ws: tpl.toCustomerWs, persist: tpl.toCustomerPersist, telegram: tpl.toTelegram, pin: tpl.pinInTopic }, rate: tpl.rateLimitPerConvSec }); } catch {}
  // rate limit
  if (tpl.rateLimitPerConvSec && tpl.rateLimitPerConvSec > 0) {
    const now = Date.now();
    const mapKey = `${conversationId}:${key}`;
    const last = lastSentByKeyConv.get(mapKey) || 0;
    if (now - last < tpl.rateLimitPerConvSec * 1000) {
      return;
    }
    lastSentByKeyConv.set(mapKey, now);
  }
  // Deliveries (with hard guards for certain keys)
  const deliverPersist = key === 'waiting_for_agent' ? false : !!tpl.toCustomerPersist;
  const deliverWs = !!tpl.toCustomerWs;
  const deliverTelegram = !!tpl.toTelegram;

  if (deliverPersist) {
    try {
      const msg = await addMessage(conversationId, 'OUTBOUND', text);
      // echo to clients as outbound to show in transcript
      broadcastToConversation(conversationId, { direction: 'OUTBOUND', text: msg.text, agent: ctx.agentName || 'Support' });
    } catch (e) { try { logger.warn({ err: e }, 'persist_service_message_failed'); } catch {} }
  }
  if (deliverWs) {
    try { broadcastToConversation(conversationId, { type: 'info_note', key, text }); } catch {}
  }
  if (deliverTelegram) {
    try {
      const { message_id } = await sendTopicMessage(conversationId, text);
      if (tpl.pinInTopic && typeof message_id === 'number') {
        try { await pinTopicMessage(message_id); } catch {}
      }
    } catch (e) { try { logger.warn({ err: e }, 'telegram_service_message_failed'); } catch {} }
  }
}

export async function seedDefaultMessageTemplates(): Promise<void> {
  const prisma = getPrisma();
  const defaults = [
    { key: 'welcome_message', text: '', enabled: false, toCustomerWs: true, toCustomerPersist: true, toTelegram: false, pinInTopic: false },
    { key: 'waiting_for_agent', text: 'Thanks for your message — waiting for a support agent to join.', enabled: true, toCustomerWs: true, toCustomerPersist: true, toTelegram: false, pinInTopic: false },
    { key: 'conversation_reopened', text: 'Welcome back — we have reopened your chat and an agent will join shortly.', enabled: true, toCustomerWs: true, toCustomerPersist: true, toTelegram: false, pinInTopic: false },
    { key: 'unclaimed_reminder_5m', text: 'Reminder: Conversation unclaimed. Use Claim button or /claim.', enabled: true, toCustomerWs: false, toCustomerPersist: false, toTelegram: true, pinInTopic: false },
    { key: 'unclaimed_reminder_15m_pin', text: 'Reminder: Still unclaimed. Pinning for visibility.', enabled: true, toCustomerWs: false, toCustomerPersist: false, toTelegram: true, pinInTopic: true },
    { key: 'closed_history_note', text: 'Conversation closed. Start new?', enabled: true, toCustomerWs: true, toCustomerPersist: false, toTelegram: false, pinInTopic: false },
    { key: 'closing_default', text: 'Conversation closed. You can write to reopen.', enabled: true, toCustomerWs: false, toCustomerPersist: false, toTelegram: false, pinInTopic: false },
  ];
  for (const d of defaults) {
    try {
      await (prisma as any).messageTemplate.upsert({ where: { key: d.key }, create: d, update: {} });
    } catch {}
  }
}


