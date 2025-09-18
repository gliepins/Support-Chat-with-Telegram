import { PrismaClient } from '@prisma/client';

let prismaClientSingleton: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (prismaClientSingleton) {
    return prismaClientSingleton;
  }
  prismaClientSingleton = new PrismaClient({
    log: ['warn', 'error'],
  });
  return prismaClientSingleton;
}

export type { Prisma } from '@prisma/client';


