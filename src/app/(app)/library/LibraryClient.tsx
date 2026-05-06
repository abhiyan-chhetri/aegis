'use client';

import React, { useState, useRef } from 'react';
import { Ico } from '@/components/chrome/icons';
import { Sev } from '@/components/ui/SevBadge';

type VulnTemplate = {
  id: string;
  code: string;
  title: string;
  cwe: string;
  severity: string;
  owner: string;
  description: string;
  reproduction: string;
  impact: string;
  remediation: string;
  uses: number;
};

type Props = {
  templates: VulnTemplate[];
};

function SlideOver({ item, onClose }: { item: VulnTemplate; onClose: () => void }) {
  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 40,
          animation: 'fadeIn 0.15s ease',
        }}
      />
      {/* panel */}
      <div
        className="thin-scroll"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 520,
          background: 'var(--bg-1)', borderLeft: '1px solid var(--line-2)',
          boxShadow: 'var(--shadow-lg)', zIndex: 50,
          display: 'flex', flexDirection: 'column',
          animation: 'slideOverIn 0.22s cubic-bezier(0.25,0.8,0.25,1)',
        }}
      >
        {/* header */}
        <div style={{
          padding: '20px 24px 18px',
          borderBottom: '1px solid var(--line-1)',
          display: 'flex', alignItems: 'flex-start', gap: 14, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{item.code}</span>
              <Sev level={item.severity} size="sm" />
              {item.cwe && (
                <span className="badge mono">{item.cwe}</span>
              )}
            </div>
            <h2 className="serif" style={{ margin: 0, fontSize: 20, fontWeight: 400, color: 'var(--ink-0)', lineHeight: 1.3 }}>
              {item.title}
            </h2>
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px',
                borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)',
                background: 'var(--bg-3)', color: 'var(--ink-2)', border: '1px solid var(--line-1)',
              }}>
                {item.owner}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{item.uses} uses</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ width: 28, padding: 0, flexShrink: 0, marginTop: 2 }}
          >
            <Ico name="x" size={14} />
          </button>
        </div>

        {/* body */}
        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {item.description && (
            <section style={{ marginBottom: 28 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Description</div>
              <p style={{ margin: 0, color: 'var(--ink-1)', fontSize: 13.5, lineHeight: 1.7 }}>{item.description}</p>
            </section>
          )}
          {item.reproduction && (
            <section style={{ marginBottom: 28 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Reproduction</div>
              <pre style={{ margin: 0, fontSize: 12.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.reproduction}</pre>
            </section>
          )}
          {item.impact && (
            <section style={{ marginBottom: 28 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Impact</div>
              <p style={{ margin: 0, color: 'var(--ink-1)', fontSize: 13.5, lineHeight: 1.7 }}>{item.impact}</p>
            </section>
          )}
          {item.remediation && (
            <section style={{ marginBottom: 28 }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Remediation</div>
              <div style={{
                background: 'rgba(143,201,122,0.06)', border: '1px solid rgba(143,201,122,0.15)',
                borderRadius: 'var(--r-md)', padding: 16,
              }}>
                <p style={{ margin: 0, color: 'var(--ink-1)', fontSize: 13.5, lineHeight: 1.7 }}>{item.remediation}</p>
              </div>
            </section>
          )}
        </div>

        {/* footer */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid var(--line-1)',
          display: 'flex', gap: 8, flexShrink: 0,
        }}>
          <button className="btn btn-primary" style={{ flex: 1 }}>
            <Ico name="plus" size={14} />
            Use in finding
          </button>
          <button className="btn">
            <Ico name="pen" size={14} />
            Edit
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slideOverIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

export function LibraryClient({ templates }: Props) {
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [selected, setSelected] = useState<VulnTemplate | null>(null);

  const owners = Array.from(new Set(templates.map(t => t.owner))).sort();

  const filtered = templates.filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || t.cwe.toLowerCase().includes(q);
    const matchSev = sevFilter === 'all' || t.severity === sevFilter;
    const matchOwner = ownerFilter === 'all' || t.owner === ownerFilter;
    return matchSearch && matchSev && matchOwner;
  });

  const maxUses = Math.max(...templates.map(t => t.uses), 1);

  return (
    <>
      {/* Filters */}
      <div style={{
        padding: '14px 28px',
        borderBottom: '1px solid var(--line-1)',
        background: 'var(--bg-0)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ position: 'relative', flex: '0 0 260px' }}>
          <Ico name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }} />
          <input
            className="input"
            style={{ width: '100%', paddingLeft: 32 }}
            placeholder="Search templates…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input" style={{ width: 140 }} value={sevFilter} onChange={e => setSevFilter(e.target.value)}>
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>
        <select className="input" style={{ width: 140 }} value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
          <option value="all">All owners</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        <table className="tbl">
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-0)', zIndex: 10 }}>
            <tr>
              <th style={{ width: 90 }}>ID</th>
              <th>Title</th>
              <th style={{ width: 110 }}>Severity</th>
              <th style={{ width: 120 }}>CWE</th>
              <th style={{ width: 110 }}>Owner</th>
              <th style={{ width: 160 }}>Uses</th>
              <th style={{ width: 56 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-3)' }}>
                  No templates match your filters.
                </td>
              </tr>
            ) : filtered.map(t => (
              <tr
                key={t.id}
                onClick={() => setSelected(t)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{t.code}</span>
                </td>
                <td>
                  <span style={{ fontWeight: 500, color: 'var(--ink-0)' }}>{t.title}</span>
                </td>
                <td><Sev level={t.severity} size="sm" /></td>
                <td>
                  {t.cwe ? (
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{t.cwe}</span>
                  ) : (
                    <span style={{ color: 'var(--ink-4)' }}>—</span>
                  )}
                </td>
                <td>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px',
                    borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)',
                    background: 'var(--bg-3)', color: 'var(--ink-2)', border: '1px solid var(--line-1)',
                  }}>
                    {t.owner}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--bg-3)', borderRadius: 100, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 100,
                        width: `${(t.uses / maxUses) * 100}%`,
                        background: 'var(--ink-2)',
                      }} />
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', flexShrink: 0, minWidth: 24, textAlign: 'right' }}>{t.uses}</span>
                  </div>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: 28, padding: 0 }}
                    onClick={() => setSelected(t)}
                    title="Edit"
                  >
                    <Ico name="pen" size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && <SlideOver item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
