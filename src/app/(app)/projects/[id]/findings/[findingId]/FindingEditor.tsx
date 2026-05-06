'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Ico } from '@/components/chrome/icons';
import { Sev, StatusPill } from '@/components/ui/SevBadge';

// ── CVSS 3.1 ─────────────────────────────────────────────────────────────────
const CVSS_WEIGHTS = {
  AV:   { N: 0.85, A: 0.62, L: 0.55, P: 0.20 },
  AC:   { L: 0.77, H: 0.44 },
  PR_U: { N: 0.85, L: 0.62, H: 0.27 },
  PR_C: { N: 0.85, L: 0.68, H: 0.50 },
  UI:   { N: 0.85, R: 0.62 },
  C:    { N: 0.00, L: 0.22, H: 0.56 },
  I:    { N: 0.00, L: 0.22, H: 0.56 },
  A:    { N: 0.00, L: 0.22, H: 0.56 },
};
type CVSSVector = { AV:'N'|'A'|'L'|'P'; AC:'L'|'H'; PR:'N'|'L'|'H'; UI:'N'|'R'; S:'U'|'C'; C:'N'|'L'|'H'; I:'N'|'L'|'H'; A:'N'|'L'|'H' };
const DEFAULT_CVSS: CVSSVector = { AV:'N', AC:'L', PR:'N', UI:'N', S:'U', C:'N', I:'N', A:'N' };

function calcCVSS(v: CVSSVector): number {
  const av = CVSS_WEIGHTS.AV[v.AV], ac = CVSS_WEIGHTS.AC[v.AC];
  const pr = v.S === 'C' ? CVSS_WEIGHTS.PR_C[v.PR] : CVSS_WEIGHTS.PR_U[v.PR];
  const ui = CVSS_WEIGHTS.UI[v.UI];
  const c = CVSS_WEIGHTS.C[v.C], i = CVSS_WEIGHTS.I[v.I], a = CVSS_WEIGHTS.A[v.A];
  const iSS = 1 - (1-c)*(1-i)*(1-a);
  const impact = v.S === 'U' ? 6.42*iSS : 7.52*(iSS-0.029) - 3.25*Math.pow(iSS-0.02, 15);
  const exploitability = 8.22*av*ac*pr*ui;
  if (impact <= 0) return 0;
  const base = v.S === 'U' ? Math.min(impact+exploitability,10) : Math.min(1.08*(impact+exploitability),10);
  return Math.round(Math.ceil(base*10)/10*10)/10;
}

function parseVector(vec: string): Partial<CVSSVector> {
  const parts: Partial<CVSSVector> = {};
  vec.split('/').forEach(p => { const [k,v] = p.split(':'); if (k&&v) (parts as Record<string,string>)[k]=v; });
  return parts;
}

// ── Markdown → HTML ───────────────────────────────────────────────────────────
type EvidenceItem = { id: string; type: string; caption: string; content: string; filename: string };

function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const KW_COLORS: Record<string, string> = {
  js:'#8FB4FF', ts:'#8FB4FF', jsx:'#8FB4FF', tsx:'#8FB4FF',
  python:'#8FB4FF', py:'#8FB4FF', bash:'#FFD580', sh:'#FFD580',
  sql:'#FFD580', json:'#E6E6E6', html:'#F28B82', css:'#C8E1A6',
};

const KEYWORDS = [
  'function','const','let','var','if','else','for','while','return','import','export',
  'class','extends','async','await','try','catch','finally','new','delete','typeof',
  'instanceof','null','undefined','true','false','void','this','super','static',
  'def','print','from','in','is','not','and','or','pass','with','as','lambda',
  'SELECT','FROM','WHERE','INSERT','UPDATE','DELETE','CREATE','TABLE','JOIN','ON',
  'GROUP','ORDER','BY','HAVING','LIMIT','DISTINCT','INTO','VALUES','SET','DROP',
];

function highlightCode(escaped: string, lang: string): string {
  if (!lang || lang === 'text' || lang === 'plain') return escaped;
  let h = escaped;
  // strings — must go first (before keywords)
  h = h.replace(/(&quot;[^&\n]*&quot;|&#39;[^&\n]*&#39;|`[^`\n]*`)/g,
    '<span style="color:#C8E1A6">$1</span>');
  // keywords
  h = h.replace(new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'g'),
    `<span style="color:${KW_COLORS[lang] ?? '#8FB4FF'};font-weight:600">$1</span>`);
  // numbers
  h = h.replace(/\b(\d+\.?\d*)\b/g,
    '<span style="color:#E5C07B">$1</span>');
  // line comments
  h = h.replace(/(\/\/[^\n]*)|(#[^\n]*)/g,
    '<span style="color:#7A8390;font-style:italic">$1$2</span>');
  // block comments
  h = h.replace(/(\/\*[\s\S]*?\*\/)/g,
    '<span style="color:#7A8390;font-style:italic">$1</span>');
  return h;
}

function inlineHtml(text: string, evidence: EvidenceItem[]): string {
  // images first
  let h = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    let imgSrc = src;
    if (!src.startsWith('data:') && !src.startsWith('http')) {
      const ev = evidence.find(e => e.id === src || e.filename === src);
      imgSrc = ev?.content ?? '';
    }
    if (!imgSrc) return `<em>[image: ${escHtml(alt || src)}]</em>`;
    return `<span style="display:block;margin:6px 0"><img src="${imgSrc}" alt="${escHtml(alt)}" style="max-width:100%;border-radius:4px;border:1px solid var(--line-2);vertical-align:bottom" />${alt ? `<span style="display:block;font-size:11px;color:var(--ink-3);margin-top:3px">${escHtml(alt)}</span>` : ''}</span>`;
  });
  // links
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" style="color:var(--accent-blue);text-decoration:underline">$1</a>');
  // bold
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // italic
  h = h.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  h = h.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  // inline code
  h = h.replace(/`([^`\n]+)`/g,
    '<code style="font-family:\'IBM Plex Mono\',monospace;font-size:12px;background:rgba(255,255,255,.08);padding:1px 5px;border-radius:3px">$1</code>');
  return h;
}

function buildHtml(md: string, evidence: EvidenceItem[]): string {
  if (!md?.trim()) return '<p style="color:var(--ink-3);font-style:italic">Nothing written yet…</p>';

  const parts: string[] = [];
  const segments = md.split(/(```[\w]*\n?[\s\S]*?```)/g);

  for (const seg of segments) {
    const fence = seg.match(/^```([\w]*)\n?([\s\S]*?)```$/);
    if (fence) {
      const lang = fence[1] || '';
      const code = fence[2].trimEnd();
      const hl   = highlightCode(escHtml(code), lang);
      parts.push(
        `<pre style="background:#0F1115;color:#E6E6E6;font-family:'IBM Plex Mono',monospace;font-size:12.5px;line-height:1.55;padding:12px 16px;border-radius:6px;margin:8px 0;white-space:pre-wrap;word-break:break-word;overflow-x:auto">${lang ? `<div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#7A8390;margin-bottom:8px">${escHtml(lang)}</div>` : ''}${hl}</pre>`
      );
      continue;
    }

    // non-code: process line by line
    const lines = seg.split('\n');
    let i = 0;
    while (i < lines.length) {
      const raw  = lines[i];
      const line = raw.trim();

      if (!line) { i++; continue; }

      // headings
      const h3 = line.match(/^###\s+(.*)/);
      const h2 = line.match(/^##\s+(.*)/);
      const h1 = line.match(/^#\s+(.*)/);
      if (h3) { parts.push(`<h3 style="font-size:14px;font-weight:600;margin:14px 0 4px;color:var(--ink-0)">${inlineHtml(h3[1],evidence)}</h3>`); i++; continue; }
      if (h2) { parts.push(`<h2 style="font-size:16px;font-weight:700;margin:16px 0 4px;color:var(--ink-0);border-bottom:1px solid var(--line-1);padding-bottom:4px">${inlineHtml(h2[1],evidence)}</h2>`); i++; continue; }
      if (h1) { parts.push(`<h1 style="font-size:20px;font-weight:700;margin:18px 0 6px;color:var(--ink-0)">${inlineHtml(h1[1],evidence)}</h1>`); i++; continue; }

      // blockquote
      if (line.startsWith('> ')) {
        parts.push(`<blockquote style="border-left:3px solid var(--line-3);margin:6px 0;padding:4px 12px;color:var(--ink-2);font-style:italic">${inlineHtml(line.slice(2),evidence)}</blockquote>`);
        i++; continue;
      }

      // unordered list
      if (/^[-*+]\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
          items.push(`<li style="margin-bottom:3px">${inlineHtml(lines[i].trim().replace(/^[-*+]\s/,''),evidence)}</li>`);
          i++;
        }
        parts.push(`<ul style="margin:4px 0 8px 18px;padding:0">${items.join('')}</ul>`);
        continue;
      }

      // ordered list
      if (/^\d+[.)]\s/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trim())) {
          items.push(`<li style="margin-bottom:3px">${inlineHtml(lines[i].trim().replace(/^\d+[.)]\s/,''),evidence)}</li>`);
          i++;
        }
        parts.push(`<ol style="margin:4px 0 8px 18px;padding:0">${items.join('')}</ol>`);
        continue;
      }

      // paragraph (collect until blank line or special line)
      const paraLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^#{1,3}\s/.test(lines[i].trim()) &&
        !/^[-*+]\s/.test(lines[i].trim()) &&
        !/^\d+[.)]\s/.test(lines[i].trim()) &&
        !lines[i].trim().startsWith('> ') &&
        !lines[i].trim().startsWith('```')
      ) {
        paraLines.push(inlineHtml(lines[i].trim(), evidence));
        i++;
      }
      if (paraLines.length) {
        parts.push(`<p style="margin:0 0 8px;line-height:1.65">${paraLines.join('<br>')}</p>`);
      }
    }
  }

  return parts.join('') || '<p style="color:var(--ink-3);font-style:italic">Nothing written yet…</p>';
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Activity = { id: string; action: string; target: string; detail: string; createdAt: string; badge: string; user: { name: string; initials: string } };
type Finding = {
  id: string; title: string; severity: string; status: string;
  cvss: number; cvssVector: string; cwe: string; owasp: string; component: string;
  summary: string; description: string; reproduction: string;
  impact: string; remediation: string; references: string;
  activities: Activity[];
  assignee: { name: string; initials: string } | null;
};
type Props = { finding: Finding; assets: string[]; projectId: string };

const FIELD_TABS = ['Description', 'Reproduction', 'Impact', 'Remediation', 'References'] as const;
type FieldTab = typeof FIELD_TABS[number];
const FIELD_KEY: Record<FieldTab, keyof Finding> = {
  Description: 'description', Reproduction: 'reproduction',
  Impact: 'impact', Remediation: 'remediation', References: 'references',
};

export function FindingEditor({ finding, assets, projectId }: Props) {
  const [title,         setTitle]         = useState(finding.title);
  const [severity,      setSeverity]      = useState(finding.severity);
  const [severityOvr,   setSeverityOvr]   = useState(false);
  const [status,        setStatus]        = useState(finding.status);
  const [cwe,           setCwe]           = useState(finding.cwe);
  const [owasp,         setOwasp]         = useState(finding.owasp);
  const [component,     setComponent]     = useState(finding.component || '');
  const [description,   setDescription]   = useState(finding.description);
  const [reproduction,  setReproduction]  = useState(finding.reproduction);
  const [impact,        setImpact]        = useState(finding.impact);
  const [remediation,   setRemediation]   = useState(finding.remediation);
  const [references,    setReferences]    = useState(finding.references);
  const [affectedAssets,setAffectedAssets]= useState(Array.isArray(assets) ? assets.join('\n') : '');
  const [editorTab,     setEditorTab]     = useState<'Write'|'Preview'>('Write');
  const [fieldTab,      setFieldTab]      = useState<FieldTab>('Description');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [evidence,      setEvidence]      = useState<EvidenceItem[]>([]);
  const [uploading,     setUploading]     = useState(false);
  const [editCaption,   setEditCaption]   = useState<string|null>(null); // evidence id being edited
  const [captionVal,    setCaptionVal]    = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── CVSS ─────────────────────────────────────────────────────────────────
  const parsedVec = parseVector(finding.cvssVector);
  const [cvss, setCvss] = useState<CVSSVector>({ ...DEFAULT_CVSS, ...parsedVec });
  const cvssScore = useMemo(() => calcCVSS(cvss), [cvss]);

  useEffect(() => {
    if (severityOvr) return;
    const d = cvssScore>=9?'critical':cvssScore>=7?'high':cvssScore>=4?'medium':cvssScore>=0.1?'low':'info';
    setSeverity(d);
  }, [cvssScore, severityOvr]);

  // ── Load evidence from DB ─────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/findings/${finding.id}/evidence`)
      .then(r => r.json())
      .then(d => { if (d.evidence) setEvidence(d.evidence); })
      .catch(() => {});
  }, [finding.id]);

  // ── Field helpers ─────────────────────────────────────────────────────────
  const currentValue = useCallback(() => {
    if (fieldTab === 'Description') return description;
    if (fieldTab === 'Reproduction') return reproduction;
    if (fieldTab === 'Impact') return impact;
    if (fieldTab === 'Remediation') return remediation;
    return references;
  }, [fieldTab, description, reproduction, impact, remediation, references]);

  const setCurrentValue = useCallback((v: string) => {
    if (fieldTab === 'Description') setDescription(v);
    else if (fieldTab === 'Reproduction') setReproduction(v);
    else if (fieldTab === 'Impact') setImpact(v);
    else if (fieldTab === 'Remediation') setRemediation(v);
    else setReferences(v);
  }, [fieldTab]);

  // ── Insert text at cursor ─────────────────────────────────────────────────
  function insertAtCursor(text: string) {
    const ta = textareaRef.current;
    if (!ta) { setCurrentValue(currentValue() + text); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const val = currentValue();
    const next = val.slice(0, s) + text + val.slice(e);
    setCurrentValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + text.length, s + text.length);
    });
  }

  // ── Upload evidence file ──────────────────────────────────────────────────
  async function uploadEvidence(dataUrl: string, filename: string): Promise<EvidenceItem | null> {
    setUploading(true);
    try {
      const caption = filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      const res = await fetch(`/api/findings/${finding.id}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'screenshot', caption, content: dataUrl, filename }),
      });
      if (!res.ok) return null;
      const { evidence: ev } = await res.json();
      setEvidence(prev => [...prev, ev]);
      return ev;
    } catch { return null; }
    finally { setUploading(false); }
  }

  // ── Paste handler ─────────────────────────────────────────────────────────
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imgItem = Array.from(e.clipboardData.items).find(it => it.type.startsWith('image/'));
    if (!imgItem) return;
    e.preventDefault();
    const blob = imgItem.getAsFile(); if (!blob) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const n = evidence.length + 1;
      const uploaded = await uploadEvidence(dataUrl, `screenshot-${n}.png`);
      if (uploaded) {
        const ref = `\n![${uploaded.caption || `Screenshot ${n}`}](${uploaded.id})\n`;
        insertAtCursor(ref);
      }
    };
    reader.readAsDataURL(blob);
  }

  // ── File input upload ─────────────────────────────────────────────────────
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        await uploadEvidence(dataUrl, file.name);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  // ── Delete evidence ───────────────────────────────────────────────────────
  async function deleteEvidence(id: string) {
    await fetch(`/api/evidence/${id}`, { method: 'DELETE' });
    setEvidence(prev => prev.filter(e => e.id !== id));
  }

  // ── Update caption ────────────────────────────────────────────────────────
  async function saveCaption(id: string) {
    await fetch(`/api/evidence/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption: captionVal }),
    });
    setEvidence(prev => prev.map(e => e.id === id ? { ...e, caption: captionVal } : e));
    setEditCaption(null);
  }

  // ── Toolbar insert ────────────────────────────────────────────────────────
  const TOOLBAR = [
    { icon: 'bold',      label: 'Bold',       insert: '**bold**' },
    { icon: 'italic',    label: 'Italic',     insert: '*italic*' },
    { icon: 'heading',   label: 'Heading',    insert: '## Heading' },
    { icon: 'list',      label: 'Bullet list',insert: '- item\n- item\n- item' },
    { icon: 'codeblock', label: 'Code block', insert: '```bash\ncode here\n```' },
    { icon: 'quote',     label: 'Blockquote', insert: '> quote' },
  ];

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    try {
      await fetch(`/api/findings/${finding.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, severity, status, cwe, owasp, component,
          description, reproduction, impact, remediation, references,
          assets: affectedAssets.split('\n').map(a => a.trim()).filter(Boolean),
          cvss: cvssScore,
          cvssVector: `AV:${cvss.AV}/AC:${cvss.AC}/PR:${cvss.PR}/UI:${cvss.UI}/S:${cvss.S}/C:${cvss.C}/I:${cvss.I}/A:${cvss.A}`,
        }),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  const cvssColor = cvssScore>=9?'var(--sev-critical)':cvssScore>=7?'var(--sev-high)':cvssScore>=4?'var(--sev-medium)':cvssScore>0?'var(--sev-low)':'var(--ink-3)';
  const cvssLabel = cvssScore>=9?'Critical':cvssScore>=7?'High':cvssScore>=4?'Medium':cvssScore>=0.1?'Low':'None';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: 'column' }}>

      {/* Title */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line-1)', background: 'var(--bg-0)', flexShrink: 0 }}>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Finding title…"
          style={{ width:'100%', fontSize:18, fontWeight:500, color:'var(--ink-0)', background:'transparent', border:'none', outline:'none', fontFamily:'inherit' }}
        />
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── LEFT: Editor + Evidence ── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', borderRight:'1px solid var(--line-1)' }}>

          {/* Field tabs */}
          <div style={{ display:'flex', gap:0, padding:'0 16px', borderBottom:'1px solid var(--line-1)', background:'var(--bg-1)', flexShrink:0 }}>
            {FIELD_TABS.map(t => (
              <button key={t} onClick={() => setFieldTab(t)} style={{
                padding:'11px 13px', background:'transparent', border:'none',
                borderBottom: `2px solid ${fieldTab===t?'var(--ink-0)':'transparent'}`,
                color: fieldTab===t?'var(--ink-0)':'var(--ink-2)',
                fontSize:13, cursor:'pointer', marginBottom:-1, transition:'color .1s',
              }}>{t}</button>
            ))}
          </div>

          {/* Write / Preview + toolbar */}
          <div style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 16px', borderBottom:'1px solid var(--line-1)', background:'var(--bg-0)', flexShrink:0 }}>
            {(['Write','Preview'] as const).map(t => (
              <button key={t} onClick={() => setEditorTab(t)} style={{
                padding:'5px 10px', borderRadius:'var(--r-xs)',
                background: editorTab===t?'var(--bg-2)':'transparent',
                border: `1px solid ${editorTab===t?'var(--line-2)':'transparent'}`,
                color: editorTab===t?'var(--ink-0)':'var(--ink-2)',
                fontSize:12, cursor:'pointer', transition:'all .1s',
              }}>{t}</button>
            ))}
            <div style={{ flex:1 }} />
            {editorTab === 'Write' && (
              <div style={{ display:'flex', gap:2 }}>
                {TOOLBAR.map(({ icon, label, insert }) => (
                  <button key={icon} title={label} onClick={() => insertAtCursor('\n' + insert + '\n')}
                    style={{ width:26, height:26, borderRadius:'var(--r-xs)', border:'none', background:'transparent', color:'var(--ink-3)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Ico name={icon} size={13} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Textarea / Preview */}
          <div className="thin-scroll" style={{ flex:1, overflow:'auto', minHeight:0 }}>
            {editorTab === 'Write' ? (
              <textarea
                ref={textareaRef}
                value={currentValue()}
                onChange={e => setCurrentValue(e.target.value)}
                onPaste={handlePaste}
                placeholder={`Write ${fieldTab.toLowerCase()} in Markdown… (paste or drop screenshots)`}
                style={{
                  display:'block', width:'100%', height:'100%', minHeight:260,
                  padding:'20px 24px', background:'var(--bg-0)', border:'none', outline:'none',
                  color:'var(--ink-1)', fontFamily:'var(--font-mono)', fontSize:13.5,
                  lineHeight:1.75, resize:'none', boxSizing:'border-box',
                }}
              />
            ) : (
              <div
                className="md-preview"
                style={{ padding:'20px 28px', maxWidth:740, color:'var(--ink-0)', fontSize:14, lineHeight:1.7 }}
                dangerouslySetInnerHTML={{ __html: buildHtml(currentValue(), evidence) }}
              />
            )}
          </div>

          {/* ── Evidence Panel ── */}
          <div style={{ borderTop:'1px solid var(--line-1)', background:'var(--bg-1)', flexShrink:0 }}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px 8px' }}>
              <div className="eyebrow" style={{ fontSize:9, flex:1 }}>
                Evidence{evidence.length > 0 ? ` · ${evidence.length} item${evidence.length>1?'s':''}` : ''}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileInput} style={{ display:'none' }} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn btn-sm btn-ghost"
                style={{ height:24, padding:'0 8px', fontSize:11 }}
              >
                <Ico name="plus" size={11} />
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>

            {evidence.length === 0 ? (
              <div style={{ padding:'8px 16px 14px', color:'var(--ink-3)', fontSize:12 }}>
                Paste a screenshot with <kbd style={{ background:'var(--bg-3)', border:'1px solid var(--line-2)', borderRadius:3, padding:'0 4px', fontSize:11 }}>⌘V</kbd> in the editor, or click Upload.
                Use <code style={{ fontFamily:'var(--font-mono)', fontSize:11, background:'var(--bg-2)', padding:'0 4px', borderRadius:3 }}>![caption](evidence-id)</code> in Markdown to embed.
              </div>
            ) : (
              <div className="thin-scroll" style={{ display:'flex', gap:10, padding:'0 16px 14px', overflowX:'auto', paddingBottom:12 }}>
                {evidence.map((ev, idx) => (
                  <div key={ev.id} style={{
                    flexShrink:0, width:130, border:'1px solid var(--line-2)',
                    borderRadius:'var(--r-sm)', background:'var(--bg-0)', overflow:'hidden',
                    display:'flex', flexDirection:'column',
                  }}>
                    {/* Thumbnail */}
                    <div style={{ position:'relative', height:80, background:'var(--bg-2)', overflow:'hidden' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ev.content}
                        alt={ev.caption || ev.filename}
                        style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                      />
                      {/* Delete */}
                      <button
                        onClick={() => deleteEvidence(ev.id)}
                        style={{
                          position:'absolute', top:4, right:4,
                          width:18, height:18, borderRadius:'50%',
                          background:'rgba(0,0,0,.65)', border:'none', cursor:'pointer',
                          color:'#fff', fontSize:9, display:'flex', alignItems:'center', justifyContent:'center',
                        }}
                      >✕</button>
                    </div>

                    {/* Caption + copy ref */}
                    <div style={{ padding:'6px 7px', flex:1 }}>
                      {editCaption === ev.id ? (
                        <input
                          autoFocus
                          value={captionVal}
                          onChange={e => setCaptionVal(e.target.value)}
                          onBlur={() => saveCaption(ev.id)}
                          onKeyDown={e => { if (e.key==='Enter') saveCaption(ev.id); if (e.key==='Escape') setEditCaption(null); }}
                          style={{ width:'100%', fontSize:10, fontFamily:'var(--font-mono)', background:'var(--bg-2)', border:'1px solid var(--accent)', borderRadius:3, padding:'2px 4px', color:'var(--ink-0)', outline:'none' }}
                        />
                      ) : (
                        <div
                          onClick={() => { setEditCaption(ev.id); setCaptionVal(ev.caption || ''); }}
                          title="Click to edit caption"
                          style={{ fontSize:10, color:'var(--ink-2)', lineHeight:1.3, cursor:'text', wordBreak:'break-word', minHeight:16 }}
                        >
                          {ev.caption || <span style={{ color:'var(--ink-3)', fontStyle:'italic' }}>No caption</span>}
                        </div>
                      )}
                    </div>

                    {/* Insert reference button */}
                    <button
                      title={`Insert ![${ev.caption || 'screenshot'}](${ev.id})`}
                      onClick={() => {
                        const ref = `\n![${ev.caption || `Screenshot ${idx+1}`}](${ev.id})\n`;
                        insertAtCursor(ref);
                        if (editorTab !== 'Write') setEditorTab('Write');
                      }}
                      style={{
                        padding:'5px 7px', border:'none', borderTop:'1px solid var(--line-1)',
                        background:'transparent', cursor:'pointer', color:'var(--ink-2)',
                        fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', gap:4,
                        transition:'background .1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background='var(--bg-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                    >
                      <Ico name="copy" size={10} />
                      Insert ref
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Sidebar ── */}
        <div className="thin-scroll" style={{ width:310, flexShrink:0, overflowY:'auto', background:'var(--bg-1)', display:'flex', flexDirection:'column' }}>

          {/* Metadata */}
          <div style={{ padding:'18px 18px 14px' }}>
            <div className="eyebrow" style={{ marginBottom:14 }}>Metadata</div>
            <div style={{ display:'flex', flexDirection:'column', gap:11 }}>

              <div className="form-group">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                  <label className="form-label" style={{ margin:0 }}>Severity</label>
                  <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:10.5, color:severityOvr?'var(--ink-1)':'var(--ink-3)' }}>
                    <input type="checkbox" checked={severityOvr} onChange={e => setSeverityOvr(e.target.checked)} style={{ cursor:'pointer' }} />
                    Override
                  </label>
                </div>
                <select className="input" value={severity} onChange={e => setSeverity(e.target.value)} disabled={!severityOvr} style={{ width:'100%', opacity:severityOvr?1:0.6 }}>
                  {['critical','high','medium','low','info'].map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                  ))}
                </select>
                {!severityOvr && <div style={{ fontSize:10, color:'var(--ink-3)', marginTop:3, fontFamily:'var(--font-mono)' }}>Auto-synced from CVSS {cvssScore.toFixed(1)}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="input" value={status} onChange={e => setStatus(e.target.value)} style={{ width:'100%' }}>
                  {['open','in-progress','in-review','resolved','accepted'].map(s => (
                    <option key={s} value={s}>{s.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Component</label>
                <input className="input" value={component} onChange={e => setComponent(e.target.value)} placeholder="e.g. auth-service" style={{ width:'100%' }} />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div className="form-group">
                  <label className="form-label">CWE</label>
                  <input className="input" value={cwe} onChange={e => setCwe(e.target.value)} placeholder="CWE-79" style={{ width:'100%' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">OWASP</label>
                  <input className="input" value={owasp} onChange={e => setOwasp(e.target.value)} placeholder="A03:2021" style={{ width:'100%' }} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Affected Assets</label>
                <textarea className="input" value={affectedAssets} onChange={e => setAffectedAssets(e.target.value)} placeholder="One per line" style={{ width:'100%', fontFamily:'var(--font-mono)', fontSize:11, minHeight:72, resize:'vertical' }} />
              </div>
            </div>
          </div>

          <hr className="hr" />

          {/* CVSS Builder */}
          <div style={{ padding:'14px 18px' }}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:14 }}>
              <div className="eyebrow">CVSS 3.1</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:5 }}>
                <span className="serif" style={{ fontSize:26, fontWeight:700, color:cvssColor, lineHeight:1 }}>{cvssScore.toFixed(1)}</span>
                <span style={{ fontSize:11, color:cvssColor, fontFamily:'var(--font-mono)' }}>{cvssLabel}</span>
              </div>
            </div>

            <div style={{ height:3, borderRadius:100, background:'var(--bg-3)', marginBottom:14, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(cvssScore/10)*100}%`, background:cvssColor, borderRadius:100, transition:'all .3s' }} />
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              {([
                { key:'AV', label:'Attack Vector',    opts:[['N','Network'],['A','Adjacent'],['L','Local'],['P','Physical']] },
                { key:'AC', label:'Attack Complexity', opts:[['L','Low'],['H','High']] },
                { key:'PR', label:'Privileges Req.',   opts:[['N','None'],['L','Low'],['H','High']] },
                { key:'UI', label:'User Interaction',  opts:[['N','None'],['R','Required']] },
                { key:'S',  label:'Scope',             opts:[['U','Unchanged'],['C','Changed']] },
                { key:'C',  label:'Confidentiality',   opts:[['N','None'],['L','Low'],['H','High']] },
                { key:'I',  label:'Integrity',         opts:[['N','None'],['L','Low'],['H','High']] },
                { key:'A',  label:'Availability',      opts:[['N','None'],['L','Low'],['H','High']] },
              ] as Array<{key:keyof CVSSVector;label:string;opts:[string,string][]}> ).map(({ key, label, opts }) => (
                <div key={key}>
                  <div style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--ink-3)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:4 }}>{label}</div>
                  <div style={{ display:'flex', gap:3 }}>
                    {opts.map(([val, desc]) => (
                      <button key={val} onClick={() => setCvss(p => ({ ...p, [key]:val }))} title={desc} style={{
                        flex:1, height:24, borderRadius:'var(--r-xs)', border:'1px solid',
                        borderColor: cvss[key]===val?'var(--line-3)':'var(--line-1)',
                        background: cvss[key]===val?'var(--bg-3)':'var(--bg-0)',
                        color: cvss[key]===val?'var(--ink-0)':'var(--ink-3)',
                        fontSize:11, fontFamily:'var(--font-mono)', cursor:'pointer', transition:'all .1s',
                      }}>{val}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop:10, padding:'7px 9px', background:'var(--bg-0)', borderRadius:'var(--r-sm)', border:'1px solid var(--line-1)' }}>
              <span style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ink-3)', wordBreak:'break-all' }}>
                CVSS:3.1/AV:{cvss.AV}/AC:{cvss.AC}/PR:{cvss.PR}/UI:{cvss.UI}/S:{cvss.S}/C:{cvss.C}/I:{cvss.I}/A:{cvss.A}
              </span>
            </div>
          </div>

          <hr className="hr" />

          {/* Activity */}
          <div style={{ padding:'14px 18px' }}>
            <div className="eyebrow" style={{ marginBottom:12 }}>Activity</div>
            {finding.activities.length === 0 ? (
              <div style={{ fontSize:12, color:'var(--ink-3)', textAlign:'center', padding:'10px 0' }}>No activity yet</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
                {finding.activities.slice(0, 8).map(a => (
                  <div key={a.id} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <div style={{ width:22, height:22, borderRadius:'50%', background:'var(--bg-3)', border:'1px solid var(--line-1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:8, fontFamily:'var(--font-mono)', color:'var(--ink-2)' }}>
                      {a.user.initials || a.user.name.slice(0,2)}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, color:'var(--ink-1)', lineHeight:1.4 }}>
                        <span style={{ fontWeight:500 }}>{a.user.name}</span>{' '}{a.action}{' '}
                        <span style={{ color:'var(--ink-2)' }}>{a.target}</span>
                        {a.detail && <span style={{ color:'var(--ink-3)' }}> · {a.detail}</span>}
                      </div>
                      <div style={{ fontSize:10, color:'var(--ink-3)', fontFamily:'var(--font-mono)', marginTop:2 }}>
                        {new Date(a.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save */}
          <div style={{ padding:'14px 18px', borderTop:'1px solid var(--line-1)', background:'var(--bg-1)', position:'sticky', bottom:0, marginTop:'auto' }}>
            <button
              className={`btn ${saved?'':'btn-primary'}`}
              onClick={handleSave} disabled={saving}
              style={{ width:'100%', justifyContent:'center', background:saved?'rgba(143,201,122,0.15)':undefined, borderColor:saved?'rgba(143,201,122,0.3)':undefined, color:saved?'var(--status-resolved)':undefined }}
            >
              <Ico name={saved?'check':'save'} size={14} />
              {saving?'Saving…':saved?'Saved':'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
