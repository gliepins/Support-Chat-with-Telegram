import { Router } from 'express';
import pino from 'pino';
import { handleTelegramUpdate } from './bot';
import { answerCallback, closeTopic, sendAgentMessage, updateTopicTitleFromConversation, sendGroupMessage } from '../services/telegramApi';
import { broadcastToConversation } from '../ws/hub';
import { getPrisma } from '../db/client';
import { getAgentNameByTgId } from '../services/agentService';
import { closeConversation, recordAudit } from '../services/conversationService';

const logger = pino({ transport: { target: 'pino-pretty' } });

// Minimal skeleton: verify secret in path and optional header; log updates for now

export function telegramRouter(): Router {
  const router = Router();
  const secretPath = process.env.WEBHOOK_SECRET || 'secret-not-set';

  router.post(`/v1/telegram/webhook/${secretPath}`, async (req, res) => {
    const configuredHeaderSecret = process.env.TELEGRAM_HEADER_SECRET;
    if (configuredHeaderSecret) {
      const provided = req.header('x-telegram-bot-api-secret-token');
      if (provided !== configuredHeaderSecret) {
        logger.warn({ hasHeader: Boolean(provided) }, 'telegram header secret mismatch');
        return res.status(401).json({ ok: false });
      }
    }
    const update = req.body as any;
    logger.info({ update }, 'telegram update');

    // Fallback: intercept /help at webhook level to avoid forwarding to customer
    try {
      const msg = update && update.message;
      const text: string | undefined = msg && (msg.text || msg.caption);
      if (text && typeof text === 'string' && /^\/help\b/i.test(text.trim())) {
        const threadId: number | undefined = msg.message_thread_id as number | undefined;
        const help = [
          'Commands:',
          '/claim — assign conversation to yourself',
          '/close — close the conversation',
          '/note <text> — set private note',
          '/codename <text> — set codename',
          '/myname or /whoami — your agent display name',
          '/myid — your Telegram id',
        ].join('\n');
        if (threadId) {
          try {
            const prisma = getPrisma();
            const conv = await prisma.conversation.findFirst({ where: { threadId } });
            if (conv) { await sendAgentMessage(conv.id, help); }
          } catch {}
        } else {
          try { await sendGroupMessage(help); } catch {}
        }
        return res.json({ ok: true });
      }
    } catch {}

    // Handle inline button callbacks
    if (update && update.callback_query) {
      try {
        const cb = update.callback_query;
        const data: string = cb.data || '';
        await answerCallback(cb.id, 'OK');
        const [action, conversationId] = data.split(':');
        if (conversationId) {
          const prisma = getPrisma();
          if (action === 'claim') {
            const tgId: number | undefined = cb.from?.id;
            if (tgId) {
              await prisma.conversation.update({ where: { id: conversationId }, data: { status: 'OPEN_ASSIGNED', assignedAgentTgId: BigInt(tgId) } });
              await recordAudit(conversationId, `telegram:${tgId}`, 'claim', { via: 'button' });
              try { await updateTopicTitleFromConversation(conversationId); } catch {}
              try { await sendAgentMessage(conversationId, `Claimed by @${cb.from?.username ?? tgId}`); } catch {}
              // Announce agent joining with display name if available
              try {
                const tgIdStr = cb.from?.id ? String(cb.from.id) : '';
                let label = null;
                if (tgIdStr) {
                  try { label = await getAgentNameByTgId(BigInt(tgIdStr)); } catch {}
                }
                broadcastToConversation(conversationId, { type: 'agent_joined', agent: label || 'Support' });
              } catch {}
            }
          } else if (action === 'close') {
            const tgId: number | undefined = cb.from?.id;
            await closeConversation(conversationId, `telegram:${tgId ?? 'unknown'}`, { suppressCustomerNote: true });
            try {
              const { emitServiceMessage } = await import('../services/systemMessages');
              await emitServiceMessage(conversationId, 'closing_message', {});
              try { broadcastToConversation(conversationId, { type: 'conversation_closed' }); } catch {}
              try { await closeTopic(conversationId); } catch {}
            } catch {}
          }
        }
      } catch (e) {
        logger.warn({ err: e }, 'failed to handle callback');
      }
      return res.json({ ok: true });
    }

    // Handle regular messages
    try { void handleTelegramUpdate(update as any); } catch {}
    return res.json({ ok: true });
  });
  return router;
}


