'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Ico } from '@/components/chrome/icons';

type ReportTemplate = {
  id: string;
  name: string;
  audience: string;
  pages: string;
  tone: string;
  engine: string;
  updatedAt: string;
};

function TemplatePaperPreview({ audience }: { audience: string }) {
  return (
    <div style={{
      width: '100%', aspectRatio: '8.5 / 11',
      background: 'var(--paper)',
      borderRadius: '4px 4px 0 0',
      overflow: 'hidden',
      position: 'relative',
      padding: '14px 12px 12px',
      display: 'flex', flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ height: 1, background: 'var(--paper-rule)', marginBottom: 4 }} />
      <div style={{ height: 8, background: 'rgba(26,26,26,0.18)', borderRadius: 2, width: '72%' }} />
      <div style={{ height: 5, background: 'rgba(26,26,26,0.10)', borderRadius: 2, width: '50%' }} />
      <div style={{ height: 8 }} />
      <div style={{ height: 5, background: 'rgba(26,26,26,0.22)', borderRadius: 2, width: '40%' }} />
      {[95, 88, 92, 78, 90, 65, 88, 75].map((w, i) => (
        <div key={i} style={{ height: 3.5, background: 'rgba(26,26,26,0.09)', borderRadius: 1, width: `${w}%` }} />
      ))}
      <div style={{ height: 6 }} />
      <div style={{ height: 4, background: 'rgba(26,26,26,0.18)', borderRadius: 2, width: '35%' }} />
      {[82, 76, 88, 60].map((w, i) => (
        <div key={i} style={{ height: 3.5, background: 'rgba(26,26,26,0.09)', borderRadius: 1, width: `${w}%` }} />
      ))}
      <div style={{
        position: 'absolute', bottom: 10, right: 10,
        fontSize: 7, fontFamily: 'var(--font-mono)',
        color: 'rgba(26,26,26,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {audience}
      </div>
    </div>
  );
}

function PreviewModal({ t, onClose }: { t: ReportTemplate; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-1)', borderRadius: 'var(--r-lg)',
          border: '1px solid var(--line-2)',
          width: '90%', maxWidth: 800,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--line-1)' }}>
          <div>
            <div className="serif" style={{ fontSize: 18, fontWeight: 400, color: 'var(--ink-0)' }}>{t.name}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{t.audience} · {t.tone} · {t.pages} pages</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <Ico name="x" size={14} />
          </button>
        </div>
        {/* Preview body — paper simulation */}
        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 32, background: 'var(--bg-0)', display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: 595, background: 'var(--paper)', color: 'var(--paper-ink)',
            fontFamily: 'var(--font-serif)', boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
            minHeight: 842,
          }}>
            {/* Cover page */}
            <div style={{ padding: '60px 56px', borderBottom: '1px solid var(--paper-rule)', minHeight: 300, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(26,26,26,0.4)', marginBottom: 32 }}>CONFIDENTIAL</div>
                <div style={{ fontSize: 32, fontWeight: 300, lineHeight: 1.2, color: 'rgba(26,26,26,0.9)', marginBottom: 12 }}>{t.name}</div>
                <div style={{ fontSize: 14, color: 'rgba(26,26,26,0.5)', marginBottom: 4 }}>Security Assessment Report</div>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'rgba(26,26,26,0.35)' }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev, i) => (
                  <div key={sev} style={{
                    padding: '4px 10px', borderRadius: 3,
                    fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                    background: ['rgba(255,92,58,0.12)', 'rgba(245,165,36,0.12)', 'rgba(232,213,107,0.12)', 'rgba(127,179,213,0.12)'][i],
                    color: ['#ff5c3a', '#f5a524', '#b89f00', '#5590b5'][i],
                    border: `1px solid ${['rgba(255,92,58,0.25)', 'rgba(245,165,36,0.25)', 'rgba(232,213,107,0.25)', 'rgba(127,179,213,0.25)'][i]}`,
                  }}>
                    {sev}
                  </div>
                ))}
              </div>
            </div>
            {/* Sample section */}
            <div style={{ padding: '40px 56px' }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(26,26,26,0.4)', marginBottom: 10 }}>Executive Summary</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(26,26,26,0.7)', marginBottom: 24 }}>
                This report presents the findings of a {t.audience.toLowerCase()} penetration test conducted against the target environment. The assessment identified multiple vulnerabilities of varying severity, with recommendations for remediation prioritized by risk.
              </div>
              <div style={{ display: 'flex', gap: 1, marginBottom: 24 }}>
                {[['Critical', 2, '#ff5c3a'], ['High', 5, '#f5a524'], ['Medium', 8, '#b89f00'], ['Low', 4, '#5590b5'], ['Info', 3, '#aaa']].map(([label, n, color]) => (
                  <div key={label as string} style={{ flex: 1, padding: '10px 0', background: `${color}14`, borderTop: `2px solid ${color}`, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 300, color: color as string }}>{n}</div>
                    <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: color as string, opacity: 0.8, textTransform: 'uppercase' }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(26,26,26,0.4)', marginBottom: 10 }}>Methodology</div>
              {['Reconnaissance', 'Enumeration', 'Exploitation', 'Post-exploitation', 'Reporting'].map((phase, i) => (
                <div key={phase} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'rgba(26,26,26,0.3)', minWidth: 14 }}>{i + 1}</span>
                  <span style={{ fontSize: 12, color: 'rgba(26,26,26,0.7)' }}>{phase}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line-1)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Link href={`/templates/${t.id}/edit`} className="btn btn-primary" style={{ textDecoration: 'none' }}>
            <Ico name="pen" size={13} />
            Edit template
          </Link>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({ t }: { t: ReportTemplate }) {
  const [showPreview, setShowPreview] = useState(false);
  const updatedDate = new Date(t.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <>
      <div className="card card-hover" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ background: 'var(--bg-2)', padding: '16px 16px 0', borderBottom: '1px solid var(--line-1)' }}>
          <TemplatePaperPreview audience={t.audience} />
        </div>
        <div style={{ padding: '16px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <h3 className="serif" style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 400, color: 'var(--ink-0)', lineHeight: 1.3 }}>{t.name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 7px', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)', background: 'var(--bg-3)', color: 'var(--ink-2)', border: '1px solid var(--line-1)' }}>{t.audience}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t.pages} pages</span>
              <span style={{ color: 'var(--ink-4)', fontSize: 11 }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t.tone}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge mono" style={{ fontSize: 10 }}>{t.engine}</span>
          </div>
          <hr className="hr" />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Updated {updatedDate}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPreview(true)}>
                <Ico name="eye" size={12} />
                Preview
              </button>
              <Link href={`/templates/${t.id}/edit`} className="btn btn-sm" style={{ textDecoration: 'none' }}>
                <Ico name="pen" size={12} />
                Edit
              </Link>
            </div>
          </div>
        </div>
      </div>
      {showPreview && <PreviewModal t={t} onClose={() => setShowPreview(false)} />}
    </>
  );
}

export function TemplatesGrid({ templates }: { templates: ReportTemplate[] }) {
  if (templates.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12, color: 'var(--ink-3)' }}>
        <Ico name="templates" size={40} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 15 }}>No templates yet.</div>
        <button className="btn btn-primary" style={{ marginTop: 8 }}>
          <Ico name="plus" size={14} />
          Create first template
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
      {templates.map(t => <TemplateCard key={t.id} t={t} />)}
    </div>
  );
}
