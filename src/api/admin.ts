import { Router } from 'express';
import pino from 'pino';
import { requireServiceAuth } from '../middleware/serviceAuth';
import { blockConversation, closeConversation, getConversationWithMessages, listConversations, getAssignedAgentName } from '../services/conversationService';
import { getPrisma } from '../db/client';
import { listAgents, upsertAgent, disableAgent, setAgentClosingMessage, enableAgent } from '../services/agentService';
import { Parser } from 'json2csv';
import { deleteTopicByThreadId } from '../services/telegramApi';
import { signConversationToken, verifyConversationToken, hashIp } from '../services/auth';
import { createConversation } from '../services/conversationService';

const router = Router();
const logger = pino({ transport: { target: 'pino-pretty' } });

router.use(requireServiceAuth);

router.get('/v1/conversations', async (req, res) => {
  try {
    const status = (req.query.status as string | undefined) || 'all';
    const q = (req.query.q as string | undefined) || '';
    const list = await listConversations(status, q);
    // Enrich with assigned agent display name via bulk lookup for reliability
    const ids = Array.from(new Set(list.map((c: any) => c.assignedAgentTgId).filter((v: any) => !!v))) as Array<string>;
    if (ids.length === 0) {
      return res.json(list);
    }
    const prisma = getPrisma();
    const tgIdBigs = ids.map((s) => {
      try { return BigInt(String(s)); } catch { return null as any }
    }).filter(Boolean) as Array<bigint>;
    const agents = await prisma.agent.findMany({ where: { tgId: { in: tgIdBigs } } });
    const idToName = new Map<string, string>();
    for (const a of agents) {
      if (a.isActive) idToName.set(a.tgId.toString(), a.displayName);
    }
    const enriched = list.map((c: any) => ({
      ...c,
      assignedAgentName: (c.assignedAgentTgId && idToName.get(String(c.assignedAgentTgId))) || null,
    }));
    return res.json(enriched);
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
  const prisma = getPrisma();
  const conv = await closeConversation(id, 'system', { suppressCustomerNote: true });
  try {
    // Post closing message like Telegram /close
    const updated = await prisma.conversation.findUnique({ where: { id } });
    const agent = updated?.assignedAgentTgId ? await prisma.agent.findUnique({ where: { tgId: updated.assignedAgentTgId } }) : null;
    const closing = agent && agent.isActive && agent.closingMessage ? agent.closingMessage : 'Conversation closed. You can write to reopen.';
    try {
      const { addMessage, getAssignedAgentName } = await import('../services/conversationService');
      const msg = await addMessage(id, 'OUTBOUND', closing);
      let label: string | null = null; try { label = await getAssignedAgentName(id); } catch {}
      const { broadcastToConversation } = await import('../ws/hub');
      broadcastToConversation(id, { direction: 'OUTBOUND', text: msg.text, agent: label || 'Support' });
      try { broadcastToConversation(id, { type: 'conversation_closed' }); } catch {}
      const { sendAgentMessage, closeTopic } = await import('../services/telegramApi');
      try { await sendAgentMessage(id, closing); } catch {}
      try { await closeTopic(id); } catch {}
    } catch {}
  } catch {}
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
  const prisma = (await import('../db/client')).getPrisma();
  try {
    const row = await (prisma as any).setting.findUnique({ where: { key: 'welcome_message' } });
    return res.json({ welcome_message: row?.value || '' });
  } catch (e) {
    logger.warn({ err: e }, 'settings_get_error');
    return res.status(500).json({ error: 'internal_error' });
  }
});
router.post('/v1/admin/settings', async (req, res) => {
  const { welcome_message } = (req.body || {}) as { welcome_message?: string };
  if (typeof welcome_message !== 'string') return res.status(400).json({ error: 'welcome_message required' });
  const prisma = (await import('../db/client')).getPrisma();
  try {
    await (prisma as any).setting.upsert({
      where: { key: 'welcome_message' },
      create: { key: 'welcome_message', value: welcome_message },
      update: { value: welcome_message },
    });
    return res.json({ ok: true });
  } catch (e) {
    logger.warn({ err: e }, 'settings_post_error');
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Deep health check: start → topic → welcome → WS token
router.get('/v1/admin/health/deep', async (_req, res) => {
  const prisma = getPrisma();
  const report: any = { startOk: false, topicOk: false, welcomeOk: false, wsTokenOk: false, errors: [] as string[] };
  let convId: string | null = null;
  let threadId: number | null = null;
  try {
    const conv = await createConversation('Healthcheck');
    convId = conv.id;
    report.startOk = true;
    logger.info({ event: 'health_start_ok', conversationId: convId });
  } catch (e: any) {
    report.errors.push(`start: ${e?.message || 'error'}`);
  }
  try {
    if (convId) {
      const fresh = await prisma.conversation.findUnique({ where: { id: convId } });
      threadId = (fresh?.threadId ?? null) as any;
      report.topicOk = typeof threadId === 'number';
      if (!report.topicOk) report.errors.push('topic: missing threadId');
    }
  } catch (e: any) {
    report.errors.push(`topic: ${e?.message || 'error'}`);
  }
  try {
    if (convId) {
      const rows = await prisma.$queryRaw`SELECT value FROM "Setting" WHERE key = 'welcome_message' LIMIT 1` as Array<{ value: string }>;
      const welcome = (rows && rows[0] && rows[0].value ? rows[0].value : '').trim();
      if (!welcome) {
        report.welcomeOk = true; // no welcome configured is not an error
      } else {
        const msgs = await prisma.message.findMany({ where: { conversationId: convId, direction: 'OUTBOUND', text: welcome } });
        report.welcomeOk = msgs.length > 0;
        if (!report.welcomeOk) report.errors.push('welcome: message not found');
      }
    }
  } catch (e: any) {
    report.errors.push(`welcome: ${e?.message || 'error'}`);
  }
  try {
    if (convId) {
      const ipHash = hashIp('127.0.0.1');
      const token = signConversationToken(convId, ipHash, 60);
      const parsed = verifyConversationToken(token, ipHash);
      report.wsTokenOk = parsed.conversationId === convId;
      if (!report.wsTokenOk) report.errors.push('ws: token verify mismatch');
    }
  } catch (e: any) {
    report.errors.push(`ws: ${e?.message || 'error'}`);
  }
  // Cleanup best effort
  try {
    if (convId) {
      try { await prisma.message.deleteMany({ where: { conversationId: convId } }); } catch {}
      try { await prisma.auditLog.deleteMany({ where: { conversationId: convId } }); } catch {}
      try { await prisma.conversation.delete({ where: { id: convId } }); } catch {}
    }
    if (threadId) { try { await deleteTopicByThreadId(threadId); } catch {} }
  } catch {}
  const ok = report.startOk && report.topicOk && report.welcomeOk && report.wsTokenOk;
  report.ok = ok;
  logger.info({ event: 'health_deep', ok, report });
  return res.json(report);
});

export default router;


