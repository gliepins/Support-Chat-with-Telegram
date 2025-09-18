import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';

export function ipRateLimit(points: number, durationSeconds: number) {
  const limiter = new RateLimiterMemory({ points, duration: durationSeconds });
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = (req.ip || 'unknown').toString();
    try {
      await limiter.consume(key);
      return next();
    } catch {
      return res.status(429).json({ error: 'rate_limited' });
    }
  };
}

export function keyRateLimit(points: number, durationSeconds: number, getKey: (req: Request) => string) {
  const limiter = new RateLimiterMemory({ points, duration: durationSeconds });
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = getKey(req);
    try {
      await limiter.consume(key);
      return next();
    } catch {
      return res.status(429).json({ error: 'rate_limited' });
    }
  };
}


