export const dynamic = 'force-dynamic';
import React from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Topbar } from '@/components/chrome/Topbar';
import { PortfolioDashboard } from '@/components/dashboard/PortfolioDashboard';

export default async function PortfolioPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar title="Portfolio" breadcrumb={['Aegis', 'Portfolio']} />
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-0)' }}>
        <PortfolioDashboard />
      </div>
    </div>
  );
}
