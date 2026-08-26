'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ico, Logo, Avatar } from './icons';
import { toast } from '@/components/ui/Toast';

type User = { name: string; initials: string; role: string };

type SidebarProps = { user?: User | null };

const NAV_ITEMS = [
  { href: '/dashboard',     icon: 'dashboard', label: 'Dashboard' },
  { href: '/inbox',         icon: 'message',   label: 'Inbox' },
  { href: '/chat',          icon: 'sparkles',  label: 'AI Chat' },
  { href: '/notifications', icon: 'bell',      label: 'Notifications' },
  { href: '/projects',      icon: 'projects',  label: 'Projects' },
  { href: '/library',       icon: 'library',   label: 'Vuln List' },
  { href: '/reports',       icon: 'reports',   label: 'Reports' },
  { href: '/team',          icon: 'team',      label: 'Team' },
  { href: '/portfolio',     icon: 'projects',  label: 'Portfolio' },
  { href: '/insights',      icon: 'chart',     label: 'Insights' },
  { href: '/audit-trail',   icon: 'library',   label: 'Audit Trail' },
  { href: '/changelog',     icon: 'paper',     label: 'Changelog' },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = React.useState<number>(0);

  // Poll the notifications endpoint for an unread badge. Cheap query
  // (single COUNT, indexed) — 30s cadence is plenty for in-app pings.
  React.useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch('/api/notifications?unread=1&limit=1', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        if (alive) setUnreadCount(d.unreadCount ?? 0);
      } catch { /* ignore */ }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [pathname]);

  // Realtime notification stream — refresh the badge instantly and surface a
  // toast when a watched finding changes or someone mentions us.
  React.useEffect(() => {
    const es = new EventSource('/api/notifications/live');
    es.onmessage = (ev) => {
      let d: { type?: string; n?: { type?: string; title?: string; body?: string; link?: string } };
      try { d = JSON.parse(ev.data); } catch { return; }
      if (d.type !== 'notify' || !d.n) return;
      setUnreadCount(c => c + 1);
      toast.info(d.n.title || 'New notification', { description: d.n.body || undefined });
    };
    return () => es.close();
  }, []);

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
          const showBadge = item.href === '/notifications' && unreadCount > 0;
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{ ...styles.navItem, ...(active ? styles.navItemActive : {}) }}>
                <Ico name={item.icon} size={16} />
                <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                {showBadge && (
                  <span style={{
                    minWidth: 18, height: 18, padding: '0 5px',
                    borderRadius: 9, background: 'var(--sev-critical)',
                    color: 'var(--paper)', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
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
