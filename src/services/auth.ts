import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pino from 'pino';

const logger = pino({ transport: { target: 'pino-pretty' } });

function getJwtSecret(): string {
  const secret = process.env.CONVERSATION_JWT_SECRET || process.env.SERVICE_TOKEN;
  if (!secret) {
    logger.error('Missing CONVERSATION_JWT_SECRET or SERVICE_TOKEN. Cannot sign/verify conversation tokens.');
    throw new Error('Missing token secret');
  }
  if (!process.env.CONVERSATION_JWT_SECRET) {
    logger.warn('Using SERVICE_TOKEN as JWT secret. Set CONVERSATION_JWT_SECRET for better isolation.');
  }
  return secret;
}

export function hashIp(ipAddress: string): string {
  return crypto.createHash('sha256').update(ipAddress).digest('hex');
}

export function signConversationToken(conversationId: string, ipHash: string, ttlSeconds = 60 * 60): string {
  const secret = getJwtSecret();
  const unbind = String(process.env.UNBIND_JWT_FROM_IP || '').toLowerCase() === 'true';
  const payload: any = { sub: conversationId };
  if (!unbind) payload.ip = ipHash;
  return jwt.sign(payload, secret, { expiresIn: ttlSeconds });
}

export function verifyConversationToken(token: string, ipHash: string): { conversationId: string } {
  const secret = getJwtSecret();
  const payload = jwt.verify(token, secret) as any;
  if (!payload || typeof payload.sub !== 'string') {
    throw new Error('Invalid token payload');
  }
  const unbind = String(process.env.UNBIND_JWT_FROM_IP || '').toLowerCase() === 'true';
  if (!unbind) {
    // If bound, optionally compare ip in future; currently not enforced to avoid false negatives behind NAT
  }
  return { conversationId: payload.sub };
}


