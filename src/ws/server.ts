import { WebSocketServer, WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { Server } from 'http';
import pino from 'pino';
import { addMessage } from '../services/conversationService';
import { addClientToConversation, broadcastToConversation, removeClientFromConversation } from './hub';
import { hashIp, verifyConversationToken } from '../services/auth';
import { ensureTopicForConversation, sendAgentMessage, sendCustomerMessage } from '../services/telegramApi';

const logger = pino({ transport: { target: 'pino-pretty' } });

type ParsedUrl = { pathname: string; searchParams: URLSearchParams };

function parseUrl(urlString: string): ParsedUrl {
  const u = new URL(urlString, 'http://localhost');
  return { pathname: u.pathname, searchParams: u.searchParams };
}

function getClientIpForUpgrade(request: any): string {
  // Prefer X-Forwarded-For (may contain a list - take the first non-empty)
  const xff = request.headers?.['x-forwarded-for'] as string | undefined;
  if (xff && typeof xff === 'string') {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  // Fallback to remoteAddress
  return (request.socket?.remoteAddress || '').toString();
}

export function attachWsServer(httpServer: Server, pathPrefix = '/v1/ws') {
  const wss = new WebSocketServer({ noServer: true });

  (httpServer as any).on('upgrade', (request: any, socket: any, head: any) => {
    try {
      const { pathname, searchParams } = parseUrl(request.url || '/');
      if (!pathname.startsWith(pathPrefix)) {
        return;
      }
      const token = searchParams.get('token') || '';
      if (!token) {
        try { logger.warn({ event: 'ws_upgrade_missing_token' }); } catch {}
        socket.destroy();
        return;
      }
      const ip = getClientIpForUpgrade(request);
      const ipHash = hashIp(ip);
      let conversationId: string;
      try {
        conversationId = verifyConversationToken(token, ipHash).conversationId;
      } catch (_e) {
        try { logger.warn({ event: 'ws_upgrade_bad_token' }); } catch {}
        socket.destroy();
        return;
      }
      try { logger.info({ event: 'ws_upgrade_ok', conversationId }); } catch {}
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, conversationId);
      });
    } catch (e) {
      try { logger.warn({ event: 'ws_upgrade_exception', err: e }); } catch {}
      socket.destroy();
      return;
    }
  });

  wss.on('connection', (ws: WebSocket, conversationId: string) => {
    try { logger.info({ event: 'ws_connected', conversationId }); } catch {}
    addClientToConversation(conversationId, ws);

    // Simple per-connection token bucket: allow N messages per T seconds
    const maxPoints = Number(process.env.WS_MSGS_PER_WINDOW || 30);
    const windowMs = Number(process.env.WS_WINDOW_MS || 10000);
    let tokens = maxPoints;
    let lastRefill = Date.now();

    function allowMessage(): boolean {
      const now = Date.now();
      const elapsed = now - lastRefill;
      if (elapsed > windowMs) {
        const buckets = Math.floor(elapsed / windowMs);
        tokens = Math.min(maxPoints, tokens + buckets * maxPoints);
        lastRefill = now - (elapsed % windowMs);
      }
      if (tokens > 0) { tokens -= 1; return true; }
      return false;
    }

    ws.on('message', async (data: RawData) => {
      try {
        // Inbound hardening: size and type
        if (data && (data as any).length && (data as any).length > (Number(process.env.WS_MAX_MSG_BYTES || 4096))) {
          try { ws.send(JSON.stringify({ error: 'too_large' })); } catch {}
          try { ws.close(1009, 'too large'); } catch {}
          return;
        }
        if (typeof (data as any).toString !== 'function') { try { ws.close(1003, 'invalid'); } catch {}; return; }
        if (!allowMessage()) {
          try { ws.send(JSON.stringify({ error: 'rate_limited' })); } catch {}
          try { logger.warn({ event: 'ws_rate_limited', conversationId }); } catch {}
          try { ws.close(1008, 'rate limit'); } catch {}
          return;
        }
        const text = data.toString();
        if (typeof text !== 'string' || text.length === 0) { return; }
        if (text.length > 4000) { try { ws.send(JSON.stringify({ error: 'message_too_long' })); } catch {}; return; }
        await addMessage(conversationId, 'INBOUND', text);
        // Note: addMessage now handles topic creation and welcome message for first message
        try {
          await sendCustomerMessage(conversationId, text);
        } catch {}
        // Echo to all clients in this conversation (customer can have multiple tabs)
        broadcastToConversation(conversationId, { direction: 'INBOUND', text });
        // Telegram bridge will send OUTBOUND via its own path later
      } catch (e) {
        logger.warn({ err: e }, 'failed to handle ws message');
        try { ws.send(JSON.stringify({ error: 'message rejected' })); } catch {}
      }
    });

    ws.on('close', () => {
      removeClientFromConversation(conversationId, ws);
      try { logger.info({ event: 'ws_closed', conversationId }); } catch {}
    });

    try { ws.send(JSON.stringify({ ok: true })); } catch {}
  });

  return wss;
}


