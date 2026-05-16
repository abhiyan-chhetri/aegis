/**
 * Sort an already-loaded list of findings by the `sortOrder` column in the
 * database. Returns a new array, doesn't mutate.
 *
 * Why this exists: `sortOrder` was added to the schema via an idempotent
 * SQL migration (instrumentation hook + fixdb.sh) AND via prisma/schema.prisma,
 * but every developer / deployed instance needs to re-run `prisma generate`
 * after pulling the new schema. Doing the sort in TypeScript via a tiny raw
 * query means the feature works even before `prisma generate` has been run,
 * so existing deployments don't 500 on the project page after a `git pull`.
 *
 * After everyone has regenerated their Prisma client this helper is still
 * fine — it's a single trivial query.
 */
import { db } from './db';

interface HasIdAndProject {
  id: string;
  projectId?: string;
}

/** In-place stable sort by sortOrder ASC, fallback to original order. */
export async function sortFindingsBySortOrder<T extends HasIdAndProject>(
  findings: T[],
  projectId?: string,
): Promise<T[]> {
  if (findings.length === 0) return findings;
  const pid = projectId ?? findings[0]?.projectId;
  if (!pid) return findings;

  let rows: { id: string; sortOrder: number }[] = [];
  try {
    rows = await db.$queryRawUnsafe<{ id: string; sortOrder: number }[]>(
      `SELECT id, "sortOrder" FROM "Finding" WHERE "projectId" = $1`,
      pid,
    );
  } catch {
    // sortOrder column missing — fall back to current order without crashing
    return findings;
  }

  const order = new Map<string, number>();
  for (const r of rows) order.set(r.id, r.sortOrder);

  return [...findings].sort((a, b) => {
    const ao = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bo = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ao - bo;
  });
}
