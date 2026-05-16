'use client';

/**
 * Lightweight UI-polish helpers.
 *
 * CountUp uses a plain requestAnimationFrame loop (no anime.js dependency) so
 * it's bulletproof regardless of anime.js version drift. Reveal/StaggerList
 * use anime.js v4 syntax (`ease` not `easing`, `onUpdate` not `update`).
 */

import React, { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';

// ─── Reveal: fade + slide-up on mount ──────────────────────────────────────
interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  y?: number;
  once?: boolean;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof React.JSX.IntrinsicElements;
}

export function Reveal({
  children, delay = 0, duration = 540, y = 12, className, style, as: Tag = 'div',
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    animate(el, {
      opacity: [0, 1],
      translateY: [y, 0],
      duration,
      delay,
      ease: 'outQuad',
    });
  }, [delay, duration, y]);

  return React.createElement(
    Tag as string,
    { ref, className, style: { opacity: 0, ...style } },
    children,
  );
}

// ─── StaggerList: fade direct children one after the other ─────────────────
interface StaggerListProps {
  children: React.ReactNode;
  step?: number;
  duration?: number;
  itemSelector?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function StaggerList({
  children, step = 70, duration = 460, itemSelector, className, style,
}: StaggerListProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const targets = itemSelector
      ? el.querySelectorAll<HTMLElement>(itemSelector)
      : (Array.from(el.children) as HTMLElement[]);
    if (targets.length === 0) return;
    animate(targets, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration,
      delay: stagger(step),
      ease: 'outQuad',
    });
  }, [step, duration, itemSelector]);

  return <div ref={ref} className={className} style={style}>{children}</div>;
}

// ─── CountUp: pure requestAnimationFrame tween ─────────────────────────────
interface CountUpProps {
  to: number;
  duration?: number;
  suffix?: string;
  decimals?: number;
  from?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * CountUp — animate a number from 0 (or `from`) up to `to`.
 *
 * Uses requestAnimationFrame so we don't depend on anime.js for the
 * number tween — that was the source of the "numbers always show 0" bug
 * because anime.js v4 renamed the `update` callback to `onUpdate` and
 * an object-target tween needs the new name to run at all.
 */
export function CountUp({
  to, duration = 900, suffix = '', decimals = 0, from = 0, className, style,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // If there's nothing to animate (start === end) just write the value.
    if (to === from) {
      el.textContent = to.toFixed(decimals) + suffix;
      return;
    }
    let raf = 0;
    const start = performance.now();
    const range = to - from;
    // Ease-out cubic for a graceful settle.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + range * ease(t);
      el.textContent = v.toFixed(decimals) + suffix;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, suffix, decimals, from]);

  return (
    <span ref={ref} className={className} style={style}>
      {to.toFixed(decimals)}{suffix}
    </span>
  );
}

// ─── usePulse: tactile click feedback ──────────────────────────────────────
export function usePulse() {
  return (e: React.MouseEvent<HTMLElement>) => {
    animate(e.currentTarget, {
      scale: [{ to: 0.96, duration: 90 }, { to: 1, duration: 180 }],
      ease: 'outQuad',
    });
  };
}
