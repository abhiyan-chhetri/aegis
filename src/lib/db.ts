import { PrismaClient } from '@/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

function createPrismaClient() {
  const rawUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  const url = rawUrl.startsWith('file:') ? rawUrl : `file:${rawUrl}`;
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: any };
const prismaInstance = globalForPrisma.prisma ?? createPrismaClient();

// Type assertion to include new models that are in database but not yet in generated client
export const db = prismaInstance as PrismaClient & {
  auditLog: any;
  reportVersion: any;
  findingComment: any;
  projectSnapshot: any;
};

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
