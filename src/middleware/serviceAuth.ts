import { Request, Response, NextFunction } from 'express';

export function requireServiceAuth(req: Request, res: Response, next: NextFunction) {
  const provided = req.header('x-internal-auth');
  const expected = process.env.SERVICE_TOKEN;
  if (!expected || !provided || provided !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
}


