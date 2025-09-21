import { Router } from 'express';
import pino from 'pino';
import { hashIp, signConversationToken } from '../services/auth';
import { createConversation, setNickname, listMessagesForConversation, getAssignedAgentName } from '../services/conversationService';
import { getPrisma } from '../db/client';
import { updateTopicTitleFromConversation } from '../services/telegramApi';
import { getTemplateOrDefault } from '../services/systemMessages';
import { requireConversationAuth } from '../middleware/conversationAuth';
import { ipRateLimit, keyRateLimit } from '../middleware/rateLimit';

const router = Router();
const logger = pino({ transport: { target: 'pino-pretty' } });

const START_POINTS = Number(process.env.START_IP_POINTS || 20);
const START_DURATION = Number(process.env.START_IP_DURATION_SEC || 60);
router.post('/v1/conversations/start', ipRateLimit(START_POINTS, START_DURATION), async (req, res) => {
  try {
    const { name, locale } = (req.body || {}) as { name?: string; locale?: string };
    const conversation = await createConversation(name, locale);
    // Store locale if provided
    if (locale && typeof locale === 'string' && locale.trim().length > 0) {
      const norm = locale.trim().toLowerCase().slice(0,2);
      try { const prisma = getPrisma(); await prisma.conversation.update({ where: { id: conversation.id }, data: { locale: norm as any } }); } catch {}
    }
    const ipHash = hashIp((req.ip || '').toString());
    const token = signConversationToken(conversation.id, ipHash);
    try { logger.info({ event: 'conversation_start', conversationId: conversation.id, codename: conversation.codename }); } catch {}
    return res.json({ conversation_id: conversation.id, token, codename: conversation.codename });
  } catch (e: any) {
    try { logger.warn({ event: 'conversation_start_error', err: e }); } catch {}
    return res.status(400).json({ error: e?.message || 'bad request' });
  }
});

router.patch(
  '/v1/conversations/:id/name',
  requireConversationAuth,
  keyRateLimit(10, 24 * 60 * 60, (req) => `rename:${(req as any).conversationId}`),
  async (req, res) => {
  try {
    const { name } = (req.body || {}) as { name?: string };
    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }
    const id = (req.params as any).id as string;
    const updated = await setNickname(id, name);
    try { await updateTopicTitleFromConversation(id); } catch {}
    return res.json({ id: updated.id, customerName: updated.customerName });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'bad request' });
  }
  },
);

// Update conversation locale at runtime (allows SPA language switch)
router.patch('/v1/conversations/:id/locale', requireConversationAuth, async (req, res) => {
  try {
    const { locale } = (req.body || {}) as { locale?: string };
    if (!locale || typeof locale !== 'string' || !locale.trim()) {
      return res.status(400).json({ error: 'locale required' });
    }
    const prisma = getPrisma();
    const norm = locale.trim().toLowerCase().slice(0,2);
    const updated = await prisma.conversation.update({ where: { id: (req.params as any).id }, data: { locale: norm as any } });
    return res.json({ id: updated.id, locale: (updated as any).locale });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'bad request' });
  }
});

export default router;

// Lightweight messages fetch for restoring widget state
router.get('/v1/conversations/:id/messages', async (req, res) => {
  try {
    const id = req.params.id;
    const prisma = getPrisma();
    const convRow = await prisma.conversation.findUnique({ where: { id }, select: { status: true, locale: true } as any });
    const status = String((convRow as any)?.status || '');
    const convLocale = String((convRow as any)?.locale || 'default');
    const msgs = await listMessagesForConversation(id);
    let agent: string | null = null;
    try { agent = await getAssignedAgentName(id); } catch {}
    const enriched = msgs.map((m) => {
      if (m.direction === 'OUTBOUND') {
        return { ...m, agent: agent || 'Support' } as any;
      }
      return m as any;
    });
    let closedNote: string | undefined;
    if (status === 'CLOSED') {
      try {
        const tpl = await getTemplateOrDefault('closed_history_note', convLocale);
        if (tpl.enabled && tpl.toCustomerWs && typeof tpl.text === 'string' && tpl.text.trim().length > 0) {
          closedNote = tpl.text;
        }
      } catch {}
    }
    return res.json({ status: status || 'OPEN_UNCLAIMED', messages: enriched, closed_note: closedNote });
  } catch (e: any) {
    return res.status(400).json({ error: 'bad request' });
  }
});


