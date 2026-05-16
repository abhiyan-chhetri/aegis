/**
 * Unified search endpoint for the command palette.
 *
 * GET /api/search?q=<query>&limit=<n>
 *
 * Returns matches across projects, findings (library) and reports, ranked by
 * a simple fuzzy score. Returns nothing scary if `q` is empty so the palette
 * can show "recent" placeholder items client-side instead.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

interface ResultItem {
  type: 'project' | 'finding' | 'report' | 'user';
  id: string;
  label: string;
  sub?: string;
  href: string;
  score: number;
  severity?: string;
}

/** Very small fuzzy-ish ranker — token overlap + prefix bonus. */
function score(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (!h.includes(n.split(/\s+/)[0])) {
    // Try per-token AND match
    const toks = n.split(/\s+/);
    if (!toks.every(t => h.includes(t))) return 0;
  }
  let s = 0;
  if (h.startsWith(n)) s += 100;
  if (h.includes(n)) s += 50;
  // token overlap
  const tokens = n.split(/\s+/);
  for (const t of tokens) {
    if (t.length === 0) continue;
    if (h.includes(t)) s += 10;
    if (new RegExp(`\\b${t}`, 'i').test(haystack)) s += 8;
  }
  // shorter haystack = stronger match
  s += Math.max(0, 30 - Math.floor(haystack.length / 12));
  return s;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10), 60);

  if (!q) return NextResponse.json({ results: [] });

  // Pull a modest slice of each entity in parallel and rank in-process.
  const [projects, findings, reports] = await Promise.all([
    db.project.findMany({
      select: { id: true, code: true, name: true, engagement: true, status: true },
      take: 200,
      orderBy: { createdAt: 'desc' },
    }),
    db.finding.findMany({
      select: { id: true, code: true, title: true, severity: true, projectId: true, project: { select: { name: true } } },
      take: 600,
      orderBy: { createdAt: 'desc' },
    }),
    db.report.findMany({
      select: { id: true, code: true, version: true, status: true, project: { select: { id: true, name: true } } },
      take: 100,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const results: ResultItem[] = [];

  for (const p of projects) {
    const hay = `${p.code} ${p.name} ${p.engagement || ''}`;
    const s = score(hay, q);
    if (s > 0) {
      results.push({
        type: 'project',
        id: p.id,
        label: p.name,
        sub: `${p.code}${p.engagement ? ` · ${p.engagement}` : ''}`,
        href: `/projects/${p.id}`,
        score: s + 5, // small bias toward projects (most common click target)
      });
    }
  }

  for (const f of findings) {
    const hay = `${f.code} ${f.title}`;
    const s = score(hay, q);
    if (s > 0) {
      results.push({
        type: 'finding',
        id: f.id,
        label: f.title,
        sub: `${f.code} · ${f.project?.name ?? 'Unknown project'}`,
        href: `/projects/${f.projectId}/findings/${f.id}`,
        severity: f.severity,
        score: s,
      });
    }
  }

  for (const r of reports) {
    const hay = `${r.code} ${r.project?.name || ''} ${r.version}`;
    const s = score(hay, q);
    if (s > 0) {
      results.push({
        type: 'report',
        id: r.id,
        label: `${r.project?.name || 'Report'} — ${r.version}`,
        sub: `${r.code} · ${r.status}`,
        href: r.project?.id ? `/projects/${r.project.id}/report` : '/reports',
        score: s,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return NextResponse.json({ results: results.slice(0, limit) });
}
