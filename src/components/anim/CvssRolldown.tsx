'use client';

/**
 * Animated CVSS rolldown visualisation.
 *
 * When a finding's score changes (because of an environmental re-score or
 * a manual edit), this component tweens the number from the old value to
 * the new value with a directional arrow + colour transition.
 *
 * Used in toasts ("F-001: 8.2 → 4.3"), the finding editor's CVSS pill, and
 * the rescore confirmation summary.
 */

import React, { useEffect, useRef, useState } from 'react';
import { animate } from 'animejs';

interface Props {
  from: number;
  to: number;
  /** ms — total animation duration */
  duration?: number;
  /** Show a coloured arrow between from→to */
  showArrow?: boolean;
  /** Compact rendering for inline use in toasts */
  size?: 'sm' | 'md' | 'lg';
}

export function CvssRolldown({ from, to, duration = 1100, showArrow = true, size = 'md' }: Props) {
  const numberRef = useRef<HTMLSpanElement | null>(null);
  const arrowRef = useRef<HTMLSpanElement | null>(null);
  const [final, setFinal] = useState(from);

  const moved = Math.abs(to - from) > 0.05;
  const direction: 'up' | 'down' | 'same' = !moved ? 'same' : to > from ? 'up' : 'down';
  const accent =
    direction === 'down' ? 'var(--status-resolved)' :
    direction === 'up'   ? 'var(--sev-critical)' :
    'var(--ink-2)';

  useEffect(() => {
    if (!moved) { setFinal(to); return; }
    const obj = { v: from };
    const anim = animate(obj, {
      v: to,
      duration,
      ease: 'outCubic',
      onUpdate: () => {
        if (numberRef.current) {
          numberRef.current.textContent = obj.v.toFixed(1);
        }
      },
      onComplete: () => setFinal(to),
    });
    // Arrow flash
    if (arrowRef.current) {
      animate(arrowRef.current, {
        translateX: direction === 'down' ? [10, 0] : [-10, 0],
        opacity: [0, 1],
        duration: 320,
        ease: 'outQuad',
      });
    }
    return () => { anim.pause?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const fontSize = size === 'sm' ? 12 : size === 'lg' ? 22 : 15;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ color: 'var(--ink-3)', opacity: 0.7 }}>{from.toFixed(1)}</span>
      {showArrow && (
        <span ref={arrowRef} style={{
          color: accent, display: 'inline-block',
          transform: 'translateX(-10px)', opacity: 0,
        }}>
          {direction === 'down' ? '↘' : direction === 'up' ? '↗' : '→'}
        </span>
      )}
      <span ref={numberRef} style={{ color: accent, fontSize: fontSize + 1 }}>
        {final.toFixed(1)}
      </span>
    </span>
  );
}

// ─── A short "score-changed" pulse — wraps any element ─────────────────────
/**
 * Wrap an existing element to give it a brief pulse + colour flash when its
 * key changes. Used on the finding editor's CVSS pill so editing the vector
 * provides instant visual feedback that the score moved.
 */
export function PulseOnChange({
  value, children, color = 'var(--accent)',
}: { value: string | number; children: React.ReactNode; color?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const prev = useRef<string | number>(value);
  useEffect(() => {
    if (prev.current === value || !ref.current) {
      prev.current = value;
      return;
    }
    prev.current = value;
    animate(ref.current, {
      scale: [{ to: 1.18, duration: 140 }, { to: 1, duration: 280 }],
      boxShadow: [
        { to: `0 0 0 4px ${color}33`, duration: 140 },
        { to: `0 0 0 0 ${color}00`, duration: 380 },
      ],
      ease: 'outQuad',
    });
  }, [value, color]);
  return <span ref={ref} style={{ display: 'inline-block', transformOrigin: 'center', borderRadius: 6 }}>{children}</span>;
}
