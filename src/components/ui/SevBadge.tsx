'use client';

import React, { useEffect, useRef } from 'react';
import { animate } from 'animejs';

export const SEV_LABEL: Record<string, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info',
};

const SEV_HEX: Record<string, string> = {
  critical: 'var(--sev-critical)', high: 'var(--sev-high)',
  medium: 'var(--sev-medium)', low: 'var(--sev-low)',
  info: 'var(--sev-info, #9a968c)',
};

/**
 * Severity pill with an animated ring on the leading dot. When the `level`
 * prop changes between renders, the ring sweeps 360° via anime.js — a small
 * visible signal that the severity just changed.
 */
export function Sev({ level, size = 'md' }: { level: string; size?: 'sm' | 'md' }) {
  const ringRef = useRef<SVGSVGElement | null>(null);
  const prevLevel = useRef<string>(level);

  useEffect(() => {
    if (prevLevel.current === level || !ringRef.current) {
      prevLevel.current = level;
      return;
    }
    prevLevel.current = level;
    animate(ringRef.current, {
      rotate: '+=360',
      scale: [{ to: 1.35, duration: 220 }, { to: 1, duration: 260 }],
      easing: 'easeOutCubic',
      duration: 520,
    });
  }, [level]);

  const ringSize = size === 'sm' ? 10 : 12;
  const color = SEV_HEX[level] || SEV_HEX.info;

  return (
    <span className={`pill pill-${level}`} style={{
      ...(size === 'sm' ? { height: 18, padding: '0 7px', fontSize: 10 } : {}),
      display: 'inline-flex', alignItems: 'center', gap: 5,
    }}>
      {/* Animated ring instead of a plain dot — spins 360° on severity change */}
      <svg
        ref={ringRef}
        width={ringSize}
        height={ringSize}
        viewBox={`0 0 ${ringSize} ${ringSize}`}
        style={{ display: 'inline-block', overflow: 'visible', transformOrigin: '50% 50%' }}
        aria-hidden
      >
        <circle cx={ringSize / 2} cy={ringSize / 2} r={ringSize / 2 - 1.5} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1} />
        <circle cx={ringSize / 2} cy={ringSize / 2} r={ringSize / 2 - 3.5} fill={color} />
      </svg>
      {SEV_LABEL[level] || level}
    </span>
  );
}

export const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  'open':           { color: 'var(--status-open)',     bg: 'rgba(255,92,58,0.10)',   label: 'Open' },
  'in-progress':    { color: 'var(--status-progress)', bg: 'rgba(245,165,36,0.10)',  label: 'In progress' },
  'in-review':      { color: 'var(--status-review)',   bg: 'rgba(201,168,245,0.10)', label: 'In review' },
  'resolved':       { color: 'var(--status-resolved)', bg: 'rgba(143,201,122,0.10)', label: 'Resolved' },
  'accepted':       { color: 'var(--status-accepted)', bg: 'rgba(154,150,140,0.10)', label: 'Risk accepted' },
  'completed':      { color: 'var(--status-resolved)', bg: 'rgba(143,201,122,0.10)', label: 'Completed' },
  'waiting-client': { color: 'var(--status-progress)', bg: 'rgba(245,165,36,0.10)',  label: 'Waiting · Client' },
  'scheduled':      { color: 'var(--ink-2)',           bg: 'rgba(154,150,140,0.08)', label: 'Scheduled' },
  'draft':          { color: 'var(--ink-2)',           bg: 'rgba(154,150,140,0.08)', label: 'Draft' },
  'review':         { color: 'var(--status-review)',   bg: 'rgba(201,168,245,0.10)', label: 'In review' },
  'final':          { color: 'var(--status-resolved)', bg: 'rgba(143,201,122,0.10)', label: 'Final' },
  'approved':       { color: 'var(--status-resolved)', bg: 'rgba(143,201,122,0.10)', label: 'Approved' },
  'rejected':       { color: 'var(--sev-critical)',    bg: 'rgba(255,92,58,0.10)',   label: 'Rejected' },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES['open'];
  return (
    <span className="pill" style={{ color: s.color, background: s.bg, borderColor: 'transparent' }}>
      <span className="dot" style={{ width: 5, height: 5, background: s.color }} />
      {s.label}
    </span>
  );
}

export function SevBar({ counts }: { counts: Record<string, number> }) {
  const order = ['critical', 'high', 'medium', 'low', 'info'];
  const total = order.reduce((s, k) => s + (counts[k] || 0), 0) || 1;
  return (
    <div style={{ display: 'flex', width: 120, height: 5, borderRadius: 100, overflow: 'hidden', background: 'var(--bg-3)' }}>
      {order.map(s => (counts[s] || 0) > 0 && (
        <div key={s} style={{ width: `${((counts[s] || 0) / total) * 100}%`, background: `var(--sev-${s})`, opacity: 0.85 }}
             title={`${counts[s]} ${s}`} />
      ))}
    </div>
  );
}

export function SevCounts({ counts, compact }: { counts: Record<string, number>; compact?: boolean }) {
  const order = ['critical', 'high', 'medium', 'low', 'info'];
  const letter: Record<string, string> = { critical: 'C', high: 'H', medium: 'M', low: 'L', info: 'I' };
  return (
    <div style={{ display: 'flex', gap: compact ? 4 : 6 }}>
      {order.map(s => (
        <div key={s} title={`${SEV_LABEL[s]}: ${counts[s] || 0}`} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: compact ? '1px 5px' : '2px 7px',
          height: compact ? 18 : 22,
          borderRadius: compact ? 3 : 4,
          fontSize: compact ? 10 : 11,
          fontFamily: 'var(--font-mono)',
          background: (counts[s] || 0) > 0 ? `var(--sev-${s}-bg)` : 'transparent',
          color: (counts[s] || 0) > 0 ? `var(--sev-${s})` : 'var(--ink-3)',
          border: `1px solid ${(counts[s] || 0) > 0 ? 'transparent' : 'var(--line-1)'}`,
          minWidth: compact ? 22 : 26, justifyContent: 'center',
          cursor: 'default',
        }}>
          <span style={{ opacity: 0.7 }}>{letter[s]}</span>
          <span style={{ fontWeight: 500 }}>{counts[s] || 0}</span>
        </div>
      ))}
    </div>
  );
}
