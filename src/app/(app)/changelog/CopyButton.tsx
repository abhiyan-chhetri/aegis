'use client';
import React, { useState } from 'react';
import { Ico } from '@/components/chrome/icons';

interface Props {
  text: string;
  /** Optional label override. If omitted, default text "Copy for Confluence" is used. */
  label?: string;
  /** Compact = small inline pill (used per-release). Default = full button. */
  compact?: boolean;
}

export function CopyButton({ text, label, compact }: Props) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // Per-version pill style — small, inline, fits next to the change-type badges
  if (label !== undefined || compact) {
    return (
      <button
        onClick={handleCopy}
        title={`Copy v${label} markdown to clipboard`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontFamily: 'var(--font-mono)',
          color: copied ? 'var(--status-resolved)' : 'var(--ink-2)',
          background: copied ? 'rgba(143,201,122,0.08)' : 'var(--bg-2)',
          border: `1px solid ${copied ? 'rgba(143,201,122,0.3)' : 'var(--line-1)'}`,
          borderRadius: 3, padding: '2px 8px',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <Ico name={copied ? 'check' : 'copy'} size={11} />
        {copied ? 'copied!' : `copy ${label ? `v${label}` : 'markdown'}`}
      </button>
    );
  }

  // Original "Copy for Confluence" CTA used elsewhere
  return (
    <button onClick={handleCopy} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
      <Ico name={copied ? 'check' : 'copy'} size={13} />
      {copied ? 'Copied!' : 'Copy for Confluence'}
    </button>
  );
}
