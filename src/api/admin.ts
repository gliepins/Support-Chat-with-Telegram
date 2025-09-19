import { Router } from 'express';
import { requireServiceAuth } from '../middleware/serviceAuth';
import { blockConversation, closeConversation, getConversationWithMessages, listConversations } from '../services/conversationService';
import { getPrisma } from '../db/client';
import { listAgents, upsertAgent, disableAgent, setAgentClosingMessage, enableAgent } from '../services/agentService';
import { Parser } from 'json2csv';
import { deleteTopicByThreadId } from '../services/telegramApi';

const router = Router();

router.use(requireServiceAuth);

router.get('/v1/conversations', async (req, res) => {
  try {
    const status = (req.query.status as string | undefined) || 'all';
    const q = (req.query.q as string | undefined) || '';
    const list = await listConversations(status, q);
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

// Bulk delete conversations (dangerous): by ids array or by filter
router.post('/v1/admin/conversations/bulk-delete', async (req, res) => {
  const prisma = getPrisma();
  const body = (req.body || {}) as { ids?: string[]; status?: string };
  try {
    const toDelete = Array.isArray(body.ids) && body.ids.length > 0
      ? await prisma.conversation.findMany({ where: { id: { in: body.ids } }, select: { id: true, threadId: true } })
      : [];
    let where: any = {};
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      where.id = { in: body.ids };
    } else if (body.status) {
      const s = String(body.status).toLowerCase();
      if (s === 'open') where.status = { in: ['OPEN_UNCLAIMED', 'OPEN_ASSIGNED', 'AWAITING_CUSTOMER'] };
      else if (s === 'closed') where.status = 'CLOSED';
      else if (s === 'blocked') where.status = 'BLOCKED';
      else if (s === 'all') where = {};
    } else {
      return res.status(400).json({ error: 'ids or status required' });
    }
    const result = await prisma.conversation.deleteMany({ where });
    // Best-effort delete forum topics for those with known threadId
    for (const c of toDelete) {
      if (typeof c.threadId === 'number') {
        try { await deleteTopicByThreadId(c.threadId); } catch {}
      }
    }
    return res.json({ deleted: result.count });
  } catch (e) {
    return res.status(500).json({ error: 'internal_error' });
  }
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
router.post('/v1/admin/agents/enable', async (req, res) => {
  const { tgId } = (req.body || {}) as { tgId?: string | number };
  if (!tgId) return res.status(400).json({ error: 'tgId required' });
  const result = await enableAgent(BigInt(tgId));
  return res.json({ tgId: result.tgId.toString(), isActive: result.isActive });
});
router.post('/v1/admin/agents/closing-message', async (req, res) => {
  const { tgId, message } = (req.body || {}) as { tgId?: string | number; message?: string };
  if (!tgId || typeof message !== 'string') return res.status(400).json({ error: 'tgId and message required' });
  const result = await setAgentClosingMessage(BigInt(tgId), message);
  return res.json({ tgId: result.tgId.toString(), closingMessage: result.closingMessage || null });
});

// Global settings: welcome message
router.get('/v1/admin/settings', async (_req, res) => {
  const prisma = (await import('../db/client')).getPrisma() as any;
  const rows = await prisma.$queryRaw`SELECT value FROM "Setting" WHERE key = 'welcome_message' LIMIT 1` as Array<{ value: string }>;
  return res.json({ welcome_message: rows && rows[0] ? rows[0].value : '' });
});
router.post('/v1/admin/settings', async (req, res) => {
  const { welcome_message } = (req.body || {}) as { welcome_message?: string };
  if (typeof welcome_message !== 'string') return res.status(400).json({ error: 'welcome_message required' });
  const prisma = (await import('../db/client')).getPrisma() as any;
  await prisma.$executeRaw`INSERT INTO "Setting" (key, value) VALUES ('welcome_message', ${welcome_message}) ON CONFLICT (key) DO UPDATE SET value = ${welcome_message}`;
  return res.json({ ok: true });
});

export default router;


