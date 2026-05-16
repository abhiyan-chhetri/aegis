'use client';

/**
 * Tiny client component that registers the current page as a "recent" item in
 * localStorage on mount. Used by project/finding pages so the dashboard
 * Resume-Editing widget knows what you were just working on.
 */

import React, { useEffect } from 'react';

interface Props {
  id: string;
  type: 'project' | 'finding' | 'report';
  label: string;
  sub?: string;
  href: string;
  icon?: string;
  severity?: string;
}

const RECENT_KEY = 'aegis.cmd.recent';
const RECENT_MAX = 6;

export function TrackRecent({ id, type, label, sub, href, icon, severity }: Props) {
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const entry = {
        id: `${type}-${id}`,
        type,
        label,
        sub,
        icon: icon ?? (type === 'project' ? 'projects' : type === 'finding' ? 'alert' : 'reports'),
        href,
        severity,
        group: 'Recent',
      };
      const next = [entry, ...list.filter((c: { id: string }) => c.id !== entry.id)].slice(0, RECENT_MAX);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('aegis:recent-updated'));
    } catch { /* ignore quota / SSR */ }
  }, [id, type, label, sub, href, icon, severity]);
  return null;
}
