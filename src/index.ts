import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import http from 'http';
import publicRoutes from './api/public';
import adminRoutes from './api/admin';
import { attachWsServer } from './ws/server';
import { telegramRouter } from './telegram/webhook';
import { startSchedulers } from './services/scheduler';
import path from 'path';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4010;
const logger = pino({ transport: { target: 'pino-pretty' } });

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(cors({ origin: true, credentials: false }));
app.use(helmet());
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/metrics', async (_req, res) => {
  try {
    const { getPrisma } = await import('./db/client');
    const prisma = getPrisma();
    const [open, closed, blocked] = await Promise.all([
      prisma.conversation.count({ where: { status: { in: ['OPEN_UNCLAIMED', 'OPEN_ASSIGNED', 'AWAITING_CUSTOMER'] } } }),
      prisma.conversation.count({ where: { status: 'CLOSED' } }),
      prisma.conversation.count({ where: { status: 'BLOCKED' } }),
    ]);
    res.type('text/plain').send(
      `support_open ${open}\n` +
      `support_closed ${closed}\n` +
      `support_blocked ${blocked}\n`
    );
  } catch {
    res.status(500).type('text/plain').send('error');
  }
});
// Serve OpenAPI stub (useful for quick integration checks)
app.get('/docs/openapi.yaml', (_req, res) => {
  res.sendFile(require('path').join(__dirname, 'docs', 'openapi.yaml'));
});
// Serve widget script
app.get('/widget.js', (_req, res) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'widget.js'));
});
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
