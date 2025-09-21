import './config/env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import http from 'http';
import publicRoutes from './api/public';
import { getWsMetrics } from './ws/hub';
import adminRoutes from './api/admin';
import { attachWsServer } from './ws/server';
import { telegramRouter } from './telegram/webhook';
import { startSchedulers } from './services/scheduler';
import path from 'path';
import fs from 'fs';
import { seedDefaultMessageTemplates } from './services/systemMessages';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4010;
const logger = pino({ transport: { target: 'pino-pretty' } });

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(cors({ origin: true, credentials: false }));
app.use(helmet());
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (_req, res) => {
  try {
    const required = ['DATABASE_URL', 'SERVICE_TOKEN', 'BOT_TOKEN', 'SUPPORT_GROUP_ID', 'WEBHOOK_SECRET'];
    const missing = required.filter((k) => !(process.env as any)[k] || String((process.env as any)[k]).trim()==='');
    if (missing.length > 0) {
      return res.status(503).json({ ready: false, missing });
    }
    const { getPrisma } = await import('./db/client');
    const prisma = getPrisma();
    // simple query to validate DB connectivity
    await prisma.$queryRaw`SELECT 1`;
    return res.json({ ready: true });
  } catch {
    return res.status(503).json({ ready: false });
  }
});
// Quiet favicon to avoid 401/404 noise in admin
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});
app.get('/metrics', async (_req, res) => {
  try {
    const { getPrisma } = await import('./db/client');
    const prisma = getPrisma();
    const [open, closed, blocked] = await Promise.all([
      prisma.conversation.count({ where: { status: { in: ['OPEN_UNCLAIMED', 'OPEN_ASSIGNED', 'AWAITING_CUSTOMER'] } } }),
      prisma.conversation.count({ where: { status: 'CLOSED' } }),
      prisma.conversation.count({ where: { status: 'BLOCKED' } }),
    ]);
    const ws = getWsMetrics();
    const tgErrors = (globalThis as any).__telegram_errors__ || 0;
    res.type('text/plain').send(
      `support_open ${open}\n` +
      `support_closed ${closed}\n` +
      `support_blocked ${blocked}\n` +
      `ws_connections ${ws.wsConnections}\n` +
      `ws_outbound_messages ${ws.wsMessagesOutbound}\n` +
      `telegram_errors_total ${tgErrors}\n`
    );
  } catch {
    res.status(500).type('text/plain').send('error');
  }
});
// Serve OpenAPI stub (useful for quick integration checks)
app.get('/docs/openapi.yaml', (_req, res) => {
  res.sendFile(require('path').join(__dirname, 'docs', 'openapi.yaml'));
});
// Serve widget script (minified if available). If a version (?v=...) is provided,
// enable long-lived immutable caching; otherwise use a short TTL.
app.get('/widget.js', (req, res) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.type('application/javascript');
  const version = (req.query && (req.query as any).v) ? String((req.query as any).v) : '';
  if (version) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=300');
  }
  const minPath = path.join(__dirname, 'public', 'widget.min.js');
  const plainPath = path.join(__dirname, 'public', 'widget.js');
  try {
    if (fs.existsSync(minPath)) {
      return res.sendFile(minPath);
    }
  } catch {}
  return res.sendFile(plainPath);
});
// Also expose the minified name explicitly (same cache rules)
app.get('/widget.min.js', (req, res) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.type('application/javascript');
  const version = (req.query && (req.query as any).v) ? String((req.query as any).v) : '';
  if (version) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=300');
  }
  const minPath = path.join(__dirname, 'public', 'widget.min.js');
  const plainPath = path.join(__dirname, 'public', 'widget.js');
  try {
    if (fs.existsSync(minPath)) {
      return res.sendFile(minPath);
    }
  } catch {}
  return res.sendFile(plainPath);
});
// Minimal admin UI (static)
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.use(publicRoutes);
// Mount Telegram webhook BEFORE admin routes to avoid service auth capturing it
app.use(telegramRouter());
app.use(adminRoutes);

// Create HTTP server to allow WS upgrade
const server = http.createServer(app);
attachWsServer(server, '/v1/ws');

// Gracefully accept Telegram webhook even if JSON parsing fails
// to avoid delivery failures during early integration
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    if (req.path.startsWith('/v1/telegram/webhook/')) {
      return res.json({ ok: true });
    }
  }
  return res.status(500).json({ error: 'internal_error' });
});

server.listen(PORT, () => logger.info(`Support Chat API listening on ${PORT}`));
startSchedulers();
seedDefaultMessageTemplates().catch(()=>{});
