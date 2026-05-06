'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Ico } from '@/components/chrome/icons';

type User = { id: string; name: string; role: string; team: string; email: string };

const DEFAULT_ENGAGEMENT_TYPES = [
  'Web Application', 'Network', 'Mobile', 'Cloud', 'Red Team',
  'Social Engineering', 'Physical', 'API', 'Internal',
];

function generateCode(name: string): string {
  const clean = name.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, '-');
  const abbr = clean
    .split('-')
    .map(w => w.slice(0, 3))
    .join('-')
    .slice(0, 8);
  const year = new Date().getFullYear().toString().slice(-2);
  const rand = Math.floor(Math.random() * 900 + 100);
  return abbr ? `${abbr}-${year}${rand}` : `PROJ-${year}${rand}`;
}

type Props = { users: User[] };

export function NewProjectForm({ users }: Props) {
  const router = useRouter();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeManual, setCodeManual] = useState(false);
  const [engagement, setEngagement] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leadId, setLeadId] = useState(users[0]?.id || '');
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!codeManual && name) {
      setCode(generateCode(name));
    }
  }, [name, codeManual]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Project name is required.'); return; }
    if (!code.trim()) { setError('Project code is required.'); return; }
    if (!engagement) { setError('Engagement type is required.'); return; }
    if (!startDate) { setError('Start date is required.'); return; }
    if (!endDate) { setError('End date is required.'); return; }
    if (!leadId) { setError('Please select a lead.'); return; }
    if (endDate <= startDate) { setError('End date must be after start date.'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code, engagement, startDate, endDate, leadId, members: teamMembers }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const created = await res.json();
      router.push(`/projects/${created.project?.id ?? created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 680, width: '100%' }}>
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--sev-critical-bg)', border: '1px solid rgba(255,92,58,0.25)',
          borderRadius: 'var(--r-md)', padding: '12px 16px', marginBottom: 24,
          color: 'var(--sev-critical)', fontSize: 13,
        }}>
          <Ico name="alert" size={14} />
          {error}
        </div>
      )}

      {/* Name + Code row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, marginBottom: 20 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="proj-name">Project Name *</label>
          <input
            id="proj-name"
            className="input"
            type="text"
            placeholder="e.g. Acme Corp External Assessment"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            style={{ fontSize: 14, height: 38 }}
          />
        </div>
        <div className="form-group" style={{ minWidth: 160 }}>
          <label className="form-label" htmlFor="proj-code">Code *</label>
          <div style={{ position: 'relative' }}>
            <input
              id="proj-code"
              className="input"
              type="text"
              placeholder="ACME-2601"
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setCodeManual(true); }}
              required
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, height: 38, width: '100%' }}
            />
            {!codeManual && (
              <div style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-4)', textTransform: 'uppercase',
                letterSpacing: '0.06em', pointerEvents: 'none',
              }}>
                auto
              </div>
            )}
          </div>
          {codeManual && (
            <button
              type="button"
              onClick={() => { setCodeManual(false); setCode(generateCode(name)); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--ink-3)', textDecoration: 'underline', padding: 0, fontFamily: 'var(--font-mono)' }}
            >
              reset to auto
            </button>
          )}
        </div>
      </div>

      {/* Engagement type */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label" htmlFor="proj-engagement">Engagement Type *</label>
        <select
          id="proj-engagement"
          className="input"
          value={engagement}
          onChange={e => setEngagement(e.target.value)}
          required
          style={{ height: 38, fontSize: 13 }}
        >
          <option value="">Select engagement type…</option>
          {engagementTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="proj-start">Start Date *</label>
          <input
            id="proj-start"
            className="input"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            required
            style={{ height: 38, fontSize: 13, colorScheme: 'dark' }}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="proj-end">End Date *</label>
          <input
            id="proj-end"
            className="input"
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            required
            min={startDate || undefined}
            style={{ height: 38, fontSize: 13, colorScheme: 'dark' }}
          />
        </div>
      </div>

      {/* Lead */}
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label" htmlFor="proj-lead">Lead *</label>
        <select
          id="proj-lead"
          className="input"
          value={leadId}
          onChange={e => setLeadId(e.target.value)}
          required
          style={{ height: 38, fontSize: 13 }}
        >
          <option value="">Select lead…</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name} — {u.role}</option>
          ))}
        </select>
      </div>

      {/* Team Members */}
      <div className="form-group" style={{ marginBottom: 32 }}>
        <label className="form-label">Team Members</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {users.map(u => (
            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '7px 10px', borderRadius: 'var(--r-sm)', background: 'var(--bg-2)', border: '1px solid var(--line-1)' }}>
              <input
                type="checkbox"
                checked={teamMembers.includes(u.id)}
                onChange={e => setTeamMembers(p => e.target.checked ? [...p, u.id] : p.filter(id => id !== u.id))}
                style={{ accentColor: 'var(--accent)' }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)' }}>{u.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{u.role} · {u.team}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving}
          style={{ minWidth: 140, height: 38 }}
        >
          {saving ? (
            <>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ animation: 'spin 0.8s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Creating…
            </>
          ) : (
            <>
              <Ico name="plus" size={14} />
              Create project
            </>
          )}
        </button>
        <a href="/projects" className="btn btn-ghost" style={{ height: 38 }}>
          Cancel
        </a>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </form>
  );
}
