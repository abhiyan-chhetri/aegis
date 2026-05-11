'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Ico } from '@/components/chrome/icons';
import { LivePresence } from '@/components/collab/LivePresence';
import { FindingComments } from './FindingComments';
import { ScreenshotAnnotator } from './ScreenshotAnnotator';

// ── AI Generation Overlay ─────────────────────────────────────────────────────
type AIPhase = 'idle' | 'thinking' | 'writing' | 'done';

function AIOverlay({ phase, onClose }: { phase: AIPhase; onClose: () => void }) {
  const [dots, setDots] = useState('');
  const [particle, setParticle] = useState<Array<{ id: number; x: number; y: number; angle: number }>>([]);

  useEffect(() => {
    if (phase === 'idle') return;
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 480);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'thinking' && phase !== 'writing') return;
    const id = setInterval(() => {
      setParticle(prev => [
        ...prev.slice(-12),
        { id: Date.now(), x: 30 + Math.random() * 40, y: 30 + Math.random() * 40, angle: Math.random() * 360 },
      ]);
    }, 200);
    return () => clearInterval(id);
  }, [phase]);

  if (phase === 'idle') return null;

  const PHASE_MSGS: Record<AIPhase, string> = {
    idle: '',
    thinking: 'Analysing vulnerability',
    writing: 'Writing professional report',
    done: 'Complete',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(10,11,13,0.88)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 24,
    }}>
      {/* Animated orb */}
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        {/* Pulsing rings */}
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '1px solid rgba(91,155,213,0.3)',
            animation: `aiRing ${1.2 + i * 0.4}s ease-out infinite`,
            animationDelay: `${i * 0.3}s`,
          }} />
        ))}
        {/* Core */}
        <div style={{
          position: 'absolute', inset: '20%', borderRadius: '50%',
          background: 'linear-gradient(135deg, #5B9BD5 0%, #8FC97A 50%, #c9a8f5 100%)',
          animation: 'aiCore 3s ease-in-out infinite',
          boxShadow: '0 0 40px rgba(91,155,213,0.5), 0 0 80px rgba(143,201,122,0.2)',
        }} />
        {/* Particles */}
        {particle.map(p => (
          <div key={p.id} style={{
            position: 'absolute',
            left: `${p.x}%`, top: `${p.y}%`,
            width: 4, height: 4, borderRadius: '50%',
            background: p.angle % 3 === 0 ? '#5B9BD5' : p.angle % 3 === 1 ? '#8FC97A' : '#c9a8f5',
            opacity: 0.8,
            transform: `rotate(${p.angle}deg) translateY(-${20 + Math.random() * 20}px)`,
            animation: 'aiParticle 0.8s ease-out forwards',
          }} />
        ))}
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontSize: 16, fontWeight: 600, color: '#f4f1ea',
          fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
        }}>
          {PHASE_MSGS[phase]}{dots}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(244,241,234,0.45)', marginTop: 8 }}>
          {phase === 'thinking' ? 'AI is analysing the vulnerability details' :
           phase === 'writing' ? 'Generating professional pentest report sections' :
           'All fields populated'}
        </div>
      </div>

      {phase === 'done' && (
        <button onClick={onClose} className="btn btn-primary" style={{ marginTop: 8 }}>
          <Ico name="check" size={14} /> View results
        </button>
      )}

      <style>{`
        @keyframes aiRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes aiCore {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.08) rotate(180deg); }
        }
        @keyframes aiParticle {
          0% { opacity: 0.9; transform: scale(1); }
          100% { opacity: 0; transform: scale(0) translateY(-30px); }
        }
      `}</style>
    </div>
  );
}

// Animate text into a setter with a typing effect
async function typeText(text: string, setter: (v: string) => void, speed = 6): Promise<void> {
  for (let i = 0; i <= text.length; i += speed) {
    setter(text.slice(0, i));
    await new Promise(r => setTimeout(r, 10));
  }
  setter(text); // ensure final value is exact
}

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
  const pr = v.S==='C' ? CVSS_WEIGHTS.PR_C[v.PR] : CVSS_WEIGHTS.PR_U[v.PR];
  const ui = CVSS_WEIGHTS.UI[v.UI];
  const c = CVSS_WEIGHTS.C[v.C], i = CVSS_WEIGHTS.I[v.I], a = CVSS_WEIGHTS.A[v.A];
  const iSS = 1-(1-c)*(1-i)*(1-a);
  const impact = v.S==='U' ? 6.42*iSS : 7.52*(iSS-0.029)-3.25*Math.pow(iSS-0.02,15);
  const exp    = 8.22*av*ac*pr*ui;
  if (impact<=0) return 0;
  const base = v.S==='U' ? Math.min(impact+exp,10) : Math.min(1.08*(impact+exp),10);
  return Math.round(Math.ceil(base*10)/10*10)/10;
}
function parseVector(vec: string): Partial<CVSSVector> {
  const p: Partial<CVSSVector> = {};
  vec.split('/').forEach(s => { const [k,v]=s.split(':'); if(k&&v)(p as Record<string,string>)[k]=v; });
  return p;
}

// ── Markdown → HTML (for preview panel) ──────────────────────────────────────
type EvidenceItem = { id: string; type: string; caption: string; content: string; filename: string };

function escH(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const KEYWORDS = ['function','const','let','var','if','else','for','while','return','import','export','class','extends','async','await','try','catch','finally','new','delete','typeof','instanceof','null','undefined','true','false','void','this','super','static','def','print','from','in','is','not','and','or','pass','with','as','lambda','SELECT','FROM','WHERE','INSERT','UPDATE','DELETE','CREATE','TABLE','JOIN','ON','GROUP','ORDER','BY','HAVING','LIMIT'];

// Apply a replacer fn only to text nodes — never inside HTML tag attribute strings.
// Safe because escH() has already encoded < > in user code, so every literal < is a generated tag.
function outsideTags(html: string, fn: (t: string) => string): string {
  return html.replace(/(<[^>]*>|[^<]+)/g, m => m[0] === '<' ? m : fn(m));
}

function hlCode(esc: string, lang: string): string {
  if (!lang || lang === 'text') return esc;
  let h = esc;
  // ① comments FIRST — before any spans with #RRGGBB are introduced
  h = h.replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#7A8390;font-style:italic">$1</span>');
  h = h.replace(/(\/\/[^\n]+)/g, '<span style="color:#7A8390;font-style:italic">$1</span>');
  // # shell/python: only at line-start (^ + gm) — never mid-line color codes
  h = h.replace(/^([ \t]*#[^\n]*)/gm, '<span style="color:#7A8390;font-style:italic">$1</span>');
  // ② strings
  h = h.replace(/(&quot;[^&\n]*&quot;|&#39;[^&\n]*&#39;|`[^`\n]*`)/g, '<span style="color:#C8E1A6">$1</span>');
  // ③ keywords — outsideTags so we never match inside style="…font-weight:600…"
  const kwRe = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'g');
  h = outsideTags(h, t => t.replace(kwRe, '<span style="color:#8FB4FF;font-weight:600">$1</span>'));
  // ④ numbers — outsideTags so we never corrupt 600 inside font-weight:600"
  h = outsideTags(h, t => t.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#E5C07B">$1</span>'));
  return h;
}

function inlineH(text: string, ev: EvidenceItem[]): string {
  let h = text;
  // images
  h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m,alt,src) => {
    let imgSrc = src;
    if (!src.startsWith('data:')&&!src.startsWith('http')) {
      const e = ev.find(e=>e.id===src||e.filename===src);
      imgSrc = e?.content ?? '';
    }
    if (!imgSrc) return `<em style="color:var(--ink-3)">[figure: ${escH(alt||src)}]</em>`;
    return `<span style="display:block;margin:6px 0"><img src="${imgSrc}" alt="${escH(alt)}" style="max-width:100%;border-radius:4px;border:1px solid var(--line-2)" />${alt?`<span style="display:block;font-size:11px;color:var(--ink-3);margin-top:3px">${escH(alt)}</span>`:''}</span>`;
  });
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" style="color:#5B9BD5;text-decoration:underline">$1</a>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
  h = h.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
  h = h.replace(/_([^_\n]+)_/g,'<em>$1</em>');
  h = h.replace(/`([^`\n]+)`/g,'<code style="font-family:\'IBM Plex Mono\',monospace;font-size:12px;background:rgba(255,255,255,.1);padding:1px 5px;border-radius:3px">$1</code>');
  return h;
}

function buildHtml(md: string, evidence: EvidenceItem[]): string {
  if (!md?.trim()) return '<p style="color:var(--ink-3);font-style:italic;padding:4px 0">Nothing written yet…</p>';
  const parts: string[] = [];
  const segs = md.split(/(```[\w]*\n?[\s\S]*?```)/g);

  for (const seg of segs) {
    const fence = seg.match(/^```([\w]*)\n?([\s\S]*?)```$/);
    if (fence) {
      const lang = fence[1]||'';
      const hl   = hlCode(escH(fence[2].trimEnd()), lang);
      parts.push(`<pre style="background:#0F1115;color:#E6E6E6;font-family:'IBM Plex Mono',monospace;font-size:12.5px;line-height:1.55;padding:12px 16px;border-radius:6px;margin:8px 0;white-space:pre-wrap;word-break:break-word">${lang?`<div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#7A8390;margin-bottom:8px">${escH(lang)}</div>`:''}${hl}</pre>`);
      continue;
    }

    const lines = seg.split('\n');
    let i = 0;
    while (i < lines.length) {
      const raw = lines[i], line = raw.trim();
      if (!line) { i++; continue; }

      // headings
      let m: RegExpMatchArray|null;
      if ((m=line.match(/^###\s+(.*)/))) { parts.push(`<h3 style="font-size:14px;font-weight:600;margin:14px 0 4px;color:var(--ink-0)">${inlineH(m[1],evidence)}</h3>`); i++; continue; }
      if ((m=line.match(/^##\s+(.*)/)))  { parts.push(`<h2 style="font-size:16px;font-weight:700;margin:16px 0 4px;color:var(--ink-0);border-bottom:1px solid var(--line-1);padding-bottom:4px">${inlineH(m[1],evidence)}</h2>`); i++; continue; }
      if ((m=line.match(/^#\s+(.*)/)))   { parts.push(`<h1 style="font-size:20px;font-weight:700;margin:18px 0 6px;color:var(--ink-0)">${inlineH(m[1],evidence)}</h1>`); i++; continue; }

      // blockquote
      if (line.startsWith('> ')) { parts.push(`<blockquote style="border-left:3px solid var(--line-3);margin:6px 0;padding:4px 12px;color:var(--ink-2);font-style:italic">${inlineH(line.slice(2),evidence)}</blockquote>`); i++; continue; }

      // unordered list
      if (/^[-*+]\s/.test(line)) {
        const items: string[] = [];
        while (i<lines.length && /^[-*+]\s/.test(lines[i].trim())) {
          items.push(`<li style="margin-bottom:3px">${inlineH(lines[i].trim().replace(/^[-*+]\s/,''),evidence)}</li>`);
          i++;
        }
        parts.push(`<ul style="margin:4px 0 8px 18px;padding:0">${items.join('')}</ul>`);
        continue;
      }

      // ordered list
      if (/^\d+[.)]\s/.test(line)) {
        const items: string[] = [];
        while (i<lines.length && /^\d+[.)]\s/.test(lines[i].trim())) {
          items.push(`<li style="margin-bottom:3px">${inlineH(lines[i].trim().replace(/^\d+[.)]\s/,''),evidence)}</li>`);
          i++;
        }
        parts.push(`<ol style="margin:4px 0 8px 18px;padding:0">${items.join('')}</ol>`);
        continue;
      }

      // standalone image line
      if ((m=line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/))) {
        const [,alt,src] = m;
        let imgSrc = src;
        if (!src.startsWith('data:')&&!src.startsWith('http')) {
          const e = evidence.find(e=>e.id===src||e.filename===src);
          imgSrc = e?.content ?? '';
        }
        if (imgSrc) {
          parts.push(`<div style="margin:8px 0"><img src="${imgSrc}" alt="${escH(alt)}" style="max-width:100%;border-radius:4px;border:1px solid var(--line-2)" />${alt?`<div style="font-size:11px;color:var(--ink-3);margin-top:3px">${escH(alt)}</div>`:''}</div>`);
        } else {
          parts.push(`<em style="color:var(--ink-3)">[figure: ${escH(alt||src)}]</em>`);
        }
        i++; continue;
      }

      // paragraph
      const pLines: string[] = [];
      while (i<lines.length && lines[i].trim() && !/^#{1,3}\s/.test(lines[i].trim()) && !/^[-*+]\s/.test(lines[i].trim()) && !/^\d+[.)]\s/.test(lines[i].trim()) && !lines[i].trim().startsWith('> ') && !lines[i].trim().startsWith('```')) {
        pLines.push(inlineH(lines[i].trim(), evidence));
        i++;
      }
      if (pLines.length) parts.push(`<p style="margin:0 0 8px;line-height:1.65">${pLines.join('<br>')}</p>`);
    }
  }

  return parts.join('')||'<p style="color:var(--ink-3);font-style:italic">Nothing written yet…</p>';
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Activity = { id: string; action: string; target: string; detail: string; createdAt: string; badge: string; user: { name: string; initials: string } };
type Finding = {
  id?: string; title: string; severity: string; status?: string;
  cvss?: number; cvssVector?: string; cwe: string; owasp: string;
  assetOwner?: string;
  summary?: string; description: string; reproduction?: string;
  impact?: string; remediation?: string; references?: string;
  activities?: Activity[];
  assignee?: { name: string; initials: string } | null;
};
type Props = { finding?: Finding; assets?: string[]; projectId: string; isEditing?: boolean; ownerSuggestions?: string[] };

const FIELD_TABS = ['Description','Reproduction','Impact','Remediation','References'] as const;
type FieldTab = typeof FIELD_TABS[number];

export function UnifiedFindingEditor({ finding, assets=[], projectId, isEditing=false, ownerSuggestions=[] }: Props) {
  const router = useRouter();

  const [title,         setTitle]         = useState(finding?.title||'');
  const [severity,      setSeverity]      = useState(finding?.severity||'medium');
  const [status,        setStatus]        = useState(finding?.status||'open');
  const [cwe,           setCwe]           = useState(finding?.cwe||'');
  const [owasp,         setOwasp]         = useState(finding?.owasp||'');
  const [description,   setDescription]   = useState(finding?.description||'');
  const [reproduction,  setReproduction]  = useState(finding?.reproduction||'');
  const [impact,        setImpact]        = useState(finding?.impact||'');
  const [remediation,   setRemediation]   = useState(finding?.remediation||'');
  const [references,    setReferences]    = useState(finding?.references||'');
  const [affectedAssets,setAffectedAssets]= useState(Array.isArray(assets)?assets.join('\n'):'');
  const [assetOwner,    setAssetOwner]    = useState(finding?.assetOwner||'');
  const [editorTab,     setEditorTab]     = useState<'Write'|'Preview'>('Write');
  const [fieldTab,      setFieldTab]      = useState<FieldTab>('Description');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [error,         setError]         = useState('');
  const [evidence,      setEvidence]      = useState<EvidenceItem[]>([]);
  const [uploading,     setUploading]     = useState(false);
  const [editCap,       setEditCap]       = useState<string|null>(null);
  const [capVal,        setCapVal]        = useState('');
  const [dragOver,        setDragOver]        = useState(false);
  const [severityLocked,  setSeverityLocked]  = useState(false);

  const [aiPhase, setAiPhase] = useState<AIPhase>('idle');
  const [aiError, setAiError] = useState('');
  const [annotating, setAnnotating] = useState<string | null>(null); // evidence ID being annotated

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // CVSS
  const parsedVec = parseVector(finding?.cvssVector||'');
  const [cvss, setCvss] = useState<CVSSVector>({...DEFAULT_CVSS,...parsedVec});
  const cvssScore = useMemo(()=>calcCVSS(cvss),[cvss]);
  const cvssColor = cvssScore>=9?'var(--sev-critical)':cvssScore>=7?'var(--sev-high)':cvssScore>=4?'var(--sev-medium)':cvssScore>0?'var(--sev-low)':'var(--ink-3)';
  const cvssLabel = cvssScore>=9?'Critical':cvssScore>=7?'High':cvssScore>=4?'Medium':cvssScore>=0.1?'Low':'None';

  // Derive severity label from a numeric score
  function severityFromScore(s: number): string {
    return s>=9?'critical':s>=7?'high':s>=4?'medium':s>=0.1?'low':'info';
  }

  // Update a CVSS metric and — if not locked — auto-derive severity
  function updateCvss(key: keyof CVSSVector, val: string) {
    const next = {...cvss,[key]:val} as CVSSVector;
    setCvss(next);
    if (!severityLocked) setSeverity(severityFromScore(calcCVSS(next)));
  }

  // Load evidence from DB
  useEffect(()=>{
    if (!finding?.id) return;
    fetch(`/api/findings/${finding.id}/evidence`)
      .then(r=>r.json())
      .then(d=>{ if(d.evidence) setEvidence(d.evidence); })
      .catch(()=>{});
  },[finding?.id]);

  // AI generate finding
  const generateWithAI = useCallback(async () => {
    if (aiPhase !== 'idle') return;
    setAiError('');
    setAiPhase('thinking');

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'finding',
          context: {
            title: title || 'Untitled vulnerability',
            description,
            reproduction,
            assets: affectedAssets,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI generation failed');

      const r = data.result;
      setAiPhase('writing');

      // Populate all fields with typing animation
      const tasks: Array<() => Promise<void>> = [
        () => typeText(r.summary || '',      v => setDescription(prev => prev || v), 8),
        () => typeText(r.description || '',  setDescription, 12),
        () => typeText(r.reproduction || '', setReproduction, 12),
        () => typeText(r.impact || '',       setImpact, 12),
        () => typeText(r.remediation || '',  setRemediation, 12),
        () => typeText(r.references || '',   setReferences, 14),
      ];

      // Run content fields sequentially (description first, then others in parallel)
      await tasks[0]();  // summary → description  (may be overwritten below)

      // Apply instantly (no typing delay for non-text fields)
      if (r.cwe) setCwe(r.cwe);
      if (r.owasp) setOwasp(r.owasp);
      if (r.severity) { setSeverity(r.severity); setSeverityLocked(true); }
      if (r.cvss) {
        const cv = r.cvss as Record<string, string>;
        setCvss({
          AV: (cv.AV || 'N') as 'N'|'A'|'L'|'P',
          AC: (cv.AC || 'L') as 'L'|'H',
          PR: (cv.PR || 'N') as 'N'|'L'|'H',
          UI: (cv.UI || 'N') as 'N'|'R',
          S:  (cv.S  || 'U') as 'U'|'C',
          C:  (cv.C  || 'N') as 'N'|'L'|'H',
          I:  (cv.I  || 'N') as 'N'|'L'|'H',
          A:  (cv.A  || 'N') as 'N'|'L'|'H',
        });
      }
      if (Array.isArray(r.assets) && r.assets.length > 0) {
        setAffectedAssets(prev => prev || r.assets.join('\n'));
      }

      // Type in the long-form fields
      await Promise.all([
        typeText(r.description || '', setDescription, 10),
        typeText(r.reproduction || '', setReproduction, 10),
        typeText(r.impact || '', setImpact, 10),
        typeText(r.remediation || '', setRemediation, 10),
        typeText(r.references || '', setReferences, 14),
      ]);

      setAiPhase('done');
      // Auto-dismiss after 1.5s
      setTimeout(() => setAiPhase('idle'), 1500);

    } catch (err) {
      setAiPhase('idle');
      setAiError(err instanceof Error ? err.message : 'AI generation failed');
    }
  }, [aiPhase, title, description, reproduction, affectedAssets]);

  // Keyboard shortcut: Cmd+Enter
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        generateWithAI();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [generateWithAI]);

  // Field helpers
  const currentValue = useCallback(()=>{
    if(fieldTab==='Description') return description;
    if(fieldTab==='Reproduction') return reproduction;
    if(fieldTab==='Impact') return impact;
    if(fieldTab==='Remediation') return remediation;
    return references;
  },[fieldTab,description,reproduction,impact,remediation,references]);

  const setCurrentValue = useCallback((v:string)=>{
    if(fieldTab==='Description') setDescription(v);
    else if(fieldTab==='Reproduction') setReproduction(v);
    else if(fieldTab==='Impact') setImpact(v);
    else if(fieldTab==='Remediation') setRemediation(v);
    else setReferences(v);
  },[fieldTab]);

  // Insert at cursor
  function insertAtCursor(text:string) {
    const ta=textareaRef.current;
    if(!ta){ setCurrentValue(currentValue()+text); return; }
    const s=ta.selectionStart, e=ta.selectionEnd;
    const next=currentValue().slice(0,s)+text+currentValue().slice(e);
    setCurrentValue(next);
    requestAnimationFrame(()=>{ ta.focus(); ta.setSelectionRange(s+text.length,s+text.length); });
  }

  // Upload helper
  async function uploadFile(dataUrl:string, filename:string): Promise<EvidenceItem|null> {
    if(!finding?.id) return null;
    setUploading(true);
    try {
      const caption = filename.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ');
      const res = await fetch(`/api/findings/${finding.id}/evidence`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({type:'screenshot',caption,content:dataUrl,filename}),
      });
      if(!res.ok) return null;
      const {evidence:ev} = await res.json();
      setEvidence(prev=>[...prev,ev]);
      return ev;
    } catch { return null; }
    finally { setUploading(false); }
  }

  // Process image file → upload → insert ref
  function processImageFile(file:File) {
    const reader = new FileReader();
    reader.onload = async (e)=>{
      const dataUrl = e.target?.result as string;
      const uploaded = await uploadFile(dataUrl, file.name);
      if(uploaded) {
        insertAtCursor(`\n![${uploaded.caption||file.name}](${uploaded.id})\n`);
      }
    };
    reader.readAsDataURL(file);
  }

  // Paste handler
  function handlePaste(e:React.ClipboardEvent<HTMLTextAreaElement>) {
    const img = Array.from(e.clipboardData.items).find(it=>it.type.startsWith('image/'));
    if(!img) return;
    e.preventDefault();
    const blob=img.getAsFile(); if(!blob) return;
    processImageFile(new File([blob],`screenshot-${evidence.length+1}.png`,{type:blob.type}));
  }

  // Drag handlers on textarea wrapper
  function handleDragOver(e:React.DragEvent) {
    if(Array.from(e.dataTransfer.items).some(it=>it.type.startsWith('image/')||it.kind==='file')) {
      e.preventDefault(); setDragOver(true);
    }
  }
  function handleDragLeave() { setDragOver(false); }
  function handleDrop(e:React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
    files.forEach(processImageFile);
  }

  // File input
  function handleFileInput(e:React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files||[]).forEach(processImageFile);
    e.target.value='';
  }

  // Delete evidence
  async function deleteEvidence(id:string) {
    await fetch(`/api/evidence/${id}`,{method:'DELETE'});
    setEvidence(prev=>prev.filter(e=>e.id!==id));
  }

  // Save caption
  async function saveCaption(id:string) {
    await fetch(`/api/evidence/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({caption:capVal})});
    setEvidence(prev=>prev.map(e=>e.id===id?{...e,caption:capVal}:e));
    setEditCap(null);
  }

  // Save annotated image back to the evidence record
  async function saveAnnotation(dataUrl: string) {
    if (!annotating) return;
    await fetch(`/api/evidence/${annotating}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: dataUrl }),
    });
    setEvidence(prev => prev.map(e => e.id === annotating ? { ...e, content: dataUrl } : e));
    setAnnotating(null);
  }

  // Toolbar
  const TOOLBAR = [
    {icon:'bold',      label:'Bold',       ins:'**bold**'},
    {icon:'italic',    label:'Italic',     ins:'*italic*'},
    {icon:'heading',   label:'Heading',    ins:'## Heading'},
    {icon:'list',      label:'Bullets',    ins:'- item\n- item\n- item'},
    {icon:'codeblock', label:'Code block', ins:'```bash\ncode here\n```'},
    {icon:'quote',     label:'Blockquote', ins:'> quote'},
  ];

  // Save / create
  async function handleSave() {
    if(!title.trim()){ setError('Title is required'); return; }
    setError(''); setSaving(true);
    try {
      if(isEditing && finding?.id) {
        await fetch(`/api/findings/${finding.id}`,{
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            title,severity,status,cwe,owasp,assetOwner,description,reproduction,impact,remediation,references,
            assets:affectedAssets.split('\n').map(a=>a.trim()).filter(Boolean),
            cvss:cvssScore,
            cvssVector:`AV:${cvss.AV}/AC:${cvss.AC}/PR:${cvss.PR}/UI:${cvss.UI}/S:${cvss.S}/C:${cvss.C}/I:${cvss.I}/A:${cvss.A}`,
          }),
        });
        setSaved(true); setTimeout(()=>setSaved(false),2500);
      } else {
        const res = await fetch(`/api/projects/${projectId}/findings`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            title:title.trim(),severity,description:description.trim(),cwe:cwe.trim(),owasp:owasp.trim(),assetOwner:assetOwner.trim(),
            assets:affectedAssets.split('\n').map(a=>a.trim()).filter(Boolean),
            reproduction:reproduction.trim(),impact:impact.trim(),remediation:remediation.trim(),references:references.trim(),
            cvss:cvssScore,
            cvssVector:`AV:${cvss.AV}/AC:${cvss.AC}/PR:${cvss.PR}/UI:${cvss.UI}/S:${cvss.S}/C:${cvss.C}/I:${cvss.I}/A:${cvss.A}`,
          }),
        });
        if(!res.ok){ const d=await res.json().catch(()=>({})); setError(d.error||'Failed to create finding'); return; }
        const data=await res.json();
        router.push(`/projects/${projectId}/findings/${data.finding?.id ?? data.id}`);
      }
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{flex:1,display:'flex',overflow:'hidden',flexDirection:'column'}}>
      {/* AI Overlay */}
      <AIOverlay phase={aiPhase} onClose={() => setAiPhase('idle')} />

      {/* Screenshot Annotator */}
      {annotating && (() => {
        const ev = evidence.find(e => e.id === annotating);
        return ev ? (
          <ScreenshotAnnotator
            imageUrl={ev.content}
            onSave={saveAnnotation}
            onClose={() => setAnnotating(null)}
          />
        ) : null;
      })()}

      {/* Title */}
      <div style={{padding:'14px 20px',borderBottom:'1px solid var(--line-1)',background:'var(--bg-0)',flexShrink:0,display:'flex',alignItems:'center',gap:12}}>
        <input
          value={title} onChange={e=>setTitle(e.target.value)}
          placeholder="Finding title…"
          autoFocus
          style={{flex:1,fontSize:18,fontWeight:500,color:'var(--ink-0)',background:'transparent',border:'none',outline:'none',fontFamily:'inherit'}}
        />
        {/* AI Generate button */}
        <button
          onClick={generateWithAI}
          disabled={aiPhase !== 'idle'}
          title="Generate with AI (⌘↩)"
          style={{
            display:'flex',alignItems:'center',gap:7,padding:'7px 14px',
            borderRadius:'var(--r-sm)',border:'1px solid',cursor:'pointer',
            flexShrink:0,fontSize:12.5,fontWeight:600,transition:'all .15s',
            background:'linear-gradient(135deg,rgba(91,155,213,0.12) 0%,rgba(201,168,245,0.12) 100%)',
            borderColor:'rgba(91,155,213,0.35)',
            color:'var(--ink-1)',
            boxShadow: aiPhase !== 'idle' ? 'none' : '0 0 0 0 rgba(91,155,213,0)',
          }}
          onMouseEnter={e=>{
            if(aiPhase==='idle') {
              e.currentTarget.style.background='linear-gradient(135deg,rgba(91,155,213,0.2) 0%,rgba(201,168,245,0.2) 100%)';
              e.currentTarget.style.boxShadow='0 0 16px rgba(91,155,213,0.25)';
            }
          }}
          onMouseLeave={e=>{
            e.currentTarget.style.background='linear-gradient(135deg,rgba(91,155,213,0.12) 0%,rgba(201,168,245,0.12) 100%)';
            e.currentTarget.style.boxShadow='none';
          }}
        >
          <Ico name="sparkles" size={14} style={{color:'#9b7fd4'}}/>
          {aiPhase === 'idle' ? 'Generate with AI' : 'Generating…'}
          <kbd style={{
            fontSize:9,fontFamily:'var(--font-mono)',background:'rgba(0,0,0,0.15)',
            borderRadius:3,padding:'1px 5px',color:'var(--ink-3)',border:'1px solid rgba(255,255,255,0.08)',
          }}>⌘↩</kbd>
        </button>
      </div>

      {/* AI error banner */}
      {aiError && (
        <div style={{padding:'10px 20px',background:'var(--sev-critical-bg)',borderBottom:'1px solid rgba(255,92,58,.2)',color:'var(--sev-critical)',fontSize:12,display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <Ico name="alert" size={14}/>
          AI error: {aiError}
          <button onClick={()=>setAiError('')} style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',color:'inherit',opacity:.7}}>✕</button>
        </div>
      )}

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* ── LEFT: Editor + Evidence ── */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',borderRight:'1px solid var(--line-1)'}}>

          {/* Field tabs */}
          <div style={{display:'flex',padding:'0 16px',borderBottom:'1px solid var(--line-1)',background:'var(--bg-1)',flexShrink:0}}>
            {FIELD_TABS.map(t=>(
              <button key={t} onClick={()=>setFieldTab(t)} style={{
                padding:'11px 13px',background:'transparent',border:'none',
                borderBottom:`2px solid ${fieldTab===t?'var(--ink-0)':'transparent'}`,
                color:fieldTab===t?'var(--ink-0)':'var(--ink-2)',
                fontSize:13,cursor:'pointer',marginBottom:-1,transition:'color .1s',
              }}>{t}</button>
            ))}
          </div>

          {/* Write/Preview + toolbar */}
          <div style={{display:'flex',alignItems:'center',gap:4,padding:'6px 16px',borderBottom:'1px solid var(--line-1)',background:'var(--bg-0)',flexShrink:0}}>
            {(['Write','Preview'] as const).map(t=>(
              <button key={t} onClick={()=>setEditorTab(t)} style={{
                padding:'5px 10px',borderRadius:'var(--r-xs)',
                background:editorTab===t?'var(--bg-2)':'transparent',
                border:`1px solid ${editorTab===t?'var(--line-2)':'transparent'}`,
                color:editorTab===t?'var(--ink-0)':'var(--ink-2)',
                fontSize:12,cursor:'pointer',transition:'all .1s',
              }}>{t}</button>
            ))}
            <div style={{flex:1}}/>
            {editorTab==='Write' && (
              <div style={{display:'flex',gap:2}}>
                {TOOLBAR.map(({icon,label,ins})=>(
                  <button key={icon} title={label}
                    onClick={()=>insertAtCursor('\n'+ins+'\n')}
                    style={{width:26,height:26,borderRadius:'var(--r-xs)',border:'none',background:'transparent',color:'var(--ink-3)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <Ico name={icon} size={13}/>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Editor/Preview area — with drag-and-drop zone */}
          <div
            className="thin-scroll"
            style={{flex:1,overflow:'auto',minHeight:0,position:'relative'}}
            onDragOver={editorTab==='Write'?handleDragOver:undefined}
            onDragLeave={editorTab==='Write'?handleDragLeave:undefined}
            onDrop={editorTab==='Write'?handleDrop:undefined}
          >
            {/* Drag-over overlay */}
            {dragOver && (
              <div style={{
                position:'absolute',inset:0,zIndex:10,
                background:'rgba(91,155,213,.12)',
                border:'2px dashed #5B9BD5',
                display:'flex',alignItems:'center',justifyContent:'center',
                pointerEvents:'none',borderRadius:4,
              }}>
                <div style={{textAlign:'center',color:'#5B9BD5',fontSize:14,fontWeight:600}}>
                  <Ico name="image" size={28}/>
                  <div style={{marginTop:8}}>Drop image to upload</div>
                </div>
              </div>
            )}

            {editorTab==='Write' ? (
              <textarea
                ref={textareaRef}
                value={currentValue()}
                onChange={e=>setCurrentValue(e.target.value)}
                onPaste={handlePaste}
                placeholder={`Write ${fieldTab.toLowerCase()} in Markdown…\n\nTip: paste or drag-and-drop screenshots — they'll upload automatically and insert a reference.`}
                style={{
                  display:'block',width:'100%',height:'100%',minHeight:240,
                  padding:'20px 24px',background:'var(--bg-0)',border:'none',outline:'none',
                  color:'var(--ink-1)',fontFamily:'var(--font-mono)',fontSize:13.5,
                  lineHeight:1.75,resize:'none',boxSizing:'border-box',
                }}
              />
            ) : (
              <div
                style={{padding:'20px 28px',maxWidth:740,color:'var(--ink-0)',fontSize:14,lineHeight:1.7}}
                dangerouslySetInnerHTML={{__html:buildHtml(currentValue(),evidence)}}
              />
            )}
          </div>

          {/* ── Evidence Panel ── */}
          <div style={{borderTop:'1px solid var(--line-1)',background:'var(--bg-1)',flexShrink:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 16px 7px'}}>
              <span className="eyebrow" style={{fontSize:9,flex:1}}>
                Evidence{evidence.length>0?` · ${evidence.length} item${evidence.length>1?'s':''}` : ''}
              </span>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileInput} style={{display:'none'}}/>
              <button onClick={()=>fileInputRef.current?.click()} disabled={uploading} className="btn btn-sm btn-ghost" style={{height:24,padding:'0 8px',fontSize:11,gap:4}}>
                <Ico name="plus" size={11}/>{uploading?'Uploading…':'Upload image'}
              </button>
            </div>

            {evidence.length===0 ? (
              <div style={{padding:'4px 16px 12px',color:'var(--ink-3)',fontSize:12,lineHeight:1.6}}>
                Paste <kbd style={{background:'var(--bg-3)',border:'1px solid var(--line-2)',borderRadius:3,padding:'0 4px',fontSize:11}}>⌘V</kbd> or drag-and-drop an image into the editor.
                Then use <code style={{fontFamily:'var(--font-mono)',fontSize:11,background:'var(--bg-2)',padding:'0 4px',borderRadius:3}}>![caption](id)</code> to embed it inline.
              </div>
            ) : (
              <div className="thin-scroll" style={{display:'flex',gap:10,padding:'0 16px 12px',overflowX:'auto'}}>
                {evidence.filter(e=>e.type==='screenshot'&&e.content).map((ev,idx)=>(
                  <div key={ev.id} style={{
                    flexShrink:0,width:130,border:'1px solid var(--line-2)',
                    borderRadius:'var(--r-sm)',background:'var(--bg-0)',overflow:'hidden',
                    display:'flex',flexDirection:'column',
                  }}>
                    {/* Thumbnail */}
                    <div style={{position:'relative',height:76,background:'var(--bg-2)',overflow:'hidden'}}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ev.content} alt={ev.caption||ev.filename} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                      {/* Delete */}
                      <button onClick={()=>deleteEvidence(ev.id)} style={{
                        position:'absolute',top:4,right:4,width:18,height:18,borderRadius:'50%',
                        background:'rgba(0,0,0,.65)',border:'none',cursor:'pointer',
                        color:'#fff',fontSize:9,display:'flex',alignItems:'center',justifyContent:'center',
                      }}>✕</button>
                      {/* Annotate */}
                      <button
                        onClick={()=>setAnnotating(ev.id)}
                        title="Annotate screenshot"
                        style={{
                          position:'absolute',top:4,left:4,width:18,height:18,borderRadius:'50%',
                          background:'rgba(0,0,0,.65)',border:'none',cursor:'pointer',
                          color:'#fff',fontSize:9,display:'flex',alignItems:'center',justifyContent:'center',
                        }}
                      >
                        <Ico name="pen" size={9}/>
                      </button>
                    </div>

                    {/* Caption */}
                    <div style={{padding:'5px 7px',flex:1}}>
                      {editCap===ev.id ? (
                        <input
                          autoFocus value={capVal}
                          onChange={e=>setCapVal(e.target.value)}
                          onBlur={()=>saveCaption(ev.id)}
                          onKeyDown={e=>{if(e.key==='Enter')saveCaption(ev.id);if(e.key==='Escape')setEditCap(null);}}
                          style={{width:'100%',fontSize:10,fontFamily:'var(--font-mono)',background:'var(--bg-2)',border:'1px solid var(--accent)',borderRadius:3,padding:'2px 4px',color:'var(--ink-0)',outline:'none'}}
                        />
                      ):(
                        <div
                          onClick={()=>{setEditCap(ev.id);setCapVal(ev.caption||'');}}
                          title="Click to edit caption"
                          style={{fontSize:10,color:'var(--ink-2)',lineHeight:1.3,cursor:'text',wordBreak:'break-word',minHeight:14}}
                        >
                          {ev.caption||<span style={{color:'var(--ink-3)',fontStyle:'italic'}}>No caption</span>}
                        </div>
                      )}
                      {/* ID hint */}
                      <div style={{fontFamily:'var(--font-mono)',fontSize:8.5,color:'var(--ink-3)',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={`ID: ${ev.id}`}>
                        id: {ev.id.slice(0,12)}…
                      </div>
                    </div>

                    {/* Insert ref */}
                    <button
                      title={`Insert ![${ev.caption||'screenshot'}](${ev.id})`}
                      onClick={()=>{
                        insertAtCursor(`\n![${ev.caption||`Screenshot ${idx+1}`}](${ev.id})\n`);
                        setEditorTab('Write');
                        textareaRef.current?.focus();
                      }}
                      style={{
                        padding:'5px 7px',border:'none',borderTop:'1px solid var(--line-1)',
                        background:'transparent',cursor:'pointer',color:'var(--ink-2)',
                        fontSize:10,display:'flex',alignItems:'center',justifyContent:'center',gap:4,
                      }}
                      onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-2)')}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                    >
                      <Ico name="copy" size={10}/> Insert ref
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Sidebar ── */}
        <div className="thin-scroll" style={{width:300,flexShrink:0,overflowY:'auto',background:'var(--bg-1)',display:'flex',flexDirection:'column'}}>

          {/* Metadata */}
          <div style={{padding:'18px 18px 14px'}}>
            <div className="eyebrow" style={{marginBottom:14}}>Metadata</div>
            <div style={{display:'flex',flexDirection:'column',gap:11}}>

              <div className="form-group">
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                  <label className="form-label" style={{marginBottom:0}}>Severity</label>
                  <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',userSelect:'none'}}>
                    <input
                      type="checkbox"
                      checked={severityLocked}
                      onChange={e=>setSeverityLocked(e.target.checked)}
                      style={{accentColor:'var(--accent)',cursor:'pointer'}}
                    />
                    <span style={{fontSize:10,color:'var(--ink-3)',fontFamily:'var(--font-mono)'}}>Override</span>
                  </label>
                </div>
                <select
                  className="input"
                  value={severity}
                  onChange={e=>{ setSeverity(e.target.value); setSeverityLocked(true); }}
                  style={{width:'100%',opacity:severityLocked?1:0.7}}
                  title={severityLocked?'Severity overridden — CVSS changes will not affect it':'Severity auto-derived from CVSS score'}
                >
                  {['critical','high','medium','low','info'].map(s=>(
                    <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}{!severityLocked&&s===severity?' (auto)':''}</option>
                  ))}
                </select>
                {!severityLocked && (
                  <div style={{fontSize:10,color:'var(--ink-3)',marginTop:3}}>Auto-derived from CVSS · check Override to lock</div>
                )}
              </div>

              {isEditing && (
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="input" value={status} onChange={e=>setStatus(e.target.value)} style={{width:'100%'}}>
                    {['open','in-progress','in-review','resolved','accepted'].map(s=>(
                      <option key={s} value={s}>{s.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <div className="form-group">
                  <label className="form-label">CWE</label>
                  <input className="input" value={cwe} onChange={e=>setCwe(e.target.value)} placeholder="CWE-79" style={{width:'100%'}}/>
                </div>
                <div className="form-group">
                  <label className="form-label">OWASP</label>
                  <input className="input" value={owasp} onChange={e=>setOwasp(e.target.value)} placeholder="A03:2021" style={{width:'100%'}}/>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Affected Assets</label>
                <textarea className="input" value={affectedAssets} onChange={e=>setAffectedAssets(e.target.value)} placeholder="One per line" style={{width:'100%',fontFamily:'var(--font-mono)',fontSize:11,minHeight:70,resize:'vertical'}}/>
              </div>

              <div className="form-group">
                <label className="form-label">Asset Owner</label>
                <input
                  className="input"
                  list="asset-owner-suggestions"
                  value={assetOwner}
                  onChange={e=>setAssetOwner(e.target.value)}
                  placeholder="e.g. Payments Team, API Platform…"
                  style={{width:'100%'}}
                />
                {ownerSuggestions.length > 0 && (
                  <datalist id="asset-owner-suggestions">
                    {ownerSuggestions.map(s => <option key={s} value={s} />)}
                  </datalist>
                )}
              </div>
            </div>
          </div>

          <hr className="hr"/>

          {/* CVSS */}
          <div style={{padding:'14px 18px'}}>
            <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:12}}>
              <div className="eyebrow">CVSS 3.1</div>
              <div style={{display:'flex',alignItems:'baseline',gap:5}}>
                <span className="serif" style={{fontSize:26,fontWeight:700,color:cvssColor,lineHeight:1}}>{cvssScore.toFixed(1)}</span>
                <span style={{fontSize:11,color:cvssColor,fontFamily:'var(--font-mono)'}}>{cvssLabel}</span>
              </div>
            </div>

            <div style={{height:3,borderRadius:100,background:'var(--bg-3)',marginBottom:12,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${(cvssScore/10)*100}%`,background:cvssColor,borderRadius:100,transition:'all .3s'}}/>
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {([
                {key:'AV',label:'Attack Vector',    opts:[['N','Network'],['A','Adjacent'],['L','Local'],['P','Physical']]},
                {key:'AC',label:'Attack Complexity', opts:[['L','Low'],['H','High']]},
                {key:'PR',label:'Privileges Req.',   opts:[['N','None'],['L','Low'],['H','High']]},
                {key:'UI',label:'User Interaction',  opts:[['N','None'],['R','Required']]},
                {key:'S', label:'Scope',             opts:[['U','Unchanged'],['C','Changed']]},
                {key:'C', label:'Confidentiality',   opts:[['N','None'],['L','Low'],['H','High']]},
                {key:'I', label:'Integrity',         opts:[['N','None'],['L','Low'],['H','High']]},
                {key:'A', label:'Availability',      opts:[['N','None'],['L','Low'],['H','High']]},
              ] as Array<{key:keyof CVSSVector;label:string;opts:[string,string][]}> ).map(({key,label,opts})=>(
                <div key={key}>
                  <div style={{fontSize:10,fontFamily:'var(--font-mono)',color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>{label}</div>
                  <div style={{display:'flex',gap:3}}>
                    {opts.map(([val,desc])=>(
                      <button key={val} onClick={()=>updateCvss(key,val)} title={desc} style={{
                        flex:1,height:24,borderRadius:'var(--r-xs)',border:'1px solid',
                        borderColor:cvss[key]===val?'var(--line-3)':'var(--line-1)',
                        background:cvss[key]===val?'var(--bg-3)':'var(--bg-0)',
                        color:cvss[key]===val?'var(--ink-0)':'var(--ink-3)',
                        fontSize:11,fontFamily:'var(--font-mono)',cursor:'pointer',transition:'all .1s',
                      }}>{val}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{marginTop:10,padding:'7px 9px',background:'var(--bg-0)',borderRadius:'var(--r-sm)',border:'1px solid var(--line-1)'}}>
              <span style={{fontFamily:'var(--font-mono)',fontSize:10,color:'var(--ink-3)',wordBreak:'break-all'}}>
                CVSS:3.1/AV:{cvss.AV}/AC:{cvss.AC}/PR:{cvss.PR}/UI:{cvss.UI}/S:{cvss.S}/C:{cvss.C}/I:{cvss.I}/A:{cvss.A}
              </span>
            </div>
          </div>

          {/* Activity (editing only) */}
          {isEditing && finding?.activities && finding.activities.length>0 && (
            <>
              <hr className="hr"/>
              <div style={{padding:'14px 18px'}}>
                <div className="eyebrow" style={{marginBottom:12}}>Activity</div>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {finding.activities.slice(0,6).map(a=>(
                    <div key={a.id} style={{display:'flex',gap:9,alignItems:'flex-start'}}>
                      <div style={{width:22,height:22,borderRadius:'50%',background:'var(--bg-3)',border:'1px solid var(--line-1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:8,fontFamily:'var(--font-mono)',color:'var(--ink-2)'}}>
                        {a.user.initials||a.user.name.slice(0,2)}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,color:'var(--ink-1)',lineHeight:1.4}}>
                          <span style={{fontWeight:500}}>{a.user.name}</span>{' '}{a.action}
                          {a.detail&&<span style={{color:'var(--ink-3)'}}> · {a.detail}</span>}
                        </div>
                        <div style={{fontSize:10,color:'var(--ink-3)',fontFamily:'var(--font-mono)',marginTop:2}}>
                          {new Date(a.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Comments (for existing findings) */}
          {isEditing && finding?.id && (
            <>
              <hr className="hr"/>
              <div style={{padding:'14px 18px'}}>
                <FindingComments findingId={finding.id}/>
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div style={{margin:'0 18px 12px',padding:'10px 12px',background:'var(--sev-critical-bg)',border:'1px solid rgba(255,92,58,.25)',borderRadius:'var(--r-sm)',color:'var(--sev-critical)',fontSize:12}}>
              {error}
            </div>
          )}

          {/* Save */}
          <div style={{padding:'14px 18px',borderTop:'1px solid var(--line-1)',background:'var(--bg-1)',position:'sticky',bottom:0,marginTop:'auto'}}>
            {isEditing && finding?.id && (
              <div style={{marginBottom:10}}>
                <LivePresence entity={`finding:${finding.id}`} />
              </div>
            )}
            <button
              className={`btn ${saved?'':'btn-primary'}`}
              onClick={handleSave} disabled={saving}
              style={{width:'100%',justifyContent:'center',background:saved?'rgba(143,201,122,0.15)':undefined,borderColor:saved?'rgba(143,201,122,0.3)':undefined,color:saved?'var(--status-resolved)':undefined}}
            >
              <Ico name={saved?'check':'save'} size={14}/>
              {saving?'Saving…':saved?'Saved':isEditing?'Save changes':'Create finding'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
