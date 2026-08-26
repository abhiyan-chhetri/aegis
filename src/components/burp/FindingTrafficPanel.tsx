'use client';

/**
 * FindingTrafficPanel — "Finding ↔ traffic auto-link": shows captured pairs
 * that match this finding (token overlap with title/description/assets) with
 * one-click linking. Also lists already-linked traffic.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';

interface Match {
  endpoint: { id: string; method: string; host: string; path: string; hitCount: number };
  score: number;
  matched: string[];
  trafficId: string;
  url: string;
  statusCode: number;
  tool: string;
  createdAt: string;
}

export function FindingTrafficPanel({ projectId, findingId }: { projectId: string; findingId: string }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [linked, setLinked] = useState<Array<{ id: string; url: string; statusCode: number; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [mRes, tRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/burp/finding-matches?findingId=${findingId}`),
        fetch(`/api/projects/${projectId}/burp/traffic?findingId=${findingId}&pageSize=20`),
      ]);
      const m = await mRes.json();
      if (mRes.ok) setMatches(m.matches || []);
      const t = await tRes.json();
      if (tRes.ok) setLinked((t.traffic || []).map((r: { id: string; url: string; statusCode: number; createdAt: string }) => ({ id: r.id, url: r.url, statusCode: r.statusCode, createdAt: r.createdAt })));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [projectId, findingId]);
  useEffect(() => { load(); }, [load]);

  const link = async (trafficId: string) => {
    const res = await fetch(`/api/projects/${projectId}/burp/traffic/${trafficId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ findingId }),
    });
    if (res.ok) {
      toast.success('Traffic linked to this finding');
      load();
    } else {
      toast.error('Couldn\'t link');
    }
  };

  const unlink = async (trafficId: string) => {
    const res = await fetch(`/api/projects/${projectId}/burp/traffic/${trafficId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ findingId: null }),
    });
    if (res.ok) { toast.success('Unlinked'); load(); }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 28px' }}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ico name="link" size={13} style={{ color: '#5B9BD5' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-0)', flex: 1 }}>
            Burp Bridge traffic {linked.length > 0 && <span className="mono" style={{ color: 'var(--status-resolved)', fontSize: 10.5 }}>· {linked.length} linked</span>}
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>suggested by captured traffic</span>
        </div>

        {linked.length > 0 && (
          <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--line-1)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {linked.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                <span className="mono" style={{ color: 'var(--status-resolved)' }}>🔗</span>
                <span className="mono" style={{ color: 'var(--ink-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.url}</span>
                <span className="mono" style={{ color: l.statusCode >= 400 ? 'var(--sev-high)' : 'var(--ink-2)' }}>{l.statusCode}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => unlink(l.id)} style={{ fontSize: 10 }}>Unlink</button>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 16, fontSize: 11.5, color: 'var(--ink-3)' }}>Matching captured traffic…</div>
        ) : matches.length === 0 ? (
          <div style={{ padding: 16, fontSize: 11.5, color: 'var(--ink-3)' }}>
            No matching traffic found yet — capture some Burp traffic for this finding's endpoints.
          </div>
        ) : (
          <div style={{ padding: '6px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {matches.map(m => (
              <div key={m.trafficId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 11.5 }}>
                <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, color: m.endpoint.method === 'GET' ? '#5B9BD5' : '#4CAF7D', width: 44 }}>{m.endpoint.method}</span>
                <span className="mono" style={{ color: 'var(--ink-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.url}</span>
                <span className="mono" style={{ color: m.statusCode >= 400 ? 'var(--sev-high)' : 'var(--ink-2)' }}>{m.statusCode}</span>
                <span style={{ fontSize: 9.5, color: 'var(--ink-4)' }}>{Math.round(m.score)}%</span>
                <button className="btn btn-sm" onClick={() => link(m.trafficId)} style={{ fontSize: 10, gap: 3 }}>
                  <Ico name="link" size={10} /> Link
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
