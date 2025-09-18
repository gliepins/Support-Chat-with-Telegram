import { Request, Response, NextFunction } from 'express';
import { hashIp, verifyConversationToken } from '../services/auth';

export function requireConversationAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
  if (!token) {
    return res.status(401).json({ error: 'missing token' });
  }
  const ip = (req.ip || '').toString();
  const ipHash = hashIp(ip);
  try {
    const { conversationId } = verifyConversationToken(token, ipHash);
    if (req.params.id && req.params.id !== conversationId) {
      return res.status(403).json({ error: 'conversation mismatch' });
    }
    (req as any).conversationId = conversationId;
    return next();
  } catch (_e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}


