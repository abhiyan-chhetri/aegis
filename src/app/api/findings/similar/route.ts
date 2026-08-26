/**
 * POST /api/findings/similar
 *
 * Returns existing findings that look similar to the supplied draft, so the
 * editor can warn before creating an obvious duplicate. Uses trigram-dice
 * similarity rather than an embedding service — small corpus, no network.
 *
 * Body:
 *   { title: string, description?: string, projectId?: string,
 *     excludeId?: string, threshold?: number }
 *
 * If projectId is supplied we:
 *   • restrict matches to that project plus a small bleed of recent library
 *     matches (helps surface "we filed this exact bug last engagement"), and
 *   • look up the project's target code so findings from OTHER engagements of
 *     the same client are included and boosted — the response marks them as
 *     `recurring` with the engagement year, so the editor can say
 *     "this matches F-007 from the 2025 engagement".
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { similarTo } from '@/lib/similarity';

interface Body {
  title: string;
  description?: string;
  projectId?: string;
  excludeId?: string;
  threshold?: number;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const title = (body.title || '').trim();
  if (title.length < 4) return NextResponse.json({ matches: [] });
  const threshold = typeof body.threshold === 'number' ? body.threshold : 0.55;

  // The current project's target code — used to surface recurring findings
  // from previous engagements of the same client.
  let targetCode = '';
  if (body.projectId) {
    const rows = await db.$queryRawUnsafe<{ targetCode: string | null }[]>(
      `SELECT COALESCE("targetCode", '') AS "targetCode" FROM "Project" WHERE id = $1`,
      body.projectId,
    ).catch(() => [] as never[]);
    targetCode = rows[0]?.targetCode ?? '';
  }

  const where: Record<string, unknown> = body.excludeId ? { NOT: { id: body.excludeId } } : {};

  // Same-client findings (siblings via targetCode) get added explicitly even
  // if they fell outside the 500 most-recent window — recurrence matters.
  let siblingIds: string[] = [];
  if (targetCode) {
    const siblingRows = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT f.id FROM "Finding" f
       JOIN "Project" p ON p.id = f."projectId"
       WHERE p."targetCode" = $1 AND ($2::text IS NULL OR f."projectId" <> $2::text)
       ORDER BY f."createdAt" DESC`,
      targetCode, body.projectId ?? null,
    ).catch(() => [] as never[]);
    siblingIds = siblingRows.map(r => r.id);
  }

  const candidates = await db.finding.findMany({
    where,
    select: {
      id: true, code: true, title: true, description: true,
      severity: true, status: true, projectId: true, cwe: true,
      project: { select: { id: true, code: true, name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  // Fetch engagement year per project id (for the recurring badge).
  const projectIds = Array.from(new Set(candidates.map(c => c.projectId)));
  const yearRows = projectIds.length > 0
    ? await db.$queryRawUnsafe<{ id: string; year: string }[]>(
        `SELECT id, COALESCE("engagementYear", '') AS year FROM "Project" WHERE id = ANY($1::text[])`,
        projectIds,
      ).catch(() => [] as never[])
    : [];
  const yearById: Record<string, string> = {};
  for (const r of yearRows) yearById[r.id] = r.year;

  // Boost: current project + same-client siblings.
  // Score twice — title-only (the strongest recurrence signal; identical
  // titles recur year after year even when descriptions are rewritten) and
  // title+description — and take the higher for each candidate.
  const titleScored = similarTo(title, candidates, f => f.title, threshold, 25);
  const combinedScored = similarTo(
    title + ' ' + (body.description || ''),
    candidates,
    f => `${f.title} ${f.description || ''}`,
    threshold,
    25,
  );
  const byId = new Map<string, number>();
  for (const s of titleScored) byId.set(s.item.id, s.score);
  for (const s of combinedScored) byId.set(s.item.id, Math.max(byId.get(s.item.id) ?? 0, s.score));

  const scored = Array.from(byId.entries()).map(([id, score]) => {
    const item = candidates.find(c => c.id === id)!;
    const isCurrent = item.projectId === body.projectId;
    const isSibling = targetCode ? siblingIds.includes(item.id) : false;
    let final = score;
    if (isCurrent) final = Math.min(1, final + 0.05);
    if (isSibling) final = Math.min(1, final + 0.08);
    return { item, score: final };
  });

  scored.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    matches: scored.slice(0, 6).map(s => ({
      id: s.item.id,
      code: s.item.code,
      title: s.item.title,
      severity: s.item.severity,
      status: s.item.status,
      cwe: s.item.cwe,
      project: s.item.project,
      engagementYear: yearById[s.item.projectId] || '',
      recurring: !!targetCode && s.item.projectId !== body.projectId && siblingIds.includes(s.item.id),
      score: Math.round(s.score * 100) / 100,
    })),
  });
}
