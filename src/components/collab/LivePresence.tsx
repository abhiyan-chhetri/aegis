'use client';

/**
 * LivePresence — shows avatars of other users currently viewing the same entity.
 *
 * Usage:
 *   <LivePresence entity="project:abc123" />
 *   <LivePresence entity="finding:xyz789" />
 *
 * Heartbeats every PING_MS. Removes self on unmount.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';

const PING_MS = 15_000;

interface Viewer { name: string; initials: string; }

function getColor(initials: string): string {
  const palette = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
  ];
  let h = 0;
  for (let i = 0; i < initials.length; i++) h = (h * 31 + initials.charCodeAt(i)) & 0xffffffff;
  return palette[Math.abs(h) % palette.length];
}

function PresenceAvatar({ v, index }: { v: Viewer; index: number }) {
  const [tip, setTip] = useState(false);
  const color = getColor(v.initials);
  return (
    <div
      style={{ position: 'relative', marginLeft: index > 0 ? -8 : 0, zIndex: 10 - index }}
      onMouseEnter={() => setTip(true)}
      onMouseLeave={() => setTip(false)}
    >
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: color, border: '2px solid var(--bg-0)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color: 'white',
        fontFamily: 'var(--font-sans)', cursor: 'default',
        animation: 'presencePop 0.25s ease',
      }}>
        {v.initials.slice(0, 2)}
      </div>
      {tip && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-3)', border: '1px solid var(--line-2)',
          borderRadius: 'var(--r-sm)', padding: '4px 8px',
          fontSize: 11, color: 'var(--ink-0)', whiteSpace: 'nowrap',
          boxShadow: 'var(--shadow-md)', zIndex: 100,
          pointerEvents: 'none',
        }}>
          {v.name}
        </div>
      )}
    </div>
  );
}

export function LivePresence({ entity, className }: { entity: string; className?: string }) {
  const [others, setOthers] = useState<Viewer[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ping = useCallback(async () => {
    try {
      const res = await fetch('/api/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity }),
      });
      if (res.ok) {
        const data = await res.json();
        setOthers(data.others ?? []);
      }
    } catch { /* ignore network errors */ }
  }, [entity]);

  useEffect(() => {
    ping();
    intervalRef.current = setInterval(ping, PING_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Remove presence on unmount (fire-and-forget)
      fetch('/api/presence', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [entity, ping]);

  if (others.length === 0) return null;

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {others.slice(0, 5).map((v, i) => (
          <PresenceAvatar key={v.name} v={v} index={i} />
        ))}
        {others.length > 5 && (
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--bg-3)', border: '2px solid var(--bg-0)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: 'var(--ink-2)',
            marginLeft: -8, zIndex: 0,
          }}>
            +{others.length - 5}
          </div>
        )}
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        {others.length === 1 ? `${others[0].name} is also here` : `${others.length} others here`}
      </span>
      <style>{`
        @keyframes presencePop {
          from { transform: scale(0.5); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}
