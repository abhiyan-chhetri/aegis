/**
 * Insights — CWE & OWASP frequency map.
 *
 * Workspace-wide aggregate: which vulnerability classes does the team find
 * the most? Surfaces systemic root causes worth talking about with clients
 * during scoping ("you scan 5 web apps a year and every one has IDORs —
 * let's plan a code review of the authorization layer").
 */
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { Topbar } from '@/components/chrome/Topbar';
import { InsightsClient } from './InsightsClient';

interface Row { key: string; count: number; critical: number; high: number; medium: number; low: number; info: number; }

export default async function InsightsPage() {
  await connection();
  const session = await getSession();
  if (!session) redirect('/login');

  // Pull cwe + owasp + severity counts in one trip; aggregate in JS so we
  // can render two separate views from the same raw data.
  const findings = await db.finding.findMany({
    select: { cwe: true, owasp: true, severity: true },
  });

  function aggregate(field: 'cwe' | 'owasp'): Row[] {
    const acc = new Map<string, Row>();
    for (const f of findings) {
      const k = (f[field] || '').trim();
      if (!k) continue;
      if (!acc.has(k)) acc.set(k, { key: k, count: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 });
      const r = acc.get(k)!;
      r.count++;
      const sev = f.severity as 'critical' | 'high' | 'medium' | 'low' | 'info';
      if (sev === 'critical' || sev === 'high' || sev === 'medium' || sev === 'low' || sev === 'info') {
        r[sev]++;
      }
    }
    return Array.from(acc.values()).sort((a, b) => b.count - a.count);
  }

  const cweRows = aggregate('cwe');
  const owaspRows = aggregate('owasp');
  const totalFindings = findings.length;
  const taggedCwe = findings.filter(f => f.cwe).length;
  const taggedOwasp = findings.filter(f => f.owasp).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        title="Insights"
        breadcrumb={['Workspace', 'Insights']}
        subtitle="What vulnerability classes are showing up across every engagement?"
      />
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        <InsightsClient
          cwe={cweRows}
          owasp={owaspRows}
          totalFindings={totalFindings}
          taggedCwe={taggedCwe}
          taggedOwasp={taggedOwasp}
        />
      </div>
    </div>
  );
}
