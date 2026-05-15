'use client';

/**
 * Lightweight anime.js helpers — only intended for tasteful UI polish.
 * Keep durations short, easings clean, no auto-playing loops on every page.
 */

import React, { useEffect, useRef } from 'react';
import { animate, stagger } from 'animejs';

interface RevealProps {
  children: React.ReactNode;
  /** ms delay before the animation starts */
  delay?: number;
  /** ms total animation duration */
  duration?: number;
  /** Y-offset to slide in from (default 12) */
  y?: number;
  /** When true, animation plays only the first time the component mounts */
  once?: boolean;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof React.JSX.IntrinsicElements;
}

/**
 * Reveal — fade + slight slide-up on mount. Works for any element.
 * Use sparingly on hero cards, headings, or the first row of a list.
 */
export function Reveal({
  children,
  delay = 0,
  duration = 540,
  y = 12,
  className,
  style,
  as: Tag = 'div',
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
      easing: 'easeOutQuad',
    });
  }, [delay, duration, y]);

  return React.createElement(
    Tag as string,
    {
      ref,
      className,
      style: { opacity: 0, ...style },
    },
    children,
  );
}

interface StaggerListProps {
  children: React.ReactNode;
  /** ms gap between each child's animation start */
  step?: number;
  /** ms total animation duration per child */
  duration?: number;
  /** Direct CSS selector for the items to animate (relative to wrapper) */
  itemSelector?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * StaggerList — animate direct children sequentially with a small delay step.
 * Useful for changelog timelines, finding lists, dashboard cards.
 */
export function StaggerList({
  children,
  step = 70,
  duration = 460,
  itemSelector,
  className,
  style,
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
      easing: 'easeOutQuad',
    });
  }, [step, duration, itemSelector]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

interface CountUpProps {
  to: number;
  /** ms duration */
  duration?: number;
  /** Suffix (e.g. "%", "+") */
  suffix?: string;
  /** Decimal places */
  decimals?: number;
  /** Optional starting value (defaults to 0) */
  from?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * CountUp — animate a number from 0 (or `from`) up to `to`. Great for stats.
 */
export function CountUp({
  to,
  duration = 900,
  suffix = '',
  decimals = 0,
  from = 0,
  className,
  style,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obj = { v: from };
    animate(obj, {
      v: to,
      duration,
      easing: 'easeOutCubic',
      update: () => {
        el.textContent = obj.v.toFixed(decimals) + suffix;
      },
    });
  }, [to, duration, suffix, decimals, from]);

  return (
    <span ref={ref} className={className} style={style}>
      {from.toFixed(decimals)}{suffix}
    </span>
  );
}

/**
 * usePulse — attach a subtle scale pulse on click for tactile feedback.
 * Returns an onClick wrapper that runs the animation then forwards to handler.
 */
export function usePulse() {
  return (e: React.MouseEvent<HTMLElement>) => {
    animate(e.currentTarget, {
      scale: [{ to: 0.96, duration: 90 }, { to: 1, duration: 180 }],
      easing: 'easeOutQuad',
    });
  };
}
