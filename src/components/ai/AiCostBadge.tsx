'use client';

/**
 * AiCostBadge — live "$ spent on AI" indicator, shown site-wide in the Topbar.
 * Refreshes on an interval so the total stays roughly current.
 */
import React from 'react';

export function AiCostBadge() {
  const [cost, setCost] = React.useState<number | null>(null);
  const [month, setMonth] = React.useState<number | null>(null);

  React.useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch('/api/ai/usage', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (alive) {
          setCost(typeof d.totalCost === 'number' ? d.totalCost : null);
          setMonth(typeof d.thisMonthCost === 'number' ? d.thisMonthCost : null);
        }
      } catch { /* ignore */ }
    }
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (cost === null) return null;

  return (
    <span
      title={`AI spend — $${cost.toFixed(2)} total${month !== null ? ` · $${month.toFixed(2)} this month` : ''} (token usage across all providers)`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 10.5, fontFamily: 'var(--font-mono)', fontWeight: 600,
        color: 'var(--accent)', background: 'rgba(184,146,58,.1)',
        border: '1px solid rgba(184,146,58,.3)', borderRadius: 100,
        padding: '3px 9px', cursor: 'default', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 10 }}>💸</span> ${cost.toFixed(2)}
    </span>
  );
}
