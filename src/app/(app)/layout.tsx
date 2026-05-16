import React from 'react';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/chrome/Sidebar';
import { ChromeOverlays } from '@/components/chrome/ChromeOverlays';
import { getSession } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  // Redirect to login if not authenticated
  if (!session) {
    redirect('/login');
  }

  return (
    <>
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
