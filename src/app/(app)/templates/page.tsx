/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { db } from '@/lib/db';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';
import { TemplatesGrid } from './TemplatesGrid';

export default async function TemplatesPage() {
  const allTemplates = await db.reportTemplate.findMany({ orderBy: { updatedAt: 'desc' } });
  const templates = allTemplates.filter((t) => t.name === 'Technical Report');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar
        breadcrumb={['Workspace', 'Templates']}
        title="Report templates"
        subtitle="LaTeX-backed deliverables"
        actions={
          <button className="btn btn-primary">
            <Ico name="plus" size={14} />
            New template
          </button>
        }
      />
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
        <TemplatesGrid templates={templates as any} />
      </div>
    </div>
  );
}
