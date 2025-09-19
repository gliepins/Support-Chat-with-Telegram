import { Router } from 'express';
import { requireServiceAuth } from '../middleware/serviceAuth';
import { blockConversation, closeConversation, getConversationWithMessages, listConversations } from '../services/conversationService';
import { listAgents, upsertAgent, disableAgent } from '../services/agentService';
import { Parser } from 'json2csv';

const router = Router();

router.use(requireServiceAuth);

router.get('/v1/conversations', async (req, res) => {
  try {
    const status = (req.query.status as string | undefined) || 'all';
    const list = await listConversations(status);
    return res.json(list);
  } catch (e: any) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

router.get('/v1/conversations/:id', async (req, res) => {
  const conv = await getConversationWithMessages(req.params.id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  return res.json(conv);
});

router.get('/v1/conversations/:id/export.json', async (req, res) => {
  const conv = await getConversationWithMessages(req.params.id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  return res.json({
    id: conv.id,
    codename: conv.codename,
    customerName: conv.customerName,
    status: conv.status,
    messages: conv.messages,
  });
});

router.get('/v1/conversations/:id/export.csv', async (req, res) => {
  const conv = await getConversationWithMessages(req.params.id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const rows = conv.messages.map(m => ({
    createdAt: m.createdAt,
    direction: m.direction,
    text: m.text.replace(/\n/g, ' '),
  }));
  const parser = new Parser({ fields: ['createdAt', 'direction', 'text'] });
  const csv = parser.parse(rows);
  res.header('Content-Type', 'text/csv');
  res.attachment(`conversation_${conv.id}.csv`);
  return res.send(csv);
});

router.post('/v1/moderation/close', async (req, res) => {
  const { id } = (req.body || {}) as { id?: string };
  if (!id) return res.status(400).json({ error: 'id required' });
  const conv = await closeConversation(id, 'system');
  return res.json(conv);
});

router.post('/v1/moderation/block', async (req, res) => {
  const { id } = (req.body || {}) as { id?: string };
  if (!id) return res.status(400).json({ error: 'id required' });
  const conv = await blockConversation(id, 'system');
  return res.json(conv);
});

// Agents admin
router.get('/v1/admin/agents', async (_req, res) => {
  const agents = await listAgents();
  return res.json(agents);
});

router.post('/v1/admin/agents/upsert', async (req, res) => {
  const { tgId, displayName } = (req.body || {}) as { tgId?: string | number; displayName?: string };
  if (!tgId || !displayName) return res.status(400).json({ error: 'tgId and displayName required' });
  const result = await upsertAgent(BigInt(tgId), displayName.trim());
  return res.json({ tgId: result.tgId.toString(), displayName: result.displayName, isActive: result.isActive });
});

router.post('/v1/admin/agents/disable', async (req, res) => {
  const { tgId } = (req.body || {}) as { tgId?: string | number };
  if (!tgId) return res.status(400).json({ error: 'tgId required' });
  const result = await disableAgent(BigInt(tgId));
  return res.json({ tgId: result.tgId.toString(), isActive: result.isActive });
});

export default router;


