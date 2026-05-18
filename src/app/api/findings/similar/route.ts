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
 * If projectId is supplied we restrict to that project + a small bleed of
 * recent library matches (helps surface "we filed this exact bug last engagement").
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

  const candidates = await db.finding.findMany({
    where: body.excludeId ? { NOT: { id: body.excludeId } } : undefined,
    select: {
      id: true, code: true, title: true, description: true,
      severity: true, status: true, projectId: true, cwe: true,
      project: { select: { id: true, code: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  // Bias toward the current project: matches there get a small boost
  const query = title + ' ' + (body.description || '');
  const scored = similarTo(
    query,
    candidates,
    f => `${f.title} ${f.description || ''}`,
    threshold,
    20,
  ).map(s => ({
    ...s,
    score: s.item.projectId === body.projectId ? Math.min(1, s.score + 0.05) : s.score,
  }));

  scored.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    matches: scored.slice(0, 5).map(s => ({
      id: s.item.id,
      code: s.item.code,
      title: s.item.title,
      severity: s.item.severity,
      status: s.item.status,
      cwe: s.item.cwe,
      project: s.item.project,
      score: Math.round(s.score * 100) / 100,
    })),
  });
}
