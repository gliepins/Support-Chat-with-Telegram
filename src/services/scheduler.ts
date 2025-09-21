import pino from 'pino';
import { getPrisma } from '../db/client';
import { sendTopicMessage, pinTopicMessage } from './telegramApi';
import { emitServiceMessage } from './systemMessages';

const logger = pino({ transport: { target: 'pino-pretty' } });

export function startSchedulers(): void {
  // Every minute: update reminder/auto-close states
  setInterval(async () => {
    try {
      const prisma = getPrisma();
      const now = new Date();

      // Auto-close windows (defaults to 24h) but configurable via env
      const defaultWindowMs = 24 * 60 * 60 * 1000;
      const cfgMs = Number(process.env.AUTO_CLOSE_WINDOW_MS || defaultWindowMs);
      const twentyFourHoursMs = isFinite(cfgMs) && cfgMs > 0 ? cfgMs : defaultWindowMs;
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
          const five = Number(process.env.UNCLAIMED_REMINDER_1_MS || 5 * 60 * 1000);
          const fifteen = Number(process.env.UNCLAIMED_REMINDER_2_MS || 15 * 60 * 1000);
          if (msSinceCustomer >= five && msSinceCustomer < fifteen) {
            try { await emitServiceMessage(c.id, 'unclaimed_reminder_5m', {}); } catch {}
          } else if (msSinceCustomer >= fifteen && msSinceCustomer < (15 * 60 * 1000 + 60 * 1000)) {
            try { await emitServiceMessage(c.id, 'unclaimed_reminder_15m_pin', {}); } catch {}
          }
        }
      }
    } catch (e) {
      logger.warn({ err: e }, 'scheduler tick failed');
    }
  }, 60 * 1000);

  // Daily retention purge for CLOSED conversations older than RETENTION_DAYS
  const retentionDays = Number(process.env.RETENTION_DAYS || 90);
  const dayMs = 24 * 60 * 60 * 1000;
  setInterval(async () => {
    try {
      const prisma = getPrisma();
      const cutoff = new Date(Date.now() - retentionDays * dayMs);
      const deleted = await prisma.conversation.deleteMany({
        where: { status: 'CLOSED', updatedAt: { lt: cutoff } },
      });
      if (deleted.count > 0) {
        logger.info({ deleted: deleted.count, cutoff }, 'retention purge completed');
      }
    } catch (e) {
      logger.warn({ err: e }, 'retention purge failed');
    }
  }, dayMs);
}


