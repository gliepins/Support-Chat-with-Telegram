"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireServiceAuth = requireServiceAuth;
function requireServiceAuth(req, res, next) {
    const provided = req.header('x-internal-auth');
    const expected = process.env.SERVICE_TOKEN;
    if (!expected || !provided || provided !== expected) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    return next();
}
//# sourceMappingURL=serviceAuth.js.map