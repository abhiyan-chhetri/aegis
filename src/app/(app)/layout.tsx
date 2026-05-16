import React from 'react';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/chrome/Sidebar';
import { ChromeOverlays } from '@/components/chrome/ChromeOverlays';
import { getSession } from '@/lib/auth';

// Inline script runs BEFORE React mounts so the theme attribute is set on
// <html> before first paint — prevents a brief dark flash on light-theme reload.
const THEME_SCRIPT = `
(function(){try{
  var t = localStorage.getItem('aegis.theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
}catch(e){}})();
`;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  // Redirect to login if not authenticated
  if (!session) {
    redirect('/login');
  }

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-0)' }}>
        <Sidebar user={session} />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {children}
        </main>
      </div>
      {/* Global theme toggle + shortcuts modal + chord shortcuts */}
      <ChromeOverlays />
    </>
  );
}
