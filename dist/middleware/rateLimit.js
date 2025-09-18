"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipRateLimit = ipRateLimit;
exports.keyRateLimit = keyRateLimit;
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
function ipRateLimit(points, durationSeconds) {
    const limiter = new rate_limiter_flexible_1.RateLimiterMemory({ points, duration: durationSeconds });
    return async (req, res, next) => {
        const key = (req.ip || 'unknown').toString();
        try {
            await limiter.consume(key);
            return next();
        }
        catch {
            return res.status(429).json({ error: 'rate_limited' });
        }
    };
}
function keyRateLimit(points, durationSeconds, getKey) {
    const limiter = new rate_limiter_flexible_1.RateLimiterMemory({ points, duration: durationSeconds });
    return async (req, res, next) => {
        const key = getKey(req);
        try {
            await limiter.consume(key);
            return next();
        }
        catch {
            return res.status(429).json({ error: 'rate_limited' });
        }
    };
}
//# sourceMappingURL=rateLimit.js.map