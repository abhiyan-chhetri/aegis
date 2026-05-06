'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Ico } from '@/components/chrome/icons';

type ReportTemplate = {
  id: string;
  name: string;
  audience: string;
  pages: string;
  tone: string;
  engine: string;
  source: string;
};

type Props = {
  template: ReportTemplate;
};

type Tab = 'source' | 'sections' | 'variables';

const SECTIONS = [
  { key: 'cover',       label: 'Cover page',          description: 'Title, client, date, classification' },
  { key: 'exec',        label: 'Executive summary',    description: 'High-level findings and risk posture' },
  { key: 'methodology', label: 'Scope & Methodology',  description: 'Scope, approach, testing phases' },
  { key: 'overview',    label: 'Findings overview',    description: 'Severity chart and summary table' },
  { key: 'detailed',    label: 'Detailed findings',    description: 'Per-finding detail pages' },
  { key: 'appendix',    label: 'Appendix',             description: 'Raw output, evidence, references' },
];

const CSS_VARS = [
  { name: '--paper',     desc: 'Page background color',        group: 'Colors' },
  { name: '--paper-alt', desc: 'Alternate/header background',  group: 'Colors' },
  { name: '--ink',       desc: 'Primary text color',           group: 'Colors' },
  { name: '--muted',     desc: 'Secondary/muted text',         group: 'Colors' },
  { name: '--rule',      desc: 'Divider/rule line color',      group: 'Colors' },
  { name: '--brand',     desc: 'Accent/brand color',           group: 'Colors' },
  { name: '--sev-c',     desc: 'Critical severity color',      group: 'Severity' },
  { name: '--sev-h',     desc: 'High severity color',          group: 'Severity' },
  { name: '--sev-m',     desc: 'Medium severity color',        group: 'Severity' },
  { name: '--sev-l',     desc: 'Low severity color',           group: 'Severity' },
  { name: '--sev-i',     desc: 'Info severity color',          group: 'Severity' },
];

const CSS_CLASSES = [
  { name: '.rpt-page',         desc: 'Report page / paper container',    group: 'Layout' },
  { name: '.rpt-run',          desc: 'Header / footer run strip',         group: 'Layout' },
  { name: '.rpt-section-head', desc: 'Section heading with rule line',    group: 'Layout' },
  { name: '.rpt-chip',         desc: 'Severity badge chip',               group: 'Components' },
  { name: '.rpt-codeblock',    desc: 'Dark terminal code block (PoC)',    group: 'Components' },
  { name: '.rpt-callout',      desc: 'Callout / info box',                group: 'Components' },
  { name: '.rpt-finding-meta', desc: 'Finding metadata strip',            group: 'Components' },
  { name: '.rpt-data-table',   desc: 'Scope / data table',               group: 'Components' },
  { name: '.rpt-bracket-title','desc': 'Cover page bracketed title',      group: 'Cover' },
  { name: '.rpt-toc-list',     desc: 'Table of contents list',            group: 'Cover' },
];

function LineNumberGutter({ lineCount }: { lineCount: number }) {
  return (
    <div style={{
      width: 48, flexShrink: 0,
      background: 'var(--bg-2)',
      borderRight: '1px solid var(--line-1)',
      padding: '14px 0',
      overflowY: 'hidden',
      userSelect: 'none',
    }}>
      {Array.from({ length: lineCount }, (_, i) => (
        <div key={i} style={{
          height: '1.6em',
          lineHeight: '1.6em',
          textAlign: 'right',
          paddingRight: 10,
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink-4)',
        }}>
          {i + 1}
        </div>
      ))}
    </div>
  );
}

function buildPreviewDoc(css: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#e8e4dc;display:flex;justify-content:center;padding:24px;font-family:Georgia,serif;}
${css}
</style>
</head>
<body>
<div class="rpt-page" style="width:595px;min-height:842px;padding:56px;background:var(--paper,#F5F1EA);color:var(--ink,#1A1714);position:relative;">
  <!-- Header run -->
  <div class="rpt-run top" style="display:flex;justify-content:space-between;align-items:center;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted,#8A817A);border-bottom:1px solid var(--rule,#D9D1C2);padding-bottom:10px;margin-bottom:40px;">
    <span>CONFIDENTIAL</span>
    <span>Technical Report</span>
  </div>

  <!-- Bracket title -->
  <div class="rpt-bracket-title" style="font-size:28px;font-weight:300;color:var(--ink,#1A1714);margin-bottom:32px;padding-left:16px;border-left:3px solid var(--brand,#D8232A);">
    Pentest Report<br/><span style="font-size:14px;color:var(--muted,#8A817A);">ACME Corp · Q1-2025</span>
  </div>

  <!-- Severity chips -->
  <div style="display:flex;gap:8px;margin-bottom:32px;flex-wrap:wrap;">
    <span class="rpt-chip critical" style="padding:4px 10px;border-radius:3px;font-size:9px;font-family:monospace;letter-spacing:0.08em;background:rgba(216,35,42,0.12);color:var(--brand,#D8232A);border:1px solid rgba(216,35,42,0.3);">CRITICAL</span>
    <span class="rpt-chip high" style="padding:4px 10px;border-radius:3px;font-size:9px;font-family:monospace;letter-spacing:0.08em;background:rgba(245,165,36,0.12);color:#f5a524;border:1px solid rgba(245,165,36,0.25);">HIGH</span>
    <span class="rpt-chip medium" style="padding:4px 10px;border-radius:3px;font-size:9px;font-family:monospace;letter-spacing:0.08em;background:rgba(232,213,107,0.12);color:#b89f00;border:1px solid rgba(232,213,107,0.3);">MEDIUM</span>
    <span class="rpt-chip low" style="padding:4px 10px;border-radius:3px;font-size:9px;font-family:monospace;letter-spacing:0.08em;background:rgba(127,179,213,0.12);color:#5590b5;border:1px solid rgba(127,179,213,0.25);">LOW</span>
  </div>

  <!-- Section heading -->
  <div class="rpt-section-head" style="display:flex;align-items:center;gap:12px;margin:24px 0 14px;">
    <span class="txt" style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:var(--ink,#1A1714);white-space:nowrap;">Executive Summary</span>
    <span class="line" style="flex:1;height:1px;background:var(--rule,#D9D1C2);display:block;"></span>
  </div>
  <p style="font-size:12px;line-height:1.8;color:var(--ink,#1A1714);margin-bottom:16px;">
    Over two weeks, a grey-box penetration test was conducted against the web application and supporting APIs. The assessment identified 3 critical and 5 high severity vulnerabilities including authentication bypass and SQL injection.
  </p>

  <!-- Section heading -->
  <div class="rpt-section-head" style="display:flex;align-items:center;gap:12px;margin:24px 0 14px;">
    <span class="txt" style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:var(--ink,#1A1714);white-space:nowrap;">Proof of Concept</span>
    <span class="line" style="flex:1;height:1px;background:var(--rule,#D9D1C2);display:block;"></span>
  </div>
  <pre class="rpt-codeblock" style="background:#17191C;color:#E2E4E7;font-family:monospace;font-size:11px;line-height:1.6;padding:14px 16px;border-radius:4px;overflow-x:auto;margin-bottom:16px;">POST /api/auth/login HTTP/1.1
Host: app.example.com

{"username":"admin'--","password":"x"}

HTTP/1.1 200 OK
{"token":"eyJhbGciOiJIUzI1NiJ9..."}</pre>

  <!-- Footer run -->
  <div class="rpt-run bot" style="display:flex;justify-content:space-between;align-items:center;font-size:9px;letter-spacing:0.08em;color:var(--muted,#8A817A);border-top:1px solid var(--rule,#D9D1C2);padding-top:10px;margin-top:40px;">
    <span>Aegis Security</span>
    <span>Page 1</span>
  </div>
</div>
</body>
</html>`;
}

export function TemplateEditorClient({ template }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('source');
  const [source, setSource] = useState(template.source || '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [enabledSections, setEnabledSections] = useState<Record<string, boolean>>(
    Object.fromEntries(SECTIONS.map(s => [s.key, true]))
  );
  const [varSearch, setVarSearch] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const lineCount = source.split('\n').length;

  // Extract just the CSS (strip <style> tags if present)
  const extractedCSS = React.useMemo(() => {
    const trimmed = source.trim();
    const match = trimmed.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    return match ? match[1] : trimmed;
  }, [source]);

  // Live-update iframe when CSS changes
  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    const doc = buildPreviewDoc(extractedCSS);
    frame.srcdoc = doc; // direct DOM prop, not React prop — OK here
  }, [extractedCSS]);

  const handleSourceChange = (val: string) => {
    setSource(val);
    setDirty(true);
    setSavedOk(false);
  };

  const insertAtCursor = useCallback((text: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newVal = source.slice(0, start) + text + source.slice(end);
    setSource(newVal);
    setDirty(true);
    setSavedOk(false);
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + text.length;
      el.focus();
    }, 0);
  }, [source]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      if (res.ok) {
        setDirty(false);
        setSavedOk(true);
        setTimeout(() => setSavedOk(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  const allVars = [...CSS_VARS, ...CSS_CLASSES];
  const filtered = allVars.filter(v =>
    !varSearch ||
    v.name.toLowerCase().includes(varSearch.toLowerCase()) ||
    v.desc.toLowerCase().includes(varSearch.toLowerCase())
  );
  const groups = Array.from(new Set(filtered.map(v => v.group)));

  const TABS: { key: Tab; label: string }[] = [
    { key: 'source',    label: 'CSS source' },
    { key: 'sections',  label: 'Sections' },
    { key: 'variables', label: 'Reference' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Tab bar */}
      <div className="tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
          {savedOk && (
            <span style={{ fontSize: 12, color: 'var(--ok)', fontFamily: 'var(--font-mono)' }}>
              Saved ✓
            </span>
          )}
          <button
            className="btn btn-primary btn-sm"
            disabled={!dirty || saving}
            onClick={handleSave}
          >
            <Ico name="save" size={13} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Source tab */}
      {activeTab === 'source' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Editor pane */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', borderRight: '1px solid var(--line-1)' }}>
              <LineNumberGutter lineCount={lineCount} />
              <textarea
                ref={textareaRef}
                className="thin-scroll"
                value={source}
                onChange={e => handleSourceChange(e.target.value)}
                spellCheck={false}
                style={{
                  flex: 1,
                  resize: 'none',
                  border: 'none',
                  outline: 'none',
                  background: 'var(--bg-1)',
                  color: 'var(--ink-0)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  padding: '14px 20px',
                  overflowY: 'auto',
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                  tabSize: 2,
                }}
              />
            </div>

            {/* Live HTML preview pane */}
            <div style={{
              flex: 1, overflow: 'hidden',
              background: 'var(--bg-0)',
              borderRight: '1px solid var(--line-1)',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line-1)', fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', background: 'var(--bg-2)' }}>
                Live preview · updates as you type
              </div>
              <iframe
                ref={iframeRef}
                title="Report CSS preview"
                sandbox="allow-same-origin"
                style={{ flex: 1, border: 'none', width: '100%' }}
                srcDoc={buildPreviewDoc(extractedCSS)}
              />
            </div>

            {/* Sidebar: CSS snippets */}
            <div className="thin-scroll" style={{
              width: 240, flexShrink: 0,
              background: 'var(--bg-0)',
              overflowY: 'auto',
              padding: '14px 0',
              borderLeft: '1px solid var(--line-1)',
            }}>
              <div className="eyebrow" style={{ padding: '0 16px', marginBottom: 12 }}>Insert snippet</div>
              {[
                [':root {', 'CSS variables block'],
                ['.rpt-chip.critical {', 'Critical chip style'],
                ['.rpt-section-head {', 'Section heading'],
                ['.rpt-codeblock {', 'Code / PoC block'],
                ['.rpt-page {', 'Page container'],
                ['.rpt-run.top {', 'Header strip'],
                ['.rpt-run.bot {', 'Footer strip'],
                ['.rpt-finding-meta {', 'Finding meta strip'],
                ['.rpt-data-table {', 'Scope data table'],
                ['.rpt-bracket-title {', 'Cover bracket title'],
              ].map(([snippet, label]) => (
                <button
                  key={snippet}
                  onClick={() => insertAtCursor(`\n${snippet}\n\n}\n`)}
                  style={{
                    width: '100%', display: 'flex', flexDirection: 'column',
                    padding: '6px 16px', background: 'transparent', border: 'none',
                    cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-0)', fontWeight: 500 }}>{snippet}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 1 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Status bar */}
          <div style={{
            height: 28, flexShrink: 0,
            borderTop: '1px solid var(--line-1)',
            background: 'var(--bg-2)',
            display: 'flex', alignItems: 'center',
            padding: '0 16px', gap: 20,
          }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              {template.name.toLowerCase().replace(/\s+/g, '-')}.css
            </span>
            <span style={{ color: 'var(--line-2)' }}>|</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{lineCount} lines</span>
            <span style={{ color: 'var(--line-2)' }}>|</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>HTML · CSS</span>
            {dirty && (
              <>
                <span style={{ color: 'var(--line-2)' }}>|</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--accent)' }}>unsaved changes</span>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'sections' && (
        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
          <div style={{ maxWidth: 600 }}>
            <div style={{ marginBottom: 24 }}>
              <div className="serif" style={{ fontSize: 18, fontWeight: 400, color: 'var(--ink-0)', marginBottom: 6 }}>Report sections</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>Toggle which sections are included in this template.</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {SECTIONS.map((section, idx) => (
                <div
                  key={section.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 18px',
                    background: enabledSections[section.key] ? 'var(--bg-2)' : 'transparent',
                    border: `1px solid ${enabledSections[section.key] ? 'var(--line-2)' : 'var(--line-1)'}`,
                    borderRadius: 'var(--r-md)',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                  onClick={() => {
                    setEnabledSections(prev => ({ ...prev, [section.key]: !prev[section.key] }));
                    setDirty(true);
                  }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 'var(--r-xs)',
                    border: `1.5px solid ${enabledSections[section.key] ? 'var(--ink-0)' : 'var(--line-2)'}`,
                    background: enabledSections[section.key] ? 'var(--ink-0)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, transition: 'all 0.12s',
                  }}>
                    {enabledSections[section.key] && (
                      <Ico name="check" size={13} style={{ color: 'var(--bg-0)' }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, color: enabledSections[section.key] ? 'var(--ink-0)' : 'var(--ink-2)', fontSize: 13.5 }}>
                      {section.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>{section.description}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', flexShrink: 0 }}>
                    §{idx + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'variables' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--line-1)' }}>
            <div style={{ position: 'relative', maxWidth: 300 }}>
              <Ico name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)', pointerEvents: 'none' }} />
              <input
                className="input"
                style={{ width: '100%', paddingLeft: 32 }}
                placeholder="Filter CSS vars & classes…"
                value={varSearch}
                onChange={e => setVarSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            <table className="tbl">
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-0)' }}>
                <tr>
                  <th>Name</th>
                  <th>Group</th>
                  <th>Description</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {groups.map(group => filtered.filter(v => v.group === group).map(v => (
                  <tr key={v.name}>
                    <td><span className="mono" style={{ fontSize: 12, color: 'var(--ink-0)' }}>{v.name}</span></td>
                    <td><span className="badge">{v.group}</span></td>
                    <td style={{ color: 'var(--ink-2)' }}>{v.desc}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setActiveTab('source'); insertAtCursor(v.name); }}
                        title="Insert into editor"
                      >
                        <Ico name="code" size={12} />
                        Insert
                      </button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
