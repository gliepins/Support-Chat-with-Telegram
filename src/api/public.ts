import { Router } from 'express';
import { hashIp, signConversationToken } from '../services/auth';
import { createConversation, setNickname, listMessagesForConversation, getAssignedAgentName } from '../services/conversationService';
import { updateTopicTitleFromConversation } from '../services/telegramApi';
import { requireConversationAuth } from '../middleware/conversationAuth';
import { ipRateLimit, keyRateLimit } from '../middleware/rateLimit';

const router = Router();

router.post('/v1/conversations/start', ipRateLimit(20, 60), async (req, res) => {
  try {
    const { name } = (req.body || {}) as { name?: string };
    const conversation = await createConversation(name);
    const ipHash = hashIp((req.ip || '').toString());
    const token = signConversationToken(conversation.id, ipHash);
    return res.json({ conversation_id: conversation.id, token, codename: conversation.codename });
  } catch (e: any) {
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

export default router;

// Lightweight messages fetch for restoring widget state
router.get('/v1/conversations/:id/messages', async (req, res) => {
  try {
    const id = req.params.id;
    const msgs = await listMessagesForConversation(id);
    let agent: string | null = null;
    try { agent = await getAssignedAgentName(id); } catch {}
    const enriched = msgs.map((m) => {
      if (m.direction === 'OUTBOUND') {
        return { ...m, agent: agent || 'Support' } as any;
      }
      return m as any;
    });
    return res.json(enriched);
  } catch (e: any) {
    return res.status(400).json({ error: 'bad request' });
  }
});


