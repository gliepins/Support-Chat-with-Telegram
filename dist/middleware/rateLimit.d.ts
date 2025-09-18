import { Request, Response, NextFunction } from 'express';
export declare function ipRateLimit(points: number, durationSeconds: number): (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare function keyRateLimit(points: number, durationSeconds: number, getKey: (req: Request) => string): (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=rateLimit.d.ts.map