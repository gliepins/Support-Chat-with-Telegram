import { Router } from 'express';
import pino from 'pino';
import { handleTelegramUpdate } from './bot';
import { answerCallback, closeTopic, sendAgentMessage, updateTopicTitleFromConversation } from '../services/telegramApi';
import { broadcastToConversation } from '../ws/hub';
import { getPrisma } from '../db/client';
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
              try { broadcastToConversation(conversationId, { type: 'agent_joined' }); } catch {}
            }
          } else if (action === 'close') {
            const tgId: number | undefined = cb.from?.id;
            await closeConversation(conversationId, `telegram:${tgId ?? 'unknown'}`);
            try { await closeTopic(conversationId); } catch {}
            try { await sendAgentMessage(conversationId, `Closed by @${cb.from?.username ?? tgId}`); } catch {}
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


