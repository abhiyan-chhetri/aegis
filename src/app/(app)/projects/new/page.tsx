export const dynamic = 'force-dynamic';
import React from 'react';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { NewProjectForm } from './NewProjectForm';

export default async function NewProjectPage() {
  const [users, rawOwners] = await Promise.all([
    db.user.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true, team: true, email: true },
    }),
    // Collect unique assetOwner values from all existing findings + project assetOwners lists
    db.$queryRawUnsafe<{ assetOwner: string }[]>(
      `SELECT DISTINCT "assetOwner" FROM "Finding" WHERE "assetOwner" != '' ORDER BY "assetOwner"`
    ).catch(() => [] as { assetOwner: string }[]),
  ]);

  // Also pull from project-level assetOwners lists
  const projectOwnerRows = await db.$queryRawUnsafe<{ assetOwners: string }[]>(
    `SELECT COALESCE("assetOwners", '[]') as "assetOwners" FROM "Project"`
  ).catch(() => [] as { assetOwners: string }[]);

  const projectOwnerNames: string[] = [];
  for (const row of projectOwnerRows) {
    try {
      const arr = JSON.parse(row.assetOwners);
      if (Array.isArray(arr)) projectOwnerNames.push(...arr);
    } catch { /* skip */ }
  }

  const existingOwners = Array.from(new Set([
    ...rawOwners.map(r => r.assetOwner),
    ...projectOwnerNames,
  ])).sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        title="New Project"
        breadcrumb={['Aegis', 'Projects', 'New']}
        showSearch={false}
      />

      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '36px 28px' }}>
        <div style={{ maxWidth: 780, width: '100%' }}>

          {/* Page header */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Link href="/projects" className="btn btn-ghost btn-sm" style={{ padding: '0 8px', height: 26 }}>
                <Ico name="chevLeft" size={13} />
              </Link>
              <div className="eyebrow">New engagement</div>
            </div>
            <h2 className="serif" style={{ margin: 0, fontSize: 32, fontWeight: 400, color: 'var(--ink-0)', lineHeight: 1.1 }}>
              Create a project
            </h2>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Define the engagement details. You can add team members, findings and scope documents after creation.
            </p>
          </div>

          {/* Two-panel layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 32, alignItems: 'start' }}>

            {/* Form panel */}
            <div className="card" style={{ padding: '28px 28px 24px' }}>
              <NewProjectForm users={users} existingOwners={existingOwners} />
            </div>

            {/* Side tips */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ padding: '18px 18px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Ico name="info" size={14} style={{ color: 'var(--sev-low)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-0)' }}>Project codes</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                  Codes are auto-generated from the project name but can be customised. Use a consistent format like <span className="mono" style={{ fontSize: 11 }}>ACME-2601</span>.
                </p>
              </div>

              <div className="card" style={{ padding: '18px 18px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Ico name="target" size={14} style={{ color: 'var(--sev-medium)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-0)' }}>Scope guidance</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                  Include IP ranges, domains, applications, and any explicit out-of-scope items to align your team and the client.
                </p>
              </div>

              <div className="card" style={{ padding: '18px 18px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Ico name="user" size={14} style={{ color: 'var(--status-review)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-0)' }}>Assign a lead</span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                  The lead is responsible for oversight and report delivery. Additional team members can be added from the project settings page.
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--line-1)', paddingTop: 16 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>After creation</div>
                {[
                  { icon: 'findings', label: 'Add findings' },
                  { icon: 'team',     label: 'Assign team members' },
                  { icon: 'reports',  label: 'Generate a report' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 5, background: 'var(--bg-2)', border: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Ico name={item.icon} size={12} style={{ color: 'var(--ink-2)' }} />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
