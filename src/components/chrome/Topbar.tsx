'use client';

import React from 'react';
import Link from 'next/link';
import { Ico } from './icons';
import { CommandPaletteButton } from './CommandPalette';

type BreadcrumbItem = string | { label: string; href: string };

type TopbarProps = {
  title?: string;
  subtitle?: string;
  breadcrumb?: BreadcrumbItem[];
  actions?: React.ReactNode;
  showSearch?: boolean;
};

export function Topbar({ title, subtitle, breadcrumb, actions, showSearch = true }: TopbarProps) {
  return (
    <header style={styles.root}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {breadcrumb && (
          <div style={styles.crumbs}>
            {breadcrumb.map((c, i) => {
              const isLast = i === breadcrumb.length - 1;
              const label = typeof c === 'string' ? c : c.label;
              const href  = typeof c === 'string' ? undefined : c.href;
              return (
                <React.Fragment key={i}>
                  {i > 0 && <Ico name="chevRight" size={11} />}
                  {href && !isLast ? (
                    <Link href={href} style={{ color: 'var(--ink-2)', textDecoration: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-2)')}
                    >{label}</Link>
                  ) : (
                    <span style={{ color: isLast ? 'var(--ink-0)' : 'var(--ink-2)' }}>{label}</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
        {title && (
          <h1 className="serif" style={styles.title}>{title}</h1>
        )}
        {subtitle && <div style={styles.sub}>{subtitle}</div>}
      </div>
      <div style={styles.actions}>
        {showSearch && <CommandPaletteButton />}
        {actions}
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '18px 28px',
    borderBottom: '1px solid var(--line-1)',
    background: 'var(--bg-0)',
    minHeight: 72, flexShrink: 0,
  },
  crumbs: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
    color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: 4,
  },
  title: { margin: 0, fontSize: 26, fontWeight: 400, color: 'var(--ink-0)', lineHeight: 1.1 },
  sub: { fontSize: 13, color: 'var(--ink-2)', marginTop: 6 },
  actions: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
};
