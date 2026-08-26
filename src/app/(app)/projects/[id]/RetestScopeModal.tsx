'use client';

/**
 * RetestScopeModal — AI-generates a retest checklist from the previous
 * engagement's unresolved findings. Offers copy + append-to-notes.
 */
import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';

export function RetestScopeModal({ projectId, projectName, engagement, previousEngagement, findingIds, onClose }: {
  projectId: string;
  projectName: string;
  engagement: string;
  previousEngagement: string;
  findingIds: string[];
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<'loading' | 'done' | 'error'>('loading');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function generate() {
    setPhase('loading');
    setError('');
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'retest-scope',
          context: { projectName, engagement, previousEngagement, findingIds },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Generation failed');
      setContent(d.content || '');
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setPhase('error');
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    generate();
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  async function addToNotes() {
    try {
      // Append (not replace) — read the current notes first.
      let existing = '';
      const g = await fetch(`/api/projects/${projectId}`, { cache: 'no-store' });
      if (g.ok) {
        const d = await g.json();
        const n = d.project?.notes ?? d.notes ?? '';
        if (typeof n === 'string') existing = n;
      }
      const separator = existing.trim() ? '\n\n' : '';
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: `${existing}${separator}## Retest Scope\n\n${content}` }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Retest scope added to Notes', { description: 'Appended to the engagement Notes tab.' });
      onClose();
    } catch (e) {
      toast.error('Could not save to Notes', { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div style={{
        width: 760, maxWidth: '94vw', height: '82vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)',
        boxShadow: '0 24px 80px rgba(0,0,0,.5)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Ico name="sparkles" size={16} style={{ color: '#9b7fd4' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-0)' }}>AI Retest Scope</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              {projectName} · retest checklist from {previousEngagement} ({findingIds.length} unresolved findings)
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: 28, padding: 0 }}><Ico name="x" size={14} /></button>
        </div>

        {/* Body */}
        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {phase === 'loading' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '50px 0' }}>
              <span style={{ width: 22, height: 22, border: '3px solid var(--line-2)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>Building the retest checklist…</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {phase === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--sev-critical)' }}>{error}</div>
              <button className="btn" onClick={generate} style={{ fontSize: 12.5 }}>Retry</button>
            </div>
          )}
          {phase === 'done' && (
            <div className="md-preview" style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--ink-1)' }}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children, href }: any) => <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{children}</a> } as any}>
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'done' && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line-1)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
            <button className="btn" onClick={copy} style={{ fontSize: 12.5, gap: 6 }}>
              <Ico name={copied ? 'check' : 'copy'} size={12} /> {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="btn btn-primary" onClick={addToNotes} style={{ fontSize: 12.5, gap: 6 }}>
              <Ico name="pen" size={12} /> Add to Notes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
