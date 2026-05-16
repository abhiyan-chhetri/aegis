'use client';

/**
 * Reusable toast queue.
 *
 *   import { toast } from '@/components/ui/Toast';
 *   toast.success('Finding saved');
 *   toast.error('Save failed', { description: 'check console' });
 *   toast.info('Report submitted for review', {
 *     action: { label: 'Undo', onClick: () => undo() },
 *   });
 *
 * The <ToastViewport /> component is mounted once at the app layout level
 * (already wired into ChromeOverlays) and renders the live queue. Toasts
 * auto-dismiss after `duration` ms (default 4 000), animate in/out, and
 * stack bottom-right.
 *
 * No third-party dependency.
 */

import React, { useEffect, useState } from 'react';
import { Ico } from '@/components/chrome/icons';

export type ToastKind = 'success' | 'error' | 'info' | 'warn';

export interface ToastInput {
  id?: string;
  kind?: ToastKind;
  title: string;
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends Required<Omit<ToastInput, 'description' | 'action'>> {
  description?: string;
  action?: { label: string; onClick: () => void };
}

// ── External event bus ────────────────────────────────────────────────────
const TOAST_EVENT = 'aegis:toast';
const DISMISS_EVENT = 'aegis:toast-dismiss';

function emit(t: ToastInput) {
  if (typeof window === 'undefined') return '';
  const id = t.id ?? `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { ...t, id } }));
  return id;
}

export const toast = {
  success: (title: string, opts: Omit<ToastInput, 'title' | 'kind'> = {}) =>
    emit({ kind: 'success', title, ...opts }),
  error: (title: string, opts: Omit<ToastInput, 'title' | 'kind'> = {}) =>
    emit({ kind: 'error', title, duration: 6000, ...opts }),
  info: (title: string, opts: Omit<ToastInput, 'title' | 'kind'> = {}) =>
    emit({ kind: 'info', title, ...opts }),
  warn: (title: string, opts: Omit<ToastInput, 'title' | 'kind'> = {}) =>
    emit({ kind: 'warn', title, ...opts }),
  /** Dismiss a specific toast by id, or all if no id. */
  dismiss: (id?: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(DISMISS_EVENT, { detail: { id } }));
  },
};

// ── Viewport ──────────────────────────────────────────────────────────────
export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastInput>).detail;
      const item: ToastItem = {
        id: detail.id ?? `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: detail.kind ?? 'info',
        title: detail.title,
        description: detail.description,
        action: detail.action,
        duration: detail.duration ?? 4000,
      };
      setItems(prev => [...prev, item]);
      if (item.duration > 0) {
        window.setTimeout(() => {
          setItems(prev => prev.filter(t => t.id !== item.id));
        }, item.duration);
      }
    }
    function onDismiss(e: Event) {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      setItems(prev => (id ? prev.filter(t => t.id !== id) : []));
    }
    window.addEventListener(TOAST_EVENT, onToast);
    window.addEventListener(DISMISS_EVENT, onDismiss);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.removeEventListener(DISMISS_EVENT, onDismiss);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed', right: 18, bottom: 68, zIndex: 1000,
        display: 'flex', flexDirection: 'column', gap: 10,
        maxWidth: 380, pointerEvents: 'none',
      }}
    >
      {items.map(t => <ToastCard key={t.id} item={t} onDismiss={() => setItems(prev => prev.filter(x => x.id !== t.id))} />)}
    </div>
  );
}

// ── Individual toast card with slide-in animation ─────────────────────────
function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    // Trigger the enter transition on the next frame
    const r = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const META: Record<ToastKind, { icon: string; accent: string }> = {
    success: { icon: 'check',  accent: 'var(--status-resolved)' },
    error:   { icon: 'alert',  accent: 'var(--sev-critical)' },
    info:    { icon: 'info',   accent: 'var(--sev-low, #7fb3d5)' },
    warn:    { icon: 'alert',  accent: 'var(--sev-high)' },
  };
  const m = META[item.kind];

  return (
    <div
      role="status"
      style={{
        pointerEvents: 'auto',
        display: 'flex', alignItems: 'flex-start', gap: 12,
        background: 'var(--bg-1)',
        border: '1px solid var(--line-2)',
        borderLeft: `3px solid ${m.accent}`,
        borderRadius: 'var(--r-md)',
        padding: '12px 14px',
        boxShadow: 'var(--shadow-lg)',
        transform: entered ? 'translate3d(0, 0, 0)' : 'translate3d(120%, 0, 0)',
        opacity: entered ? 1 : 0,
        transition: 'transform .26s cubic-bezier(.2,1.2,.4,1), opacity .2s ease',
        minWidth: 260,
      }}
    >
      <div style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: 6,
        background: `color-mix(in srgb, ${m.accent} 18%, transparent)`,
        color: m.accent,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 1,
      }}>
        <Ico name={m.icon} size={12} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-0)', fontWeight: 600, lineHeight: 1.4 }}>
          {item.title}
        </div>
        {item.description && (
          <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.5 }}>
            {item.description}
          </div>
        )}
        {item.action && (
          <button
            onClick={() => { item.action?.onClick(); onDismiss(); }}
            style={{
              marginTop: 8, padding: '4px 10px', borderRadius: 'var(--r-xs)',
              border: '1px solid var(--line-2)', background: 'transparent',
              color: m.accent, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
            }}
          >{item.action.label}</button>
        )}
      </div>
      <button
        onClick={onDismiss}
        title="Dismiss"
        style={{
          flexShrink: 0, padding: 4, marginTop: -2, borderRadius: 'var(--r-xs)',
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ink-3)',
        }}
      ><Ico name="x" size={12} /></button>
    </div>
  );
}
