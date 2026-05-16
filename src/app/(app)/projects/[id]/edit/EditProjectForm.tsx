'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';

type ScopeRow = { asset: string; type: string; notes: string };

type Project = {
  id: string;
  code: string;
  name: string;
  engagement: string;
  scope: string;
  members: string;
  status: string;
  startDate: string;
  endDate: string;
  leadId: string;
  lead: { id: string; name: string };
  targetCode?: string;
  engagementYear?: string;
  dataClassification?: 'C1' | 'C2' | 'C3' | 'C4';
  criticality?: 'diamond' | 'silver' | 'bronze' | 'other';
};

type User = { id: string; name: string; email: string; role: string; team: string };

type Props = { project: Project; users: User[] };

const DEFAULT_ENGAGEMENT_TYPES = [
  'Web Application', 'Network', 'Mobile', 'Cloud', 'Red Team',
  'Social Engineering', 'Physical', 'API', 'Internal',
];

function parseScopeRows(raw: string): ScopeRow[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item: unknown) => {
        if (typeof item === 'string') return { asset: item, type: '', notes: '' };
        const o = item as Record<string, string>;
        return { asset: o.asset || '', type: o.type || '', notes: o.notes || '' };
      });
    }
  } catch { /* ignore */ }
  return [];
}

export function EditProjectForm({ project, users }: Props) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code);
  const [engagement, setEngagement] = useState(project.engagement);
  const [scopeRows, setScopeRows] = useState<ScopeRow[]>(() => parseScopeRows(project.scope));
  const [status, setStatus] = useState(project.status);
  const [startDate, setStartDate] = useState(project.startDate);
  const [endDate, setEndDate] = useState(project.endDate);
  const [leadId, setLeadId] = useState(project.leadId);
  const [teamMembers, setTeamMembers] = useState<string[]>(() => {
    try { return JSON.parse(project.members || '[]'); } catch { return []; }
  });
  const [targetCode, setTargetCode] = useState(project.targetCode || '');
  const [engagementYear, setEngagementYear] = useState(project.engagementYear || '');
  // v2.0 / environmental adjustment
  const [dataClassification, setDataClassification] = useState<'C1'|'C2'|'C3'|'C4'>(
    (project.dataClassification as 'C1'|'C2'|'C3'|'C4') || 'C3'
  );
  const [criticality, setCriticality] = useState<'diamond'|'silver'|'bronze'|'other'>(
    (project.criticality as 'diamond'|'silver'|'bronze'|'other') || 'silver'
  );
  // Tracks whether either env field has changed from the original — used to
  // decide whether to ask the server to re-score existing findings.
  const initialEnv = useRef({
    dataClassification: (project.dataClassification as 'C1'|'C2'|'C3'|'C4') || 'C3',
    criticality: (project.criticality as 'diamond'|'silver'|'bronze'|'other') || 'silver',
  });
  const envChanged = dataClassification !== initialEnv.current.dataClassification ||
                     criticality !== initialEnv.current.criticality;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [engagementTypes, setEngagementTypes] = useState<string[]>(DEFAULT_ENGAGEMENT_TYPES);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      const raw = d.settings?.engagementTypes;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setEngagementTypes(parsed);
        } catch { /* use defaults */ }
      }
    }).catch(() => {});
  }, []);

  function addScopeRow() {
    setScopeRows(r => [...r, { asset: '', type: '', notes: '' }]);
  }

  function updateScopeRow(i: number, field: keyof ScopeRow, value: string) {
    setScopeRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row));
  }

  function removeScopeRow(i: number) {
    setScopeRows(r => r.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Project name is required'); return; }
    if (!code.trim()) { setError('Project code is required'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim(),
          engagement: engagement.trim(),
          scope: JSON.stringify(scopeRows.filter(r => r.asset.trim())),
          status,
          startDate,
          endDate,
          leadId,
          members: teamMembers,
          targetCode: targetCode.trim(),
          engagementYear: engagementYear.trim(),
          dataClassification,
          criticality,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to update project');
        toast.error('Project update failed', { description: d.error || `HTTP ${res.status}` });
        return;
      }
      setSaved(true);
      toast.success('Project updated');

      // If data classification or criticality changed, re-score every finding
      // in this project using the new environmental matrix.
      if (envChanged) {
        try {
          const rescoreRes = await fetch(`/api/projects/${project.id}/rescore`, { method: 'POST' });
          if (rescoreRes.ok) {
            const data = await rescoreRes.json() as {
              rescored: number;
              total: number;
              skipped: { noVector: number; noChange: number };
            };
            const n = Number(data.rescored ?? 0);
            const skipped = data.skipped ?? { noVector: 0, noChange: 0 };
            if (n > 0) {
              toast.success(`Re-scored ${n} of ${data.total} finding${data.total === 1 ? '' : 's'}`, {
                description: `CVSS adjusted to match the new asset environment.${
                  skipped.noVector > 0
                    ? ` ${skipped.noVector} finding${skipped.noVector === 1 ? '' : 's'} had no CVSS vector and weren't touched.`
                    : ''}`,
                duration: 6000,
              });
            } else if (skipped.noVector > 0 && skipped.noChange === 0) {
              toast.warn('No findings re-scored', {
                description: `None of the ${skipped.noVector} finding${skipped.noVector === 1 ? '' : 's'} in this project has a CVSS vector set yet.`,
              });
            } else if (skipped.noChange > 0 && n === 0) {
              toast.info('Environment changed — no scores moved', {
                description: 'Existing CVSS vectors don\'t intersect with the new matrix (no C/I/A letters needed adjustment).',
              });
            }
          } else {
            toast.error('Re-score failed', { description: `HTTP ${rescoreRes.status}` });
          }
        } catch { /* the project save succeeded — don't block redirect */ }
      }

      setTimeout(() => router.push(`/projects/${project.id}`), 500);
    } catch {
      setError('Network error');
      toast.error('Network error', { description: 'Project update did not reach the server' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Project Details */}
      <div className="card" style={{ padding: 'var(--card-pad)' }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Project Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Name <span style={{ color: 'var(--sev-critical)' }}>*</span></label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Project name" style={{ width: '100%' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Code <span style={{ color: 'var(--sev-critical)' }}>*</span></label>
              <input className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. ACME-Q1-2024" style={{ width: '100%' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Engagement Type</label>
            <select className="input" value={engagement} onChange={e => setEngagement(e.target.value)} style={{ width: '100%' }}>
              <option value="">Select engagement type…</option>
              {/* Include current value even if not in the loaded list */}
              {engagement && !engagementTypes.includes(engagement) && (
                <option value={engagement}>{engagement}</option>
              )}
              {engagementTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Environmental: data classification + asset criticality */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Data Classification</label>
              <select
                className="input"
                value={dataClassification}
                onChange={e => setDataClassification(e.target.value as 'C1'|'C2'|'C3'|'C4')}
                style={{ width: '100%' }}
              >
                <option value="C1">C1 — Public</option>
                <option value="C2">C2 — Internal</option>
                <option value="C3">C3 — Confidential</option>
                <option value="C4">C4 — Restricted</option>
              </select>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>
                {dataClassification === 'C1' && 'Public data — high-confidentiality impact rolls down to low.'}
                {dataClassification === 'C2' && 'Internal-only — limited contractual sensitivity.'}
                {dataClassification === 'C3' && 'Confidential — customer / contractual data (default).'}
                {dataClassification === 'C4' && 'Restricted — regulated data. Low confidentiality impact escalates.'}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Asset Criticality</label>
              <select
                className="input"
                value={criticality}
                onChange={e => setCriticality(e.target.value as 'diamond'|'silver'|'bronze'|'other')}
                style={{ width: '100%' }}
              >
                <option value="diamond">Diamond — Tier-0 critical</option>
                <option value="silver">Silver — Business-critical</option>
                <option value="bronze">Bronze — Standard</option>
                <option value="other">Other — Low impact / sandbox</option>
              </select>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>
                {criticality === 'diamond' && 'Mission-critical. Even low integrity/availability impact is serious.'}
                {criticality === 'silver' && 'Important. Outage hurts but is recoverable.'}
                {criticality === 'bronze' && 'Standard system. High impact rolls down to low.'}
                {criticality === 'other' && 'Sandbox / test. Minimal real-world consequence.'}
              </div>
            </div>
          </div>
          {envChanged && (
            <div style={{
              fontSize: 11.5, color: 'var(--ink-2)',
              padding: '10px 12px', background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
              borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--accent)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Ico name="info" size={13} style={{ color: 'var(--accent)' }} />
              <span>
                Environment changed. When you save, every existing finding in this project will be
                automatically re-scored against the new data classification / criticality matrix.
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="form-group">
              <label className="form-label">End Date</label>
              <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="input" value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%' }}>
                <option value="scheduled">Scheduled</option>
                <option value="in-progress">In Progress</option>
                <option value="in-review">In Review</option>
                <option value="waiting-client">Waiting on Client</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Engagement Tracking */}
      <div className="card" style={{ padding: 'var(--card-pad)' }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Engagement Tracking</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 14 }}>
          Group yearly re-engagements for the same target using a shared Target Code.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Target Code</label>
            <input
              className="input"
              value={targetCode}
              onChange={e => setTargetCode(e.target.value.toUpperCase())}
              placeholder="e.g. WEBAPP-CORP"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
            />
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
              Shared across all engagements for this target
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Engagement Year</label>
            <input
              className="input"
              value={engagementYear}
              onChange={e => setEngagementYear(e.target.value)}
              placeholder={String(new Date().getFullYear())}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
            />
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
              e.g. 2025 or "Q1 2025"
            </div>
          </div>
        </div>
      </div>

      {/* In-Scope Assets */}
      <div className="card" style={{ padding: 'var(--card-pad)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div className="eyebrow">In-Scope Assets</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>Listed in the Scope &amp; Methodology section of the report</div>
          </div>
          <button type="button" className="btn btn-sm" onClick={addScopeRow}>
            <Ico name="plus" size={12} /> Add Asset
          </button>
        </div>

        {scopeRows.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, background: 'var(--bg-0)', border: '1px dashed var(--line-2)', borderRadius: 'var(--r-sm)' }}>
            No assets yet. Click &ldquo;Add Asset&rdquo; to add scope.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 2fr auto', gap: 0, background: 'var(--bg-2)', borderBottom: '1px solid var(--line-1)', padding: '6px 12px' }}>
              {['Asset / URL', 'Type', 'Notes', ''].map((h, i) => (
                <div key={i} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-3)' }}>{h}</div>
              ))}
            </div>
            {scopeRows.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 2fr auto', gap: 0, borderBottom: i < scopeRows.length - 1 ? '1px solid var(--line-1)' : 'none', alignItems: 'center' }}>
                <input
                  className="input"
                  value={row.asset}
                  onChange={e => updateScopeRow(i, 'asset', e.target.value)}
                  placeholder="api.example.com"
                  style={{ border: 'none', borderRadius: 0, borderRight: '1px solid var(--line-1)', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
                <input
                  className="input"
                  value={row.type}
                  onChange={e => updateScopeRow(i, 'type', e.target.value)}
                  placeholder="REST API"
                  style={{ border: 'none', borderRadius: 0, borderRight: '1px solid var(--line-1)', fontSize: 12 }}
                />
                <input
                  className="input"
                  value={row.notes}
                  onChange={e => updateScopeRow(i, 'notes', e.target.value)}
                  placeholder="Notes..."
                  style={{ border: 'none', borderRadius: 0, borderRight: '1px solid var(--line-1)', fontSize: 12 }}
                />
                <button
                  type="button"
                  onClick={() => removeScopeRow(i)}
                  style={{ width: 36, height: '100%', border: 'none', background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ico name="x" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team */}
      <div className="card" style={{ padding: 'var(--card-pad)' }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Team</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Project Lead</label>
            <select className="input" value={leadId} onChange={e => setLeadId(e.target.value)} style={{ width: '100%' }}>
              <option value="">Select lead...</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Team Members</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {users.map(u => (
                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '7px 10px', borderRadius: 'var(--r-sm)', background: 'var(--bg-2)' }}>
                  <input
                    type="checkbox"
                    checked={teamMembers.includes(u.id)}
                    onChange={e => setTeamMembers(p => e.target.checked ? [...p, u.id] : p.filter(id => id !== u.id))}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)' }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{u.role} · {u.team}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--sev-critical-bg)', border: '1px solid rgba(255,92,58,0.25)', borderRadius: 'var(--r-sm)', color: 'var(--sev-critical)', fontSize: 13 }}>
          <Ico name="alert" size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={submitting} className="btn btn-primary" style={{ flex: 1 }}>
          <Ico name="save" size={14} />
          {submitting ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
        </button>
        <Link href={`/projects/${project.id}`} className="btn btn-ghost" style={{ flex: 1, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Ico name="chevLeft" size={14} />
          Cancel
        </Link>
      </div>
    </form>
  );
}
