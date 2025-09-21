import { getPrisma } from '../db/client';

export async function upsertAgent(tgId: bigint, displayName: string) {
  const prisma = getPrisma();
  return prisma.agent.upsert({
    where: { tgId },
    update: { displayName, isActive: true },
    create: { tgId, displayName },
  });
}

export async function listAgents() {
  const prisma = getPrisma();
  const list = await prisma.agent.findMany({ orderBy: { updatedAt: 'desc' } });
  return list.map(a => ({ ...a, tgId: a.tgId.toString() }));
}

export async function disableAgent(tgId: bigint) {
  const prisma = getPrisma();
  return prisma.agent.update({ where: { tgId }, data: { isActive: false } });
}

export async function getAgentNameByTgId(tgId: bigint): Promise<string | null> {
  const prisma = getPrisma();
  const a = await prisma.agent.findUnique({ where: { tgId } });
  return a?.isActive ? a.displayName : null;
}

export async function setAgentClosingMessage(tgId: bigint, message: string) {
  const prisma = getPrisma();
  return prisma.agent.update({ where: { tgId }, data: { closingMessage: message } });
}

export async function enableAgent(tgId: bigint) {
  const prisma = getPrisma();
  return prisma.agent.update({ where: { tgId }, data: { isActive: true } });
}

// Fetch agent closing message with locale fallback: exact -> 2-letter -> default -> legacy field
export async function getClosingMessageForAgentLocale(tgId: bigint, locale?: string): Promise<string | null> {
  const prisma = getPrisma();
  const loc = (locale && locale.trim()) ? locale.trim().toLowerCase() : '';
  const lc2 = loc ? loc.slice(0,2) : '';
  try {
    let row: any = null;
    if (loc) {
      row = await (prisma as any).agentClosingMessage.findFirst({ where: { tgId, locale: loc } });
      if (!row && lc2 && lc2 !== loc) {
        row = await (prisma as any).agentClosingMessage.findFirst({ where: { tgId, locale: lc2 } });
      }
    }
    if (!row) {
      row = await (prisma as any).agentClosingMessage.findFirst({ where: { tgId, locale: 'default' } });
    }
    if (row && row.message) return String(row.message);
  } catch {}
  try {
    const a = await prisma.agent.findUnique({ where: { tgId } });
    return a?.closingMessage || null;
  } catch { return null }
}


