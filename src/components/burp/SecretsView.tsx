'use client';

/**
 * SecretsView — every secret found across captured traffic, deduped, with the
 * first-seen endpoint. Two scanners feed it:
 *  - REGEX scanner (runs on ingest, every asset, esp. JS)
 *  - AI deep-read (backend auto-queues JS bundles and extracts secrets,
 *    endpoints, internal URLs and credentials — "Run AI scan" flushes the queue)
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';

interface SecretRow {
  type: string;
  value: string;
  context: string;
  url: string;
  method: string;
  host: string;
  path: string;
  createdAt: string;
  occurrences: number;
  severity: 'high' | 'info';
  source: string;
  confidence: string | null;
}

interface AnalysisJob {
  id: string;
  kind: string;
  status: string;
  error: string;
  trafficUrl: string;
  trafficMethod: string;
  result: { secrets?: unknown[]; endpoints?: string[]; internalUrls?: string[]; credentials?: unknown[]; notes?: string };
  createdAt: string;
}

export function SecretsView({ projectId }: { projectId: string }) {
  const [secrets, setSecrets] = useState<SecretRow[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const [jobs, setJobs] = useState<AnalysisJob[]>([]);
  const [pendingJobs, setPendingJobs] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [showDeep, setShowDeep] = useState(false);

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams();
      if (typeFilter) sp.set('type', typeFilter);
      const [secRes, jobRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/burp/secrets?${sp}`),
        fetch(`/api/projects/${projectId}/burp/analysis`),
      ]);
      const sec = await secRes.json();
      if (secRes.ok) {
        setSecrets(sec.secrets || []);
        setTypes(sec.types || []);
        setTotal(sec.total || 0);
      }
      const jobsD = await jobRes.json();
      if (jobRes.ok) {
        setJobs(jobsD.jobs || []);
        setPendingJobs(Number(jobsD.counts?.pending) || 0);
      }
    } catch {
      toast.error('Couldn\'t load secrets');
    }
  }, [projectId, typeFilter]);
  useEffect(() => { load(); }, [load]);

  const runAiScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/analysis/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Scan failed');
      if (d.skippedNoAI > 0) {
        toast.error('AI not configured', { description: 'Configure an AI provider in Settings → AI, then scan again.' });
      } else {
        toast.success(`AI scan done — ${d.processed} asset${d.processed === 1 ? '' : 's'} analysed, ${d.aiSecrets} new secret${d.aiSecrets === 1 ? '' : 's'} found`);
      }
      load();
    } catch (e) {
      toast.error('AI scan failed', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setScanning(false);
    }
  };

  const copyValue = (v: string) => {
    navigator.clipboard.writeText(v).then(() => toast.success('Copied'));
  };

  const createFinding = async (s: SecretRow) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/findings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Hardcoded ${s.type} in client-side code`,
          severity: s.severity === 'high' ? 'high' : 'medium',
          summary: `A ${s.type} was found in captured traffic (${s.host}${s.path}).`,
          description: `## Exposure\n\nA **${s.type}** was detected in traffic to \`${s.method} ${s.host}${s.path}\`.\n\n- Value (masked): \`${s.value}\`\n- Context: \`${s.context || 'n/a'}\`\n- Found at: ${s.url}\n\nIf this key/token is valid it may allow unauthorized access to the associated service. Verify and rotate immediately.`,
          reproduction: `1. Capture traffic to \`${s.url}\` (e.g. load the page / JS bundle).\n2. Observe the ${s.type} in the response.\n3. Attempt to use it against the associated service to confirm validity.`,
          assets: [s.host],
          cwe: 'CWE-798', cvss: 0, cvssVector: '', cvssLocked: false,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Create failed');
      toast.success('Finding draft created', { description: d.finding?.code || 'new finding' });
      window.open(`/projects/${projectId}/findings/${d.finding?.id || d.id}`, '_blank');
    } catch (e) {
      toast.error('Couldn\'t create finding', { description: e instanceof Error ? e.message : 'network error' });
    }
  };

  const deepJobs = jobs.filter(j => j.status === 'done');
  const deepFindings = deepJobs.flatMap(j =>
    (j.result?.endpoints || []).map(ep => ({ ep, url: j.trafficUrl }))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: 190, fontSize: 12 }}>
          <option value="">All secret types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
          {total} unique secret{total === 1 ? '' : 's'}
        </span>
        {pendingJobs > 0 && (
          <span style={{ fontSize: 10.5, color: '#5B9BD5', background: 'rgba(91,155,213,.1)', border: '1px solid rgba(91,155,213,.3)', borderRadius: 100, padding: '2px 8px' }}>
            {pendingJobs} JS bundle{pendingJobs === 1 ? '' : 's'} queued for AI
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => setShowDeep(v => !v)} style={{ gap: 4, fontSize: 11 }}>
          <Ico name={showDeep ? 'chevDown' : 'chevRight'} size={12} />
          AI deep-reads ({deepJobs.length})
        </button>
        <button className="btn btn-sm" onClick={runAiScan} disabled={scanning || pendingJobs === 0} style={{ gap: 4, fontSize: 11 }} title="Run the AI over queued JS bundles now">
          <Ico name="sparkles" size={12} style={{ color: '#9b7fd4' }} />
          {scanning ? 'Scanning…' : 'Run AI scan'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={load} style={{ gap: 4, fontSize: 11 }}>
          <Ico name="history" size={12} /> Refresh
        </button>
      </div>

      {/* AI deep-read results */}
      {showDeep && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-1)', fontSize: 11.5, color: 'var(--ink-2)' }}>
            Backend AI analysis of captured JS bundles — every bundle is auto-queued when it arrives.
          </div>
          {deepJobs.length === 0 && (
            <div style={{ padding: 16, fontSize: 11.5, color: 'var(--ink-3)' }}>No completed AI deep-reads yet{pendingJobs > 0 ? ' — run the scan or wait for the lazy processor.' : ' — capture some JS assets first.'}</div>
          )}
          {deepJobs.map(j => (
            <div key={j.id} style={{ padding: '8px 14px', borderBottom: '1px solid var(--line-1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span className="mono" style={{ color: 'var(--ink-3)' }}>{j.trafficMethod}</span>
                <span className="mono" style={{ color: 'var(--ink-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.trafficUrl}</span>
                <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--status-resolved)' }}>DONE</span>
              </div>
              {j.result?.endpoints && j.result.endpoints.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.06em', color: '#5B9BD5' }}>
                    {j.result.endpoints.length} endpoints revealed:
                  </span>{' '}
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-2)', wordBreak: 'break-all' }}>
                    {j.result.endpoints.slice(0, 12).join('  ·  ')}
                  </span>
                </div>
              )}
              {j.result?.internalUrls && j.result.internalUrls.length > 0 && (
                <div style={{ marginTop: 2 }}>
                  <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--sev-high)' }}>
                    internal:
                  </span>{' '}
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--sev-high)', wordBreak: 'break-all' }}>
                    {j.result.internalUrls.slice(0, 8).join('  ·  ')}
                  </span>
                </div>
              )}
              {j.result?.credentials && (j.result.credentials as Array<{ type: string; value: string; context: string }>).length > 0 && (
                <div style={{ marginTop: 2 }}>
                  <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--sev-critical)' }}>
                    credentials:
                  </span>{' '}
                  {(j.result.credentials as Array<{ type: string; value: string; context: string }>).slice(0, 5).map((c, i) => (
                    <code key={i} className="mono" style={{ fontSize: 10.5, color: 'var(--sev-critical)', background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{c.value}</code>
                  ))}
                </div>
              )}
              {j.result?.notes && <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--ink-3)' }}>{j.result.notes}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        {secrets.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5 }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>🔑</div>
            No secrets detected yet. JS assets are scanned by regex on ingest and auto-queued for an AI deep-read.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 150 }}>Type</th>
                <th>Value (masked)</th>
                <th style={{ width: 90 }}>Seen</th>
                <th>First found at</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {secrets.map((s, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 10, fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 3,
                        background: s.severity === 'high' ? 'rgba(255,92,58,.1)' : 'rgba(232,179,57,.1)',
                        color: s.severity === 'high' ? 'var(--sev-critical)' : '#e8b339',
                        border: `1px solid ${s.severity === 'high' ? 'rgba(255,92,58,.3)' : 'rgba(232,179,57,.3)'}`,
                      }}>{s.type}</span>
                      {s.source === 'ai' && (
                        <span style={{ fontSize: 8.5, fontFamily: 'var(--font-mono)', color: '#9b7fd4', background: 'rgba(155,127,212,.12)', padding: '0 4px', borderRadius: 3 }} title="Found by the AI deep-read">AI {s.confidence || ''}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <code className="mono" style={{ fontSize: 11, color: 'var(--ink-0)', background: 'var(--bg-2)', padding: '2px 6px', borderRadius: 4 }}>{s.value}</code>
                      <button className="btn btn-ghost btn-sm" onClick={() => copyValue(s.value)} title="Copy masked value" style={{ width: 22, padding: 0 }}>
                        <Ico name="copy" size={11} />
                      </button>
                    </div>
                    {s.context && <div style={{ fontSize: 9.5, color: 'var(--ink-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>…{s.context}…</div>}
                  </td>
                  <td><span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>{s.occurrences}</span></td>
                  <td>
                    <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{s.method} </span>{s.host}{s.path}
                    </div>
                    <div style={{ fontSize: 9.5, color: 'var(--ink-4)' }}>{new Date(s.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(s.url); toast.success('Endpoint URL copied'); }} title="Copy endpoint URL" style={{ width: 22, padding: 0 }}>
                        <Ico name="link" size={11} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => createFinding(s)} title="Create a hardcoded-credential finding draft" style={{ width: 22, padding: 0 }}>
                        <Ico name="sparkles" size={11} style={{ color: '#9b7fd4' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {deepFindings.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--ink-4)' }}>
          {deepFindings.length} additional endpoint{deepFindings.length === 1 ? '' : 's'} surfaced by the AI across {deepJobs.length} analysed bundle{deepJobs.length === 1 ? '' : 's'}.
        </div>
      )}
    </div>
  );
}
