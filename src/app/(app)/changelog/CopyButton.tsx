'use client';
import React, { useState } from 'react';
import { Ico } from '@/components/chrome/icons';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }
  return (
    <button onClick={handleCopy} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
      <Ico name={copied ? 'check' : 'copy'} size={13} />
      {copied ? 'Copied!' : 'Copy for Confluence'}
    </button>
  );
}
