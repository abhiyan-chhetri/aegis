/**
 * GET /api/ai/usage → AI spend ledger totals (for the $ indicator).
 *   { totalCost, inputTokens, outputTokens, callCount, thisMonthCost }
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db.$queryRawUnsafe<{ total: number; input: bigint; output: bigint; calls: bigint; month: number }[]>(
    `SELECT COALESCE(SUM(cost),0)::float8 AS total,
            COALESCE(SUM("inputTokens"),0)::bigint AS input,
            COALESCE(SUM("outputTokens"),0)::bigint AS output,
            COUNT(*)::bigint AS calls,
            COALESCE(SUM(cost) FILTER (WHERE "createdAt" >= date_trunc('month', NOW())),0)::float8 AS month
     FROM "AiUsageLog"`,
  ).catch(() => []);

  const r = rows[0];
  return NextResponse.json({
    totalCost: Math.round((r?.total ?? 0) * 100) / 100,
    thisMonthCost: Math.round((r?.month ?? 0) * 100) / 100,
    inputTokens: Number(r?.input ?? 0),
    outputTokens: Number(r?.output ?? 0),
    callCount: Number(r?.calls ?? 0),
  });
}
