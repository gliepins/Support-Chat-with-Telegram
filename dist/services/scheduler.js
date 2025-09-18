"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSchedulers = startSchedulers;
const pino_1 = __importDefault(require("pino"));
const client_1 = require("../db/client");
const telegramApi_1 = require("./telegramApi");
const logger = (0, pino_1.default)({ transport: { target: 'pino-pretty' } });
function startSchedulers() {
    // Every minute: update reminder/auto-close states
    setInterval(async () => {
        try {
            const prisma = (0, client_1.getPrisma)();
            const now = new Date();
            // Auto-close: closed if 24h since last agent reply with no customer reply
            const twentyFourHoursMs = 5 * 60 * 1000; // auto-close after 5 minutes for testing
            const conversations = await prisma.conversation.findMany({});
            for (const c of conversations) {
                const msSinceAgent = now.getTime() - new Date(c.lastAgentAt).getTime();
                const msSinceCustomer = now.getTime() - new Date(c.lastCustomerAt).getTime();
                if (c.status !== 'CLOSED') {
                    // If agent never replied yet, skip auto-close here (handled by reminders elsewhere)
                    if (msSinceAgent > twentyFourHoursMs && msSinceCustomer > twentyFourHoursMs) {
                        // nothing recent; skip
                    }
                }
                // Simple auto-close rules
                if (c.status === 'OPEN_ASSIGNED' && msSinceCustomer > twentyFourHoursMs) {
                    await prisma.conversation.update({ where: { id: c.id }, data: { status: 'CLOSED' } });
                    logger.info({ id: c.id }, 'auto-closed awaiting customer');
                }
                if ((c.status === 'OPEN_UNCLAIMED' || c.status === 'OPEN_ASSIGNED') && msSinceAgent > twentyFourHoursMs && msSinceCustomer > twentyFourHoursMs) {
                    await prisma.conversation.update({ where: { id: c.id }, data: { status: 'CLOSED' } });
                    logger.info({ id: c.id }, 'auto-closed idle');
                }
                // Unclaimed reminders: only when OPEN_UNCLAIMED and no agent response yet
                if (c.status === 'OPEN_UNCLAIMED') {
                    const five = 5 * 60 * 1000, fifteen = 15 * 60 * 1000;
                    if (msSinceCustomer >= five && msSinceCustomer < fifteen) {
                        try {
                            await (0, telegramApi_1.sendTopicMessage)(c.id, 'Reminder: Conversation unclaimed. Use Claim button or /claim.');
                        }
                        catch { }
                    }
                    else if (msSinceCustomer >= fifteen && msSinceCustomer < (15 * 60 * 1000 + 60 * 1000)) {
                        try {
                            const { message_id } = await (0, telegramApi_1.sendTopicMessage)(c.id, 'Reminder: Still unclaimed. Pinning for visibility.');
                            await (0, telegramApi_1.pinTopicMessage)(message_id);
                        }
                        catch { }
                    }
                }
            }
        }
        catch (e) {
            logger.warn({ err: e }, 'scheduler tick failed');
        }
    }, 60 * 1000);
    // Daily retention purge for CLOSED conversations older than RETENTION_DAYS
    const retentionDays = Number(process.env.RETENTION_DAYS || 90);
    const dayMs = 24 * 60 * 60 * 1000;
    setInterval(async () => {
        try {
            const prisma = (0, client_1.getPrisma)();
            const cutoff = new Date(Date.now() - retentionDays * dayMs);
            const deleted = await prisma.conversation.deleteMany({
                where: { status: 'CLOSED', updatedAt: { lt: cutoff } },
            });
            if (deleted.count > 0) {
                logger.info({ deleted: deleted.count, cutoff }, 'retention purge completed');
            }
        }
        catch (e) {
            logger.warn({ err: e }, 'retention purge failed');
        }
    }, dayMs);
}
//# sourceMappingURL=scheduler.js.map