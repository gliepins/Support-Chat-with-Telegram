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


