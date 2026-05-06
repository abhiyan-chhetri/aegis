'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ico, Logo, Avatar } from './icons';

type User = { name: string; initials: string; role: string };

type SidebarProps = { user?: User | null };

const NAV_ITEMS = [
  { href: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { href: '/projects',  icon: 'projects',  label: 'Projects' },
  { href: '/library',   icon: 'library',   label: 'Vuln List' },
  { href: '/reports',   icon: 'reports',   label: 'Reports' },
  { href: '/team',      icon: 'team',      label: 'Team' },
  { href: '/portfolio', icon: 'projects',  label: 'Portfolio' },
  { href: '/audit-trail', icon: 'library', label: 'Audit Trail' },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  return (
    <aside style={styles.root}>
      {/* Brand */}
      <div style={styles.brand}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-0)' }}>
          <Logo size={22} />
          <div>
            <div className="serif" style={{ fontSize: 17, fontWeight: 500, color: 'var(--ink-0)', lineHeight: 1 }}>Aegis</div>
            <div className="eyebrow" style={{ fontSize: 9, marginTop: 3 }}>Pentest Report Platform</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={styles.nav}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}>
                <Ico name={item.icon} size={16} />
                <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={styles.footer}>
        <Link href="/settings" style={{ textDecoration: 'none' }}>
          <div style={{ ...styles.navItem, ...(pathname === '/settings' ? styles.navItemActive : {}) }}>
            <Ico name="settings" size={16} />
            <span style={{ flex: 1, textAlign: 'left' }}>Settings</span>
          </div>
        </Link>
        <div style={styles.userRow}>
          <Avatar id={user?.initials} name={user?.name} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink-0)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'Kenji Oduya'}</div>
            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{user?.role || 'Lead'}</div>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="btn btn-ghost btn-sm" style={{ width: 26, padding: 0 }} title="Sign out">
              <Ico name="logout" size={13} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: 248, minWidth: 248, height: '100%',
    background: 'var(--bg-1)',
    borderRight: '1px solid var(--line-1)',
    display: 'flex', flexDirection: 'column',
  },
  brand: { padding: '20px 18px 14px', borderBottom: '1px solid var(--line-1)' },
  nav: { padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 1, flex: 1, overflowY: 'auto' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10,
    height: 32, padding: '0 10px',
    background: 'transparent', borderRadius: 'var(--r-sm)',
    color: 'var(--ink-2)', fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 400,
    cursor: 'pointer', transition: 'all 0.1s',
  },
  navItemActive: { background: 'var(--bg-3)', color: 'var(--ink-0)', fontWeight: 500 },
  footer: { padding: '10px', borderTop: '1px solid var(--line-1)' },
  userRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px', marginTop: 6,
    borderRadius: 'var(--r-sm)',
    background: 'var(--bg-2)', border: '1px solid var(--line-1)',
  },
};
