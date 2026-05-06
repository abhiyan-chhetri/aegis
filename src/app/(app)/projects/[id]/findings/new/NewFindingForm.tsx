'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ico } from '@/components/chrome/icons';

type Props = { projectId: string };

export function NewFindingForm({ projectId }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [cwe, setCwe] = useState('');
  const [owasp, setOwasp] = useState('');
  const [assets, setAssets] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/findings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          severity,
          summary: summary.trim(),
          description: description.trim(),
          cwe: cwe.trim(),
          owasp: owasp.trim(),
          assets: assets.split('\n').map(a => a.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Failed to create finding');
        return;
      }
      const data = await res.json();
      router.push(`/projects/${projectId}/findings/${data.finding?.id ?? data.id}`);
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  const SEV_COLORS: Record<string, string> = {
    critical: 'var(--sev-critical)',
    high: 'var(--sev-high)',
    medium: 'var(--sev-medium)',
    low: 'var(--sev-low)',
    info: 'var(--sev-info)',
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header card */}
      <div className="card" style={{ padding: 'var(--card-pad)' }}>
        <div className="eyebrow" style={{ marginBottom: 16 }}>Finding Details</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Title <span style={{ color: 'var(--sev-critical)' }}>*</span></label>
            <input
              className="input"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. SQL Injection in login endpoint"
              style={{ width: '100%', height: 40, fontSize: 15 }}
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Severity</label>
              <select className="input" value={severity} onChange={e => setSeverity(e.target.value)} style={{ width: '100%', color: SEV_COLORS[severity] }}>
                {['critical', 'high', 'medium', 'low', 'info'].map(s => (
                  <option key={s} value={s} style={{ color: SEV_COLORS[s] }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">CWE</label>
              <input className="input" value={cwe} onChange={e => setCwe(e.target.value)} placeholder="e.g. CWE-89" style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">OWASP Category</label>
              <input className="input" value={owasp} onChange={e => setOwasp(e.target.value)} placeholder="e.g. A03:2021 - Injection" style={{ width: '100%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="card" style={{ padding: 'var(--card-pad)' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Executive Summary</div>
        <textarea
          className="input"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="Brief, non-technical description of the vulnerability and its business impact…"
          rows={4}
          style={{ width: '100%' }}
        />
      </div>

      {/* Description */}
      <div className="card" style={{ padding: 'var(--card-pad)' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Technical Description</div>
        <textarea
          className="input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Detailed technical description. Supports **Markdown**…"
          rows={8}
          style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 13 }}
        />
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-3)' }}>Supports Markdown formatting</div>
      </div>

      {/* Assets */}
      <div className="card" style={{ padding: 'var(--card-pad)' }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Affected Assets</div>
        <textarea
          className="input"
          value={assets}
          onChange={e => setAssets(e.target.value)}
          placeholder="One asset per line&#10;e.g. https://app.example.com/login&#10;e.g. api.example.com:443"
          rows={4}
          style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
        />
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--sev-critical-bg)', border: '1px solid rgba(255,92,58,0.25)', borderRadius: 'var(--r-sm)', color: 'var(--sev-critical)', fontSize: 13 }}>
          <Ico name="alert" size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, paddingBottom: 40 }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
          style={{ height: 40, padding: '0 24px', fontSize: 14 }}
        >
          <Ico name="plus" size={15} />
          {submitting ? 'Creating…' : 'Create Finding'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => router.push(`/projects/${projectId}`)}
          style={{ height: 40 }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
