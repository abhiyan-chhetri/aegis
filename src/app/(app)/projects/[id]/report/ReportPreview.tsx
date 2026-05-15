'use client';

import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Ico } from '@/components/chrome/icons';

// ── Layout constants ────────────────────────────────────────────────────────
const PAGE_H    = 1123;   // A4 @ 96 dpi
const PAGE_W    = 794;
const PAD_X     = 72;     // ≈ .75in
const PAD_TOP   = 40;     // header zone
const PAD_BOT   = 68;     // footer zone
const CONTENT_W = PAGE_W - PAD_X * 2;  // 650px
const CONTENT_H = PAGE_H - PAD_TOP - PAD_BOT - 10; // 1005px usable
const CONTINUATION_HEADER_H = 36; // px taken by "X continued" header on continuation pages

// ── CSS ──────────────────────────────────────────────────────────────────────
const DEFAULT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap');
:root {
  --paper:#FAFAF7; --ink:#0E0F12; --ink80:#2A2C31; --ink60:#55585F; --ink30:#B5B7BC;
  --rule:#D9D6CC; --accent:#B8923A; --rpt-accent:#B8923A;
  --crit:#7A1F2B; --high:#C0392B; --med:#D98C2B; --low:#E8C547; --info:#3A6EA5;
  --codebg:#0F1115; --codefg:#E6E6E6; --codekey:#8FB4FF; --codestr:#C8E1A6; --codecom:#7A8390; --codenum:#E5C07B;
  --sans:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
  --mono:'IBM Plex Mono','Courier New',monospace;
}
.rpt-page {
  font-family:var(--sans); color:var(--ink); background:var(--paper);
  -webkit-font-smoothing:antialiased; font-size:10.5pt; line-height:1.55;
  box-sizing:border-box;
}
/* Page header */
.rpt-pg-header {
  position:absolute; left:${PAD_X}px; right:${PAD_X}px; top:26px;
  color:var(--ink60); font-size:8pt; display:flex; justify-content:space-between;
  align-items:center; border-bottom:.5pt solid var(--rule); padding-bottom:5px;
  font-family:var(--sans); letter-spacing:.04em;
}
.rpt-pg-header .l { text-transform:uppercase; font-size:7.5pt; }
/* Footer */
.rpt-footer {
  position:absolute; bottom:20px; left:${PAD_X}px; right:${PAD_X}px;
  display:flex; justify-content:space-between; color:var(--ink60);
  font-size:8pt; font-family:var(--sans);
}
/* Cover bars */
.rpt-cover-topbar { height:6px; background:var(--rpt-accent); position:absolute; top:0; left:0; right:0; }
.rpt-cover-botbar { height:6px; background:var(--ink); position:absolute; bottom:0; left:0; right:0; }
.rpt-cover-inner { padding:${PAD_X}px; height:${PAGE_H}px; display:flex; flex-direction:column; box-sizing:border-box; }
/* Cover rule */
.rpt-cover-rule { width:4cm; height:.6pt; background:var(--rule); margin:8pt 0 1.2cm; }
/* Eyebrow */
.rpt-eyebrow { font-size:9pt; letter-spacing:.18em; text-transform:uppercase; color:var(--ink60); font-family:var(--sans); }
/* Cover title */
.rpt-cover-h1 { font-size:36pt; line-height:1.05; font-weight:700; margin:0; letter-spacing:-.01em; }
.rpt-cover-lede { font-size:13pt; color:var(--ink60); margin-top:12pt; }
.rpt-cover-lede b { color:var(--ink); font-weight:600; }
/* Cover meta */
.rpt-cover-meta { margin-top:auto; display:grid; grid-template-columns:auto 1fr auto 1fr; column-gap:16pt; row-gap:7pt; font-size:9.5pt; }
.rpt-cover-meta .k { color:var(--ink60); font-size:8pt; letter-spacing:.12em; text-transform:uppercase; }
/* Section heads — h2 style */
.rpt-sec { font-size:16pt; margin:14pt 0 0; font-weight:700; color:var(--ink); line-height:1.25; font-family:var(--sans); }
.rpt-sec-rules { margin-top:4pt; margin-bottom:10pt; }
.rpt-sec-rules .a { height:.4pt; background:var(--rule); }
.rpt-sec-rules .b { height:1.4pt; background:var(--rpt-accent); margin-top:1pt; }
/* Sub-section heads — h3 style */
.rpt-sub { font-size:11.5pt; margin:12pt 0 0; font-weight:600; font-family:var(--sans); }
.rpt-sub-rule { height:.4pt; background:var(--rule); margin:3pt 0 5pt; }
/* Body */
.rpt-p { margin:0 0 6pt; font-size:10pt; line-height:1.6; }
/* Badges — filled solid */
.rpt-badge { display:inline-block; font-size:7.5pt; font-weight:700; padding:1pt 7pt; border-radius:3px; text-transform:uppercase; letter-spacing:.06em; color:#fff; vertical-align:1pt; font-family:var(--sans); }
.rpt-badge.critical     { background:var(--crit); }
.rpt-badge.high         { background:var(--high); }
.rpt-badge.medium       { background:var(--med); }
.rpt-badge.low          { background:var(--low); color:var(--ink); }
.rpt-badge.info,.rpt-badge.informational { background:var(--info); }
/* Risk summary table */
.rpt-rsum { border-collapse:collapse; width:100%; margin:6pt 0; font-size:10pt; }
.rpt-rsum th,.rpt-rsum td { border:.5pt solid var(--rule); padding:6pt 8pt; text-align:center; }
.rpt-rsum th.c { background:var(--crit); color:#fff; font-weight:700; }
.rpt-rsum th.h { background:var(--high); color:#fff; font-weight:700; }
.rpt-rsum th.m { background:var(--med);  color:#fff; font-weight:700; }
.rpt-rsum th.l { background:var(--low);  color:var(--ink); font-weight:700; }
.rpt-rsum th.i { background:var(--info); color:#fff; font-weight:700; }
.rpt-rsum td { font-size:18pt; font-weight:700; background:var(--paper); }
/* Caption */
.rpt-caption { color:var(--ink60); font-size:8.5pt; font-style:italic; margin:2pt 0 10pt; }
.rpt-caption b { color:var(--ink80); font-style:normal; font-weight:600; }
/* Generic table */
.rpt-table { border-collapse:collapse; width:100%; margin:4pt 0; font-size:9.5pt; }
.rpt-table th,.rpt-table td { border:.5pt solid var(--rule); padding:5pt 7pt; vertical-align:top; text-align:left; }
.rpt-table thead.dk th { background:var(--ink); color:#fff; font-weight:600; }
.rpt-table th { background:rgba(0,0,0,.04); font-weight:600; font-size:8.5pt; }
/* TOC */
.rpt-toc-row { display:flex; align-items:baseline; gap:0; font-size:10.5pt; line-height:1.85; font-family:var(--sans); text-decoration:none; color:inherit; }
.rpt-toc-row:visited { color:inherit; }
.rpt-toc-row:hover { background:rgba(0,0,0,.03); }
.rpt-toc-row.l1 { font-weight:700; margin-top:5pt; }
.rpt-toc-row.l2 { padding-left:14pt; color:var(--ink80); font-size:10pt; }
.rpt-toc-row.l3 { padding-left:28pt; color:var(--ink60); font-size:9pt; }
.rpt-toc-row .dots { flex:1; border-bottom:1pt dotted var(--ink30); transform:translateY(-3pt); margin:0 5pt; }
.rpt-toc-row .pg { color:var(--ink); font-variant-numeric:tabular-nums; font-weight:600; flex-shrink:0; }
/* Meta grid (finding) */
.rpt-meta-grid { display:grid; grid-template-columns:120px 1fr; gap:5pt 12pt; font-size:10pt; margin-top:8pt; align-items:baseline; }
.rpt-meta-grid .k { color:var(--ink60); font-size:8pt; letter-spacing:.10em; text-transform:uppercase; font-weight:600; }
.rpt-vec { font-family:var(--mono); font-size:8.5pt; color:var(--ink60); }
/* Finding header */
.rpt-fid { font-size:8pt; letter-spacing:.12em; text-transform:uppercase; color:var(--ink60); margin-top:22pt; }
.rpt-fid b { color:var(--ink); }
.rpt-ftitle { font-size:17pt; font-weight:700; margin:3pt 0 0; line-height:1.2; font-family:var(--sans); }
.rpt-frules .a { height:.4pt; background:var(--rule); margin-top:5pt; }
.rpt-frules .b { height:1.4pt; background:var(--rpt-accent); margin-top:1pt; }
/* Finding section */
.rpt-fsec { margin-top:10pt; }
.rpt-fsec-hd { font-size:11.5pt; font-weight:600; margin:0; font-family:var(--sans); }
.rpt-fsec-rule { height:.4pt; background:var(--rule); margin:3pt 0 5pt; }
/* Links */
.rpt-link { color:var(--rpt-accent); text-decoration:underline; text-underline-offset:2px; }
.rpt-link:visited { color:var(--rpt-accent); }
/* Code block (dark terminal) */
.rpt-pre { background:var(--codebg); color:var(--codefg); font-family:var(--mono); font-size:8.5pt; line-height:1.45; padding:10pt 12pt; border-radius:2px; margin:4pt 0 6pt; white-space:pre-wrap; word-break:break-word; break-inside:avoid; page-break-inside:avoid; }
.rpt-pre .k { color:var(--codekey); font-weight:600; }
.rpt-pre .s { color:var(--codestr); }
.rpt-pre .c { color:var(--codecom); font-style:italic; }
.rpt-pre .n { color:var(--codenum); }
.rpt-pre-lang { font-size:7pt; text-transform:uppercase; letter-spacing:.12em; color:var(--codecom); margin-bottom:6pt; display:block; }
/* Inline code */
.rpt-icode { font-family:var(--mono); font-size:8.5pt; background:rgba(0,0,0,.07); padding:1px 5px; border-radius:2px; }
/* Markdown bullets/ordered with accent marker */
.rpt-ul { margin:3pt 0 7pt 16pt; padding:0; font-size:10pt; list-style:disc; }
.rpt-ul li { margin-bottom:3pt; line-height:1.55; }
.rpt-ul li::marker { color:var(--rpt-accent); font-weight:700; }
.rpt-ol { margin:3pt 0 7pt 16pt; padding:0; font-size:10pt; }
.rpt-ol li { margin-bottom:3pt; line-height:1.55; }
.rpt-ol li::marker { color:var(--rpt-accent); font-weight:700; }
/* Markdown headings inside content */
.rpt-md-h1 { font-size:13pt; font-weight:700; color:var(--ink); margin:12pt 0 2pt; border-bottom:1.5pt solid var(--rpt-accent); padding-bottom:3pt; }
.rpt-md-h2 { font-size:11.5pt; font-weight:600; color:var(--ink); margin:10pt 0 2pt; border-bottom:.5pt solid var(--rule); padding-bottom:2pt; }
.rpt-md-h3 { font-size:10.5pt; font-weight:600; color:var(--ink80); margin:8pt 0 2pt; }
/* Evidence / screenshot */
.rpt-figure { margin:10pt 0 6pt; break-inside:avoid; page-break-inside:avoid; }
.rpt-figure img { max-width:100%; border:1pt solid var(--rule); border-radius:2px; display:block; }
.rpt-figure-caption { font-size:8pt; color:var(--ink60); font-style:italic; margin-top:4pt; }
/* Ribbon / callout */
.rpt-callout { margin:10pt 0 0; padding:7pt 11pt; border-left:3px solid var(--rpt-accent); background:#F4EFE0; font-size:9.5pt; color:var(--ink80); line-height:1.6; break-inside:avoid; page-break-inside:avoid; }
/* Severity intro banner on section page */
.rpt-sev-banner { border-radius:3px; padding:14pt 16pt; margin-bottom:14pt; break-inside:avoid; page-break-inside:avoid; }
.rpt-sev-banner.critical { background:rgba(122,31,43,.08); border-left:4px solid var(--crit); }
.rpt-sev-banner.high     { background:rgba(192,57,43,.08); border-left:4px solid var(--high); }
.rpt-sev-banner.medium   { background:rgba(217,140,43,.08); border-left:4px solid var(--med); }
.rpt-sev-banner.low      { background:rgba(232,197,71,.12); border-left:4px solid var(--low); }
.rpt-sev-banner.info     { background:rgba(58,110,165,.08); border-left:4px solid var(--info); }
/* Inline mono */
.rpt-code { font-family:var(--mono); font-size:9pt; background:rgba(0,0,0,.05); padding:0 4px; border-radius:2px; }
/* Print */
@media print {
  @page { size:A4; margin:0; }
  body>*{display:none!important;}
  #rpt-area{display:block!important;position:static!important;padding:0!important;background:white!important;}
  .rpt-page{width:210mm!important;height:297mm!important;min-height:0!important;margin:0!important;box-shadow:none!important;page-break-after:always;break-after:page;overflow:hidden;}
  .no-print{display:none!important;}
}
`;

// ── Constants ─────────────────────────────────────────────────────────────────
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;
type Sev = typeof SEV_ORDER[number];

const SEV_COLOR: Record<string, string> = {
  critical: '#7A1F2B', high: '#C0392B', medium: '#D98C2B', low: '#E8C547', info: '#3A6EA5',
};
const SEV_LABEL: Record<string, string> = {
  critical: 'Critical Risk', high: 'High Risk', medium: 'Medium Risk',
  low: 'Low Risk', info: 'Informational',
};

// ── Types ────────────────────────────────────────────────────────────────────
type ScopeRow = { asset: string; type: string; notes: string };
type Evidence = { id: string; type: string; caption: string; content: string; filename: string };
type Finding = {
  id: string; code: string; title: string; severity: string; status: string;
  cvss: number; cvssVector: string; cwe: string; owasp: string;
  component: string; assets: string; summary: string;
  description: string; reproduction: string; impact: string;
  remediation: string; references: string; discovered: string;
  assignee?: { name: string; initials: string } | null;
  evidence?: Evidence[];
};
type Project = {
  id: string; code: string; name: string; engagement: string;
  startDate: string; endDate: string; scope: string; executiveSummary: string;
  methodology: string; attackNarrative: string;
  lead: { name: string; initials: string; role: string };
};
type TeamMember = { id: string; name: string; initials: string; role: string };
type Report = { id: string; version: string; status: string; templateName: string; reviewerId?: string | null } | null;
type Props = {
  project: Project; findings: Finding[];
  counts: Record<string, number>; riskScore: number;
  latestReport: Report; templateCSS?: string;
  teamMembers?: TeamMember[];
  reportId?: string;
  allUsers?: { id: string; name: string }[];
  currentUserId?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function badgeCls(sev: string) {
  return sev === 'info' ? 'informational' : sev;
}

// Parse extended image alt-text for custom dimensions.
//   ![Screenshot](src)               → defaults
//   ![Screenshot|400](src)           → width 400px, height auto
//   ![Screenshot|x300](src)          → width auto, height 300px
//   ![Screenshot|400x300](src)       → width 400, height 300
//   ![Screenshot|small](src)         → preset width (small/medium/large/full)
function parseImgAlt(rawAlt: string): { alt: string; width?: number; height?: number; preset?: string } {
  const pipe = rawAlt.lastIndexOf('|');
  if (pipe === -1) return { alt: rawAlt };
  const altText = rawAlt.slice(0, pipe).trim();
  const dim = rawAlt.slice(pipe + 1).trim();

  // Preset sizes
  const presetW: Record<string, number> = { small: 240, medium: 380, large: 520, full: 650 };
  if (dim in presetW) return { alt: altText, width: presetW[dim], preset: dim };

  // Numeric WxH / W / xH
  const m = dim.match(/^(\d*)\s*x\s*(\d*)$/i) || dim.match(/^(\d+)$/);
  if (m) {
    const w = m[1] ? parseInt(m[1], 10) : undefined;
    const h = m[2] !== undefined && m[2] !== '' ? parseInt(m[2], 10) : undefined;
    if (w || h) return { alt: altText, width: w, height: h };
  }
  return { alt: rawAlt };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Markdown rendering — uses react-markdown + remark-gfm under the hood for
//  proper CommonMark + GFM support (tables, autolinks, strikethrough, task
//  lists, etc.). We split the source markdown into top-level blocks first so
//  the paginator can pack each block individually onto pages without ever
//  splitting one mid-element.
// ─────────────────────────────────────────────────────────────────────────────

// Split markdown into top-level blocks (paragraphs, fenced code blocks, lists,
// headings) so each block can be paginated independently. Fenced code blocks
// are preserved as single blocks even if they contain blank lines.
function splitMarkdownIntoBlocks(text: string): string[] {
  if (!text?.trim()) return [];
  const blocks: string[] = [];
  // Pull fenced code blocks out first so blank lines inside them don't split them.
  const segments = text.split(/(```[\w]*\n?[\s\S]*?```)/g);
  for (const seg of segments) {
    if (seg.startsWith('```')) {
      const trimmed = seg.trim();
      if (trimmed) blocks.push(trimmed);
      continue;
    }
    // Plain segments: split on blank lines for paragraph-level blocks
    for (const para of seg.split(/\n{2,}/)) {
      const trimmed = para.trim();
      if (trimmed) blocks.push(trimmed);
    }
  }
  return blocks;
}

// react-markdown component overrides — applies our report's CSS class names
// and adds custom behaviour (image dimensions via `![alt|WxH](src)` syntax,
// link styling, evidence-id resolution for finding images).
type ResolveImage = (src: string) => string | null;
type AnyProps = Record<string, unknown> & { node?: { children?: Array<{ type: string }> }; children?: React.ReactNode };

function makeMarkdownComponents(resolveImage?: ResolveImage) {
  return {
    p: ({ node, children, ...rest }: AnyProps) => {
      // Image-only paragraph → unwrap so the figure renders as a block (no <p> wrapper)
      if (node?.children?.length === 1 && node.children[0].type === 'image') {
        return <>{children}</>;
      }
      return <p className="rpt-p" {...rest}>{children}</p>;
    },
    ul: ({ children, ...rest }: AnyProps) => <ul className="rpt-ul" {...rest}>{children}</ul>,
    ol: ({ children, ...rest }: AnyProps) => <ol className="rpt-ol" {...rest}>{children}</ol>,
    h1: ({ children }: AnyProps) => <div className="rpt-md-h1">{children}</div>,
    h2: ({ children }: AnyProps) => <div className="rpt-md-h2">{children}</div>,
    h3: ({ children }: AnyProps) => <div className="rpt-md-h3">{children}</div>,
    h4: ({ children }: AnyProps) => <div className="rpt-md-h3">{children}</div>,
    h5: ({ children }: AnyProps) => <div className="rpt-md-h3">{children}</div>,
    h6: ({ children }: AnyProps) => <div className="rpt-md-h3">{children}</div>,
    blockquote: ({ children }: AnyProps) => <div className="rpt-callout">{children}</div>,
    table: ({ children, ...rest }: AnyProps) => <table className="rpt-table" {...rest}>{children}</table>,
    a: ({ children, href, ...rest }: AnyProps & { href?: string }) => (
      <a href={href} className="rpt-link" target="_blank" rel="noopener noreferrer" {...rest}>{children}</a>
    ),
    code: ({ className, children, ...rest }: AnyProps & { className?: string }) => {
      // Block-level code (inside <pre>) carries a `language-xxx` class from remark
      const isBlock = !!className && /(^|\s)language-/.test(className);
      if (isBlock) return <code className={className} {...rest}>{children}</code>;
      return <code className="rpt-icode" {...rest}>{children}</code>;
    },
    pre: ({ children }: AnyProps) => <pre className="rpt-pre">{children}</pre>,
    img: ({ alt, src }: AnyProps & { alt?: string; src?: string }) => {
      const parsed = parseImgAlt(alt || '');
      let finalSrc = src || '';
      if (!finalSrc.startsWith('data:') && !finalSrc.startsWith('http') && resolveImage) {
        finalSrc = resolveImage(finalSrc) ?? finalSrc;
      }
      if (!finalSrc.startsWith('data:') && !finalSrc.startsWith('http')) {
        return <em style={{ color: 'var(--ink60)', fontSize: '9pt' }}>[figure: {parsed.alt || src}]</em>;
      }
      const imgStyle: React.CSSProperties = {
        maxWidth: '100%',
        maxHeight: parsed.height ? `${parsed.height}px` : (parsed.width ? undefined : 220),
        width:  parsed.width  ? `${parsed.width}px`  : undefined,
        height: parsed.height ? `${parsed.height}px` : undefined,
        objectFit: 'contain',
        border: '1pt solid var(--rule)',
        borderRadius: 2,
        display: 'block',
      };
      return (
        <div className="rpt-figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={finalSrc} alt={parsed.alt} style={imgStyle} />
          {parsed.alt && <div className="rpt-figure-caption"><b>Figure.</b> {parsed.alt}</div>}
        </div>
      );
    },
  };
}

const REMARK_PLUGINS = [remarkGfm];

// Render markdown source into an array of top-level block nodes — each is
// a fully-formed React element that the paginator can measure and pack.
function renderMarkdownToNodes(text: string, resolveImage?: ResolveImage): React.ReactNode[] {
  const blocks = splitMarkdownIntoBlocks(text);
  if (blocks.length === 0) return [];
  const components = makeMarkdownComponents(resolveImage);
  return blocks.map((block, i) => (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <ReactMarkdown key={i} remarkPlugins={REMARK_PLUGINS} components={components as any}>
      {block}
    </ReactMarkdown>
  ));
}

// Backwards-compatible wrapper returning a single ReactNode (used when the
// caller doesn't need access to the individual blocks for pagination).
function renderMarkdown(text: string, resolveImage?: ResolveImage): React.ReactNode {
  const nodes = renderMarkdownToNodes(text, resolveImage);
  return nodes.length > 0 ? <>{nodes}</> : null;
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ sev }: { sev: string }) {
  const label = sev === 'info' ? 'Informational' : sev.charAt(0).toUpperCase() + sev.slice(1);
  return <span className={`rpt-badge ${badgeCls(sev)}`}>{label}</span>;
}

// ── Section head (h2 + double rule) ──────────────────────────────────────────
function SecHead({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <>
      <div className="rpt-sec">{children}</div>
      <div className="rpt-sec-rules"><div className="a" /><div className="b" /></div>
    </>
  );
}

// ── Sub-section head (h3 + single rule) ──────────────────────────────────────
function SubHead({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <div className="rpt-sub">{children}<div className="rpt-sub-rule" /></div>
  );
}

// ── TOC row ───────────────────────────────────────────────────────────────────
function TocRow({ level, num, title, page, code, onClick }: {
  level: 'l1' | 'l2' | 'l3'; num?: string; title: string; page: number; code?: string; onClick?: () => void;
}) {
  return (
    <a
      href={`#page-${page}`}
      className={`rpt-toc-row ${level}`}
      onClick={onClick ? (e) => { e.preventDefault(); onClick(); } : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {num && (
        <span className="num" style={{
          color: 'var(--ink70)',
          fontWeight: 500,
          fontSize: level === 'l1' ? '10pt' : '9pt',
          minWidth: level === 'l1' ? '20pt' : '24pt',
          textAlign: 'right',
          marginRight: '4pt'
        }}>
          {num}.
        </span>
      )}
      {code && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: '8pt', color: 'var(--rpt-accent)', marginRight: 4 }}>
          {code}
        </span>
      )}
      <span style={{ flex: 1 }}>{title}</span>
      <span className="dots" />
      <span className="pg">{page}</span>
    </a>
  );
}

// ── A4 Page wrapper ───────────────────────────────────────────────────────────
function Page({
  id, pageNum, totalPages, project, children, cover = false, logoUrl = '',
}: {
  id?: string; pageNum: number; totalPages: number; project: Project;
  children: React.ReactNode; cover?: boolean; logoUrl?: string;
}) {
  return (
    <div
      id={id ?? `page-${pageNum}`}
      data-page={pageNum}
      className="rpt-page"
      style={{
        width: PAGE_W, height: PAGE_H,
        margin: '0 auto 36px', position: 'relative',
        boxShadow: '0 8px 40px rgba(0,0,0,.35)',
        boxSizing: 'border-box', overflow: 'hidden', flexShrink: 0,
      }}
    >
      {cover ? (
        <>
          <div className="rpt-cover-topbar" />
          <div className="rpt-cover-botbar" />
          {children}
        </>
      ) : (
        <>
          {/* Running header */}
          <div className="rpt-pg-header">
            <div className="l">{project.engagement}&nbsp;&nbsp;<span style={{ color: 'var(--ink30)' }}>|</span>&nbsp;&nbsp;{project.name}</div>
            <div>{project.code}</div>
          </div>
          {/* Content area */}
          <div style={{
            position: 'absolute', top: PAD_TOP, left: PAD_X, right: PAD_X,
            bottom: PAD_BOT, overflow: 'hidden',
          }}>
            {children}
          </div>
          {/* Footer with logo */}
          <div className="rpt-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
            <div>
              <div>Security Assessment Practice</div>
              <div>Confidential — Restricted Distribution</div>
            </div>
            {logoUrl && (
              <div style={{ height: '0.8cm', display: 'flex', alignItems: 'center' }}>
                <img src={logoUrl} alt="Logo" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
              </div>
            )}
            <div style={{ textAlign: 'right' }}>
              <div>Page {pageNum} of {totalPages}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PaginatedBlocks — the ONLY paginator in this file.
//
//  Takes an array of self-contained React nodes ("blocks") and renders them
//  across as many pages as needed. The algorithm is identical to how Word and
//  every other word processor does it:
//
//     1. Render every block once in a hidden measurement area to learn each
//        block's actual rendered height (including margins).
//     2. Greedy bin-packing: walk the blocks; while the next block still fits
//        on the current page, add it. If it doesn't fit, start a new page and
//        put the block at the top of it.
//     3. Edge case: if a single block is taller than a full page, it goes on
//        its own page and visually overflows the page bottom (unavoidable).
//
//  Each visible page renders ONLY the blocks assigned to it — no translate,
//  no clipping, no duplication. Blank space at the bottom of a page is fine.
// ─────────────────────────────────────────────────────────────────────────────
function PaginatedBlocks({
  id, blocks, startPage, totalPages, project, logoUrl = '', onPageCount,
  continuationHeader,
}: {
  id: string;
  blocks: React.ReactNode[];
  startPage: number;
  totalPages: number;
  project: Project;
  logoUrl?: string;
  onPageCount: (id: string, n: number) => void;
  // Optional banner rendered at the top of every continuation page
  // (e.g. "Finding F-001 continued"). The component automatically reserves
  // space for it when packing.
  continuationHeader?: React.ReactNode;
}) {
  const [pages, setPages] = useState<number[][]>(() => [blocks.map((_, i) => i)]);
  const measureRef = useRef<HTMLDivElement>(null);

  // Re-measure whenever the block list changes. Each block is rendered inside
  // its OWN `display: flow-root` wrapper so margin-collapse is disabled — every
  // margin (top + bottom) is fully counted in the wrapper's measured height.
  // This deliberately OVERestimates compared to the actual page render (where
  // adjacent margins collapse and save a few px) — that's the point. Conservative
  // packing → guaranteed no clipping. The cost is a little extra whitespace at
  // the bottom of some pages, which is exactly how Word handles it.
  useLayoutEffect(() => {
    const container = measureRef.current;
    if (!container) return;

    const wrappers = Array.from(container.children) as HTMLElement[];
    if (wrappers.length === 0) {
      setPages([[]]);
      onPageCount(id, 1);
      return;
    }

    const heights: number[] = wrappers.map(el => el.getBoundingClientRect().height);

    // Page-budget reservations:
    //   first page  → full CONTENT_H
    //   subsequent  → CONTENT_H minus continuation-header height (if provided)
    const firstBudget = CONTENT_H;
    const contBudget  = continuationHeader ? CONTENT_H - CONTINUATION_HEADER_H : CONTENT_H;

    const result: number[][] = [];
    let cur: number[] = [];
    let curH = 0;
    let budget = firstBudget;

    for (let i = 0; i < heights.length; i++) {
      const h = heights[i];

      // Single block bigger than a page → put alone on its own page (overflows
      // visually but it has no choice — the user would need to shorten it).
      if (h > budget && cur.length === 0) {
        result.push([i]);
        budget = contBudget;
        continue;
      }

      if (curH + h > budget && cur.length > 0) {
        // Doesn't fit — flush current page, start fresh.
        result.push(cur);
        cur = [i];
        curH = h;
        budget = contBudget;
      } else {
        cur.push(i);
        curH += h;
      }
    }
    if (cur.length > 0) result.push(cur);
    if (result.length === 0) result.push([]);

    setPages(result);
    onPageCount(id, result.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, blocks.length]);

  return (
    <>
      {/* Hidden measurement: each block in its own `flow-root` wrapper so margins
          are contained and the wrapper's height fully accounts for them. */}
      <div
        ref={measureRef}
        className="rpt-page"
        style={{
          position: 'fixed', left: -9999, top: -9999, width: CONTENT_W,
          visibility: 'hidden', pointerEvents: 'none', overflow: 'hidden',
        }}
      >
        {blocks.map((b, i) => (
          <div key={i} style={{ display: 'flow-root' }}>{b}</div>
        ))}
      </div>

      {/* Visible pages — each renders only its assigned blocks, in order. */}
      {pages.map((indices, pi) => (
        <Page
          key={pi}
          pageNum={startPage + pi}
          totalPages={totalPages}
          project={project}
          logoUrl={logoUrl}
        >
          {pi > 0 && continuationHeader}
          {indices.map(idx => (
            <React.Fragment key={idx}>{blocks[idx]}</React.Fragment>
          ))}
        </Page>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Block builders — turn finding/section content into flat arrays of self-
//  contained React nodes that the paginator can pack into pages.
// ─────────────────────────────────────────────────────────────────────────────

// A heading + thin rule. Used at the top of every finding section
// (Description, Impact, …). Keeps the heading and rule together as one block.
function FindingSectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="rpt-fsec" style={{ marginBottom: 0 }}>
      <div className="rpt-fsec-hd">{children}</div>
      <div className="rpt-fsec-rule" />
    </div>
  );
}

// Build the block list for one finding. Each section header is its own block,
// each markdown paragraph/code-block/image is its own block — so the paginator
// can place them individually without ever splitting one mid-element.
function buildFindingBlocks(f: Finding): React.ReactNode[] {
  const assets: string[] = (() => { try { return JSON.parse(f.assets); } catch { return []; } })();
  const evidenceItems = f.evidence || [];
  const resolveImage = (src: string): string | null => {
    const ev = evidenceItems.find(e => e.id === src || e.filename === src);
    return ev?.content ?? null;
  };

  const blocks: React.ReactNode[] = [];

  // 1. Finding header — code, title, rules, and metadata grid kept together.
  blocks.push(
    <div key="finding-head">
      <div className="rpt-fid">Finding&nbsp;&nbsp;<b>{f.code}</b></div>
      <div className="rpt-ftitle">{f.title}</div>
      <div className="rpt-frules"><div className="a" /><div className="b" /></div>
      <div className="rpt-meta-grid">
        <div className="k">Severity</div>
        <div><Badge sev={f.severity} /></div>
        {f.cvss > 0 && (
          <>
            <div className="k">CVSS v3.1</div>
            <div>
              <b>{f.cvss}</b>
              {f.cvssVector && <span className="rpt-vec" style={{ marginLeft: 8 }}>{f.cvssVector}</span>}
            </div>
          </>
        )}
        {f.cwe       && <><div className="k">CWE</div>      <div><code className="rpt-icode">{f.cwe}</code></div></>}
        {f.owasp     && <><div className="k">OWASP</div>    <div><code className="rpt-icode">{f.owasp}</code></div></>}
        {f.component && <><div className="k">Component</div><div><code className="rpt-icode">{f.component}</code></div></>}
        {assets.length > 0 && <><div className="k">Affected</div><div><code className="rpt-icode">{assets[0]}</code></div></>}
      </div>
    </div>
  );

  // Helper: push a "Section Heading" + flattened markdown nodes as separate blocks
  const pushSection = (key: string, label: string, markdown: string) => {
    if (!markdown?.trim()) return;
    blocks.push(<FindingSectionHead key={`${key}-hd`}>{label}</FindingSectionHead>);
    const nodes = renderMarkdownToNodes(markdown, resolveImage);
    nodes.forEach((node, i) => blocks.push(<React.Fragment key={`${key}-${i}`}>{node}</React.Fragment>));
  };

  pushSection('desc',  'Description',      f.description);

  if (assets.length > 1) {
    blocks.push(<FindingSectionHead key="scope-hd">Affected Scope</FindingSectionHead>);
    blocks.push(
      <ul key="scope-list" className="rpt-ul">
        {assets.map((a, i) => <li key={i}><code className="rpt-icode">{a}</code></li>)}
      </ul>
    );
  }

  pushSection('impact', 'Impact',           f.impact);
  pushSection('rem',    'Recommendations',  f.remediation);
  pushSection('repro',  'Technical Details', f.reproduction);

  // References — smaller font, wrap in a styled container at the block level.
  if (f.references?.trim()) {
    blocks.push(<FindingSectionHead key="refs-hd">References</FindingSectionHead>);
    const refNodes = renderMarkdownToNodes(f.references, resolveImage);
    refNodes.forEach((node, i) => blocks.push(
      <div key={`refs-${i}`} style={{ fontSize: '8.5pt', color: 'var(--ink60)', lineHeight: 1.7 }}>
        {node}
      </div>
    ));
  }

  return blocks;
}

// ── Extract CSS from template source ─────────────────────────────────────────
function extractCSS(source: string): string {
  const t = source.trim();
  if (t.startsWith('/*') || t.startsWith(':root') || t.startsWith('.') || t.startsWith('@')) return t;
  const m = t.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return m ? m[1] : '';
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReportPreview({ project, findings, counts, riskScore, latestReport, templateCSS, teamMembers = [], reportId, allUsers = [], currentUserId }: Props) {
  const [generating, setGenerating] = useState(false);
  const [generated,  setGenerated]  = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [logoUrl, setLogoUrl] = useState('');

  // Fetch logo on mount
  React.useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      const logo = d.settings?.logo;
      if (logo) setLogoUrl(logo);
    }).catch(() => {});
  }, []);

  // Review workflow state
  const [reportStatus, setReportStatus] = useState<string>(latestReport?.status || 'draft');
  const [selectedReviewerId, setSelectedReviewerId] = useState('');
  const [reviewerName, setReviewerName] = useState(() => {
    // Pre-populate reviewer name if report is already in-review
    if (latestReport?.status === 'in-review' && latestReport?.reviewerId) {
      return allUsers.find(u => u.id === latestReport.reviewerId)?.name || '';
    }
    return '';
  });
  const [rejectComment, setRejectComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Whether the current user is the assigned reviewer
  const isAssignedReviewer = !!(currentUserId && latestReport?.reviewerId && currentUserId === latestReport.reviewerId);

  async function submitReview(action: 'submit' | 'approve' | 'reject') {
    if (!reportId) return;
    setReviewSubmitting(true);
    setReviewError('');
    try {
      const body: Record<string, string> = { action };
      if (action === 'submit') body.reviewerId = selectedReviewerId;
      if (action === 'reject') body.comment = rejectComment;

      const res = await fetch(`/api/reports/${reportId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setReviewError(data.error || 'Failed to submit review action');
      } else {
        if (action === 'submit') {
          setReportStatus('in-review');
          const rv = allUsers.find(u => u.id === selectedReviewerId);
          if (rv) setReviewerName(rv.name);
        } else if (action === 'approve') {
          setReportStatus('approved');
        } else if (action === 'reject') {
          setReportStatus('rejected');
        }
      }
    } catch {
      setReviewError('Network error');
    } finally {
      setReviewSubmitting(false);
    }
  }
  // Stable date string — computed client-side only to avoid SSR hydration mismatch
  const [todayStr, setTodayStr] = useState('');
  React.useEffect(() => {
    setTodayStr(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, []);
  const [pageCounts, setPageCounts] = useState<Record<string, number>>(
    () => ({ __exec: 1, __strat: 1, __tech: 1, __overview: 1, ...Object.fromEntries(findings.map(f => [f.id, 1])) })
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const onPageCount = useCallback((id: string, n: number) => {
    setPageCounts(prev => prev[id] === n ? prev : { ...prev, [id]: n });
  }, []);

  // Parse scope
  const scopeRows: ScopeRow[] = (() => {
    try {
      const p = JSON.parse(project.scope);
      return Array.isArray(p) ? p.map((item: unknown) => {
        if (typeof item === 'string') return { asset: item, type: '', notes: '' };
        const o = item as Record<string, string>;
        return { asset: o.asset || '', type: o.type || '', notes: o.notes || '' };
      }) : [];
    } catch { return []; }
  })();

  const sorted = [...findings].sort((a, b) =>
    SEV_ORDER.indexOf(a.severity as Sev) - SEV_ORDER.indexOf(b.severity as Sev)
  );

  const totalFindings = Object.values(counts).reduce((a, b) => a + b, 0);
  const critHigh = (counts.critical || 0) + (counts.high || 0);

  // Active severity groups (non-empty, in order)
  const activeSevGroups = SEV_ORDER.filter(s => (counts[s] || 0) > 0);

  // ── Page numbering ──────────────────────────────────────────────────────────
  // Fixed pages: 1=Cover, 2=DocControl, 3=TOC
  // Variable-length sections paginate dynamically using PaginatedBlocks component
  const FIXED = 3; // cover, doc-control, TOC
  const execStartPage     = FIXED + 1;   // always page 4
  const stratStartPage    = execStartPage     + (pageCounts['__exec']     || 1);
  const techStartPage     = stratStartPage    + (pageCounts['__strat']    || 1);
  const overviewStartPage = techStartPage     + (pageCounts['__tech']     || 1);
  let pageCounter         = overviewStartPage + (pageCounts['__overview'] || 1);

  const sevSectionPages: Record<string, number> = {};
  const findingStartPages: Record<string, number> = {};

  // Build sev section numbering (4.1, 4.2, ...)
  const sevSubNums: Record<string, string> = {};
  activeSevGroups.forEach((sev, i) => {
    sevSubNums[sev] = `4.${i + 1}`;
    sevSectionPages[sev] = pageCounter;
    pageCounter += 1; // 1 intro page per group
    const groupFindings = sorted.filter(f => f.severity === sev);
    for (const f of groupFindings) {
      findingStartPages[f.id] = pageCounter;
      pageCounter += pageCounts[f.id] || 1;
    }
  });

  const appendixAPage = pageCounter;
  const appendixBPage = pageCounter + 1;
  const appendixCPage = pageCounter + 2;
  const totalPages    = pageCounter + 2;

  // ── Scroll helper ───────────────────────────────────────────────────────────
  function scrollToPage(n: number) {
    const el = scrollRef.current?.querySelector(`[data-page="${n}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Generate report ─────────────────────────────────────────────────────────
  async function requestPDF(action: 'export' | 'save') {
    if (action === 'save') setGenerating(true);
    else setExporting(true);

    try {
      // Get the report HTML
      const reportElement = scrollRef.current;
      if (!reportElement) throw new Error('Report not found');

      const html = reportElement.innerHTML;
      const css = DEFAULT_CSS;

      // Wrap with full HTML document structure
      const fullHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              ${css}
            </style>
          </head>
          <body>
            <div id="rpt-area">
              ${html}
            </div>
          </body>
        </html>
      `;

      // Send to server for PDF generation
      const response = await fetch('/api/reports/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          html: fullHtml,
          filename: `${project.code}-report-${new Date().toISOString().split('T')[0]}.pdf`,
          action, // 'export' or 'save'
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.details || error.error || 'Failed to generate PDF');
      }

      if (action === 'export') {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const result = await response.json();
          const downloadLink = document.createElement('a');
          downloadLink.href = result.url;
          downloadLink.download = result.filename || `${project.code}-report.pdf`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        } else {
          const blob = await response.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const downloadLink = document.createElement('a');
          downloadLink.href = downloadUrl;
          downloadLink.download = `${project.code}-report-${new Date().toISOString().split('T')[0]}.pdf`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          window.URL.revokeObjectURL(downloadUrl);
        }
      } else {
        setGenerated(true);
        setTimeout(() => setGenerated(false), 3000);
      }
    } catch (error) {
      console.error('Generate error:', error);
      alert('Error generating report: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      if (action === 'save') setGenerating(false);
      else setExporting(false);
    }
  }

  const css = DEFAULT_CSS;

  // ── Posture ─────────────────────────────────────────────────────────────────
  const posture      = critHigh >= 3 ? 'Critical' : critHigh >= 1 ? 'Elevated' : totalFindings > 0 ? 'Moderate' : 'Low';
  const postureColor = critHigh >= 3 ? 'var(--crit)' : critHigh >= 1 ? 'var(--high)' : totalFindings > 0 ? 'var(--med)' : 'var(--info)';

  return (
    <>
      <style>{css}</style>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ══════════════════════ PAGES AREA ══════════════════════ */}
        <div
          id="rpt-area"
          ref={scrollRef}
          className="thin-scroll"
          style={{ flex: 1, overflowY: 'auto', padding: '40px 0 80px', background: '#2b2824' }}
        >

          {/* ══ PAGE 1 — COVER ══ */}
          <Page id="page-1" pageNum={1} totalPages={totalPages} project={project} cover logoUrl={logoUrl}>
            <div className="rpt-cover-inner">
              <div style={{ height: '2cm' }} />
              <div className="rpt-eyebrow">{project.engagement}</div>
              <div className="rpt-cover-rule" />
              <div className="rpt-cover-h1">Penetration Test<br />Report</div>
              <div className="rpt-cover-lede">Prepared for <b>{project.name}</b></div>
              {/* Logo below "Prepared for" */}
              {logoUrl && (
                <div style={{ textAlign: 'center', marginTop: '1.2cm', marginBottom: '1.5cm', height: '2.5cm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={logoUrl} alt="Logo" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                </div>
              )}
              <div style={{ height: logoUrl ? '0.8cm' : '1.5cm' }} />
              <div className="rpt-cover-meta">
                <div className="k">Engagement</div><div>{project.code}</div>
                <div className="k">Window</div><div>{project.startDate} – {project.endDate}</div>
                <div className="k">Version</div><div>{latestReport?.version || '1.0'}</div>
                <div className="k">Issued</div><div suppressHydrationWarning>{todayStr}</div>
                <div className="k">Lead</div><div>{project.lead?.name || 'N/A'}</div>
                <div className="k">Team</div>
                <div>
                  {teamMembers.length > 0
                    ? teamMembers.map(m => m.name).join(', ')
                    : project.lead?.name || 'N/A'}
                </div>
                <div className="k">Classification</div><div>Confidential — Restricted</div>
              </div>
            </div>
          </Page>

          {/* ══ PAGE 2 — DOCUMENT CONTROL ══ */}
          <Page id="page-2" pageNum={2} totalPages={totalPages} project={project} logoUrl={logoUrl}>
            <SecHead num="0">Document Control</SecHead>
            <SubHead num="0.1">Revision History</SubHead>
            <table className="rpt-table">
              <thead><tr><th style={{ width: '10%' }}>Version</th><th style={{ width: '20%' }}>Date</th><th style={{ width: '25%' }}>Author</th><th>Description</th></tr></thead>
              <tbody>
                <tr>
                  <td>{latestReport?.version || '1.0'}</td>
                  <td suppressHydrationWarning>{todayStr}</td>
                  <td>{project.lead?.name || 'N/A'}</td>
                  <td>Initial release</td>
                </tr>
              </tbody>
            </table>

            <SubHead num="0.2">Confidentiality Notice</SubHead>
            <p className="rpt-p">
              This document contains confidential and proprietary information belonging to the client and the assessing firm.
              It is intended solely for the use of the named recipient(s). Disclosure, copying, distribution, or use of the
              contents of this document by any person other than the intended recipient is strictly prohibited.
            </p>
            <p className="rpt-p">
              The findings, recommendations, and opinions expressed in this report reflect the state of the assessed systems
              at the time of testing only. The assessing firm accepts no liability for the use or misuse of information
              contained herein.
            </p>
            <div className="rpt-callout">
              <b>Distribution:</b> This report is classified <em>Confidential — Restricted</em>.
              Retain securely and do not transmit over unencrypted channels.
              Evidence and raw data are retained for 90 days and then cryptographically shredded.
            </div>
          </Page>

          {/* ══ PAGE 3 — TABLE OF CONTENTS ══ */}
          <Page id="page-3" pageNum={3} totalPages={totalPages} project={project} logoUrl={logoUrl}>
            <SecHead num="">Contents</SecHead>

            {/* Document Control */}
            <TocRow level="l1" num="0" title="Document Control" page={2} onClick={() => scrollToPage(2)} />
            <TocRow level="l2" num="0.1" title="Revision History" page={2} onClick={() => scrollToPage(2)} />
            <TocRow level="l2" num="0.2" title="Confidentiality Notice" page={2} onClick={() => scrollToPage(2)} />

            {/* Executive Summary */}
            <TocRow level="l1" num="1" title="Executive Summary" page={execStartPage} onClick={() => scrollToPage(execStartPage)} />
            <TocRow level="l2" num="1.1" title="Findings at a Glance" page={execStartPage} onClick={() => scrollToPage(execStartPage)} />
            <TocRow level="l2" num="1.2" title="Project Scope" page={execStartPage} onClick={() => scrollToPage(execStartPage)} />
            <TocRow level="l2" num="1.3" title="Key Security Strengths" page={execStartPage} onClick={() => scrollToPage(execStartPage)} />
            <TocRow level="l2" num="1.4" title="Key Areas for Improvement" page={execStartPage} onClick={() => scrollToPage(execStartPage)} />

            {/* Strategic Recommendations */}
            <TocRow level="l1" num="2" title="Strategic Recommendations" page={stratStartPage} onClick={() => scrollToPage(stratStartPage)} />
            <TocRow level="l2" num="2.1" title="Immediate Actions (0–30 Days)" page={stratStartPage} onClick={() => scrollToPage(stratStartPage)} />
            <TocRow level="l2" num="2.2" title="Short-Term Improvements (30–90 Days)" page={stratStartPage} onClick={() => scrollToPage(stratStartPage)} />
            <TocRow level="l2" num="2.3" title="Long-Term Security Hardening" page={stratStartPage} onClick={() => scrollToPage(stratStartPage)} />

            {/* Technical Details */}
            <TocRow level="l1" num="3" title="Technical Details" page={techStartPage} onClick={() => scrollToPage(techStartPage)} />
            <TocRow level="l2" num="3.1" title="Technical Scope" page={techStartPage} onClick={() => scrollToPage(techStartPage)} />
            <TocRow level="l2" num="3.2" title="Testing Details" page={techStartPage} onClick={() => scrollToPage(techStartPage)} />
            <TocRow level="l2" num="3.3" title="Engagement Timeline" page={techStartPage} onClick={() => scrollToPage(techStartPage)} />

            {/* Detailed Findings */}
            <TocRow level="l1" num="4" title="Detailed Findings" page={overviewStartPage} onClick={() => scrollToPage(overviewStartPage)} />
            {activeSevGroups.map(sev => {
              const subNum = sevSubNums[sev];
              const secPage = sevSectionPages[sev];
              const groupFindings = sorted.filter(f => f.severity === sev);
              return (
                <React.Fragment key={sev}>
                  <TocRow level="l2" num={subNum} title={SEV_LABEL[sev] + ' Findings'} page={secPage} onClick={() => scrollToPage(secPage)} />
                  {groupFindings.map(f => (
                    <TocRow key={f.id} level="l3" title={f.title} page={findingStartPages[f.id]} code={f.code} onClick={() => scrollToPage(findingStartPages[f.id])} />
                  ))}
                </React.Fragment>
              );
            })}

            {/* Appendices */}
            <TocRow level="l1" title="Appendix A — CVSS Severity Ratings" page={appendixAPage} onClick={() => scrollToPage(appendixAPage)} />
            <TocRow level="l1" title="Appendix B — Tools and Techniques" page={appendixBPage} onClick={() => scrollToPage(appendixBPage)} />
            <TocRow level="l1" title="Appendix C — Glossary" page={appendixCPage} onClick={() => scrollToPage(appendixCPage)} />
          </Page>

          {/* ══ PAGES 4+ — EXECUTIVE SUMMARY (block-paginated) ══ */}
          {(() => {
            const blocks: React.ReactNode[] = [];
            blocks.push(<SecHead key="head" num="1">Executive Summary</SecHead>);
            if (project.executiveSummary) {
              renderMarkdownToNodes(project.executiveSummary).forEach((n, i) =>
                blocks.push(<React.Fragment key={`exec-md-${i}`}>{n}</React.Fragment>));
            } else {
              blocks.push(
                <p key="exec-default" className="rpt-p">
                  {`A total of ${totalFindings} ${totalFindings === 1 ? 'vulnerability was' : 'vulnerabilities were'} identified during the ${project.engagement} assessment of ${project.name}.` +
                  (critHigh > 0 ? ` ${critHigh} critical or high-severity ${critHigh === 1 ? 'finding requires' : 'findings require'} immediate remediation.` : ' No critical or high-severity findings were identified.')}
                </p>
              );
            }
            blocks.push(<SubHead key="sub-1.1" num="1.1">Findings at a Glance</SubHead>);
            blocks.push(<p key="glance-p" className="rpt-p">All issues identified during the engagement are summarized in <b>Table 1</b>.</p>);
            blocks.push(
              <table key="glance-table" className="rpt-rsum">
                <thead>
                  <tr>
                    <th className="c">Critical</th>
                    <th className="h">High</th>
                    <th className="m">Medium</th>
                    <th className="l">Low</th>
                    <th className="i">Informational</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ color: counts.critical ? 'var(--crit)' : undefined }}>{counts.critical || 0}</td>
                    <td style={{ color: counts.high ? 'var(--high)' : undefined }}>{counts.high || 0}</td>
                    <td style={{ color: counts.medium ? 'var(--med)' : undefined }}>{counts.medium || 0}</td>
                    <td>{counts.low || 0}</td>
                    <td style={{ color: counts.info ? 'var(--info)' : undefined }}>{counts.info || 0}</td>
                  </tr>
                </tbody>
              </table>
            );
            blocks.push(<div key="glance-cap" className="rpt-caption"><b>Table 1.</b> Total findings by severity.</div>);
            blocks.push(<SubHead key="sub-1.2" num="1.2">Project Scope</SubHead>);
            blocks.push(<p key="scope-p" className="rpt-p">The following assets were in scope for this engagement:</p>);
            if (scopeRows.length > 0) {
              blocks.push(
                <ul key="scope-list" className="rpt-ul">
                  {scopeRows.map((r, i) => (
                    <li key={i}>
                      <span className="rpt-code">{r.asset}</span>
                      {r.type && <span style={{ color: 'var(--ink60)', marginLeft: 8 }}>{r.type}</span>}
                      {r.notes && <span style={{ color: 'var(--ink60)', marginLeft: 4 }}>— {r.notes}</span>}
                    </li>
                  ))}
                </ul>
              );
            } else {
              blocks.push(<p key="scope-empty" className="rpt-p" style={{ color: 'var(--ink60)' }}>No scope defined.</p>);
            }
            blocks.push(<SubHead key="sub-1.3" num="1.3">Key Security Strengths</SubHead>);
            blocks.push(
              <p key="strengths-p" className="rpt-p">
                {totalFindings === 0
                  ? 'No significant vulnerabilities were identified. The assessed environment demonstrated strong security posture.'
                  : counts.critical === 0 && counts.high === 0
                  ? 'No critical or high-severity findings were identified. The assessed controls are generally effective.'
                  : 'The environment demonstrated baseline security controls. Standard authentication mechanisms and input validation were observed on primary endpoints.'}
              </p>
            );
            blocks.push(<SubHead key="sub-1.4" num="1.4">Key Areas for Improvement</SubHead>);
            if (sorted.slice(0, 3).length > 0) {
              blocks.push(
                <ul key="areas-list" className="rpt-ul">
                  {sorted.slice(0, 3).map(f => (
                    <li key={f.id}>
                      <b><span style={{ color: SEV_COLOR[f.severity], marginRight: 4 }}>[{f.severity.toUpperCase()}]</span>{f.title}</b>
                      {f.remediation ? ` — ${f.remediation.replace(/^#{1,3}\s[^\n]*/gm, '').trim().split('\n')[0].slice(0, 100)}` : ''}
                    </li>
                  ))}
                </ul>
              );
            } else {
              blocks.push(<p key="areas-empty" className="rpt-p" style={{ color: 'var(--ink60)' }}>No specific areas identified.</p>);
            }
            return <PaginatedBlocks id="__exec" blocks={blocks} startPage={execStartPage} totalPages={totalPages} project={project} onPageCount={onPageCount} />;
          })()}

          {/* ══ STRATEGIC RECOMMENDATIONS (block-paginated) ══ */}
          {(() => {
            const blocks: React.ReactNode[] = [];
            const critHighList = sorted.filter(f => f.severity === 'critical' || f.severity === 'high');
            const medList = sorted.filter(f => f.severity === 'medium');
            blocks.push(<SecHead key="head" num="2">Strategic Recommendations</SecHead>);
            blocks.push(<SubHead key="sub-2.1" num="2.1">Immediate Actions (0–30 Days)</SubHead>);
            if (critHighList.length > 0) {
              blocks.push(<p key="ch-p" className="rpt-p">The following critical and high-severity findings require immediate attention:</p>);
              blocks.push(
                <ul key="ch-list" className="rpt-ul">
                  {critHighList.map(f => (
                    <li key={f.id}>
                      <Badge sev={f.severity} />{' '}
                      <b>{f.code}</b> — {f.title}
                      {f.remediation && <span style={{ color: 'var(--ink60)' }}>{': '}{f.remediation.replace(/^#{1,3}\s[^\n]*/gm,'').trim().split('\n')[0].slice(0, 80)}</span>}
                    </li>
                  ))}
                </ul>
              );
            } else {
              blocks.push(<p key="ch-empty" className="rpt-p" style={{ color: 'var(--ink60)' }}>No critical or high-severity findings requiring immediate remediation.</p>);
            }
            blocks.push(<SubHead key="sub-2.2" num="2.2">Short-Term Improvements (30–90 Days)</SubHead>);
            if (medList.length > 0) {
              blocks.push(<p key="med-p" className="rpt-p">Address medium-severity findings to reduce overall attack surface:</p>);
              blocks.push(
                <ul key="med-list" className="rpt-ul">
                  {medList.map(f => (
                    <li key={f.id}>
                      <Badge sev={f.severity} />{' '}
                      <b>{f.code}</b> — {f.title}
                    </li>
                  ))}
                </ul>
              );
            } else {
              blocks.push(<p key="med-empty" className="rpt-p" style={{ color: 'var(--ink60)' }}>No medium-severity findings in this assessment period.</p>);
            }
            blocks.push(<SubHead key="sub-2.3" num="2.3">Long-Term Security Hardening</SubHead>);
            blocks.push(<p key="lt-p" className="rpt-p">The following strategic initiatives are recommended to strengthen the overall security programme:</p>);
            blocks.push(
              <ul key="lt-list" className="rpt-ul">
                <li>Implement a continuous vulnerability management programme with quarterly assessments.</li>
                <li>Establish a formal secure development lifecycle (SDLC) with security gates at design, code review, and deployment stages.</li>
                <li>Deploy a security information and event management (SIEM) solution for real-time threat detection.</li>
                <li>Conduct annual penetration tests against all internet-facing assets and internal network segments.</li>
                {sorted.filter(f => f.severity === 'low' || f.severity === 'info').slice(0, 2).map(f => (
                  <li key={f.id}><b>{f.code}</b>: {f.title}</li>
                ))}
              </ul>
            );
            return <PaginatedBlocks id="__strat" blocks={blocks} startPage={stratStartPage} totalPages={totalPages} project={project} logoUrl={logoUrl} onPageCount={onPageCount} />;
          })()}

          {/* ══ TECHNICAL DETAILS (block-paginated) ══ */}
          {(() => {
            const blocks: React.ReactNode[] = [];
            blocks.push(<SecHead key="head" num="3">Technical Details</SecHead>);
            blocks.push(<SubHead key="sub-3.1" num="3.1">Technical Scope</SubHead>);
            blocks.push(<p key="ts-p" className="rpt-p">The following assets were evaluated during this engagement:</p>);
            blocks.push(
              <table key="ts-table" className="rpt-table">
                <thead><tr><th>Asset / URL</th><th style={{ width: '20%' }}>Type</th><th style={{ width: '30%' }}>Notes</th></tr></thead>
                <tbody>
                  {scopeRows.length > 0 ? scopeRows.map((r, i) => (
                    <tr key={i}>
                      <td><span className="rpt-code">{r.asset}</span></td>
                      <td>{r.type || '—'}</td>
                      <td style={{ color: 'var(--ink60)' }}>{r.notes || '—'}</td>
                    </tr>
                  )) : <tr><td colSpan={3} style={{ color: 'var(--ink60)' }}>No scope assets defined.</td></tr>}
                </tbody>
              </table>
            );
            blocks.push(<SubHead key="sub-3.2" num="3.2">Testing Methodology</SubHead>);
            if (project.methodology) {
              renderMarkdownToNodes(project.methodology).forEach((n, i) =>
                blocks.push(<React.Fragment key={`meth-${i}`}>{n}</React.Fragment>));
            } else {
              blocks.push(
                <p key="meth-default" className="rpt-p">
                  The engagement followed the <em>PTES</em> execution phases mapped to <em>OWASP WSTG v4.2</em> controls,
                  combining authenticated and unauthenticated test runs across the full assessment window.
                </p>
              );
            }
            blocks.push(
              <table key="phases-table" className="rpt-table">
                <thead><tr><th style={{ width: '8%' }}>#</th><th style={{ width: '28%' }}>Activity</th><th>Primary Tooling</th></tr></thead>
                <tbody>
                  {[
                    ['01', 'Reconnaissance',       'OSINT, DNS enumeration, asset discovery, Shodan'],
                    ['02', 'Threat Modelling',     'STRIDE analysis against service map'],
                    ['03', 'Vulnerability Analysis','Burp Suite Pro, Semgrep, Nuclei, manual testing'],
                    ['04', 'Exploitation',          'Controlled PoC — scoped to confirm impact only'],
                    ['05', 'Post-Exploitation',     'Read-only confirmation within agreed rules of engagement'],
                    ['06', 'Reporting',             'CVSS 3.1 scoring, CWE/OWASP mapping'],
                  ].map(([n, a, t]) => (
                    <tr key={n}>
                      <td className="rpt-code">{n}</td>
                      <td>{a}</td>
                      <td style={{ color: 'var(--ink60)' }}>{t}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
            blocks.push(<SubHead key="sub-3.3" num="3.3">Engagement Timeline</SubHead>);
            blocks.push(
              <table key="timeline-table" className="rpt-table">
                <thead><tr><th style={{ width: '35%' }}>Milestone</th><th>Date / Period</th></tr></thead>
                <tbody>
                  {[
                    ['Assessment Start',     project.startDate],
                    ['Assessment End',       project.endDate],
                    ['Report Issued',        todayStr],
                    ['Retest Window',        '90 days from report issue'],
                  ].map(([m, d]) => (
                    <tr key={m}><td>{m}</td><td><span className="rpt-code">{d}</span></td></tr>
                  ))}
                </tbody>
              </table>
            );
            blocks.push(
              <div key="roe-callout" className="rpt-callout">
                <b>Rules of Engagement —</b> No destructive testing, no customer PII handling, and no testing
                of out-of-scope third-party processors. Testing was conducted during agreed windows only.
              </div>
            );
            if (project.attackNarrative) {
              blocks.push(<SubHead key="sub-3.4" num="3.4">Attack Narrative</SubHead>);
              renderMarkdownToNodes(project.attackNarrative).forEach((n, i) =>
                blocks.push(<React.Fragment key={`narr-${i}`}>{n}</React.Fragment>));
            }
            return <PaginatedBlocks id="__tech" blocks={blocks} startPage={techStartPage} totalPages={totalPages} project={project} logoUrl={logoUrl} onPageCount={onPageCount} />;
          })()}

          {/* ══ DETAILED FINDINGS OVERVIEW (block-paginated) ══ */}
          {(() => {
            const blocks: React.ReactNode[] = [];
            blocks.push(<SecHead key="head" num="4">Detailed Findings</SecHead>);
            blocks.push(
              <p key="intro-p" className="rpt-p">
                {totalFindings > 0
                  ? `All ${totalFindings} identified ${totalFindings === 1 ? 'finding is' : 'findings are'} enumerated below, ordered by severity. Full technical details follow on subsequent pages.`
                  : 'No findings were identified during this engagement.'}
              </p>
            );
            blocks.push(
              <table key="ov-table" className="rpt-table">
                <thead>
                  <tr>
                    <th style={{ width: '12%' }}>ID</th>
                    <th style={{ width: '17%' }}>Severity</th>
                    <th>Title</th>
                    <th style={{ width: '18%' }}>Component</th>
                    <th style={{ width: '8%' }}>CVSS</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(f => (
                    <tr key={f.id}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '9pt' }}>{f.code}</td>
                      <td><Badge sev={f.severity} /></td>
                      <td>{f.title}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '9pt', color: 'var(--ink60)' }}>{f.component || '—'}</td>
                      <td style={{ fontWeight: 700, color: SEV_COLOR[f.severity] }}>{f.cvss > 0 ? f.cvss : '—'}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr><td colSpan={5} style={{ color: 'var(--ink60)', padding: '20px 7pt' }}>No findings recorded.</td></tr>
                  )}
                </tbody>
              </table>
            );
            blocks.push(
              <p key="ov-foot" className="rpt-p" style={{ fontSize: '9pt', color: 'var(--ink60)', marginTop: 20 }}>
                Refer to Appendix A for CVSS severity rating definitions. Each finding on the following pages
                includes full technical details, reproduction steps, impact analysis, and remediation guidance.
              </p>
            );
            return <PaginatedBlocks id="__overview" blocks={blocks} startPage={overviewStartPage} totalPages={totalPages} project={project} logoUrl={logoUrl} onPageCount={onPageCount} />;
          })()}

          {/* ══ FINDING SECTION PAGES + INDIVIDUAL FINDINGS ══ */}
          {activeSevGroups.map(sev => {
            const groupFindings = sorted.filter(f => f.severity === sev);
            const secPage       = sevSectionPages[sev];
            const subNum        = sevSubNums[sev];
            return (
              <React.Fragment key={sev}>
                {/* Severity section intro page */}
                <Page
                  pageNum={secPage}
                  totalPages={totalPages}
                  project={project}
                >
                  <SecHead num={subNum}>{SEV_LABEL[sev]} Findings</SecHead>
                  <div className={`rpt-sev-banner ${sev}`} style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <Badge sev={sev} />
                      <span style={{ fontSize: '10pt', fontWeight: 600 }}>
                        {counts[sev]} {counts[sev] === 1 ? 'finding' : 'findings'}
                      </span>
                      {riskScore > 0 && sev !== 'info' && (
                        <span style={{ marginLeft: 'auto', fontSize: '9pt', color: 'var(--ink60)' }}>
                          Avg CVSS: {(groupFindings.filter(f => f.cvss > 0).reduce((a, f) => a + f.cvss, 0) / (groupFindings.filter(f => f.cvss > 0).length || 1)).toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '10pt', lineHeight: 1.6, color: 'var(--ink80)' }}>
                      {sev === 'critical' && 'Critical findings represent direct, immediate threats exploitable with low effort. These require emergency remediation.'}
                      {sev === 'high'     && 'High-severity findings pose significant risk to system integrity, confidentiality, or availability. Remediate within 30 days.'}
                      {sev === 'medium'   && 'Medium-severity findings require non-trivial preconditions but materially weaken security posture. Remediate within 90 days.'}
                      {sev === 'low'      && 'Low-severity findings have limited impact in isolation. Address as part of regular security hygiene within 180 days.'}
                      {sev === 'info'     && 'Informational observations worth noting for hardening or hygiene. No immediate risk, but recommended for long-term improvement.'}
                    </p>
                  </div>

                  <table className="rpt-table" style={{ marginTop: 14 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '15%' }}>ID</th>
                        <th>Title</th>
                        <th style={{ width: '12%' }}>CVSS</th>
                        <th style={{ width: '12%' }}>Page</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupFindings.map(f => (
                        <tr key={f.id}>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '9pt' }}>{f.code}</td>
                          <td>{f.title}</td>
                          <td style={{ fontWeight: 700, color: SEV_COLOR[f.severity] }}>{f.cvss > 0 ? f.cvss : '—'}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '9pt' }}>{findingStartPages[f.id]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Page>

                {/* Individual finding pages — block-paginated */}
                {groupFindings.map(f => (
                  <PaginatedBlocks
                    key={f.id}
                    id={f.id}
                    blocks={buildFindingBlocks(f)}
                    startPage={findingStartPages[f.id]}
                    totalPages={totalPages}
                    project={project}
                    onPageCount={onPageCount}
                    continuationHeader={
                      <div style={{ marginBottom: 10 }}>
                        <div className="rpt-fid">Finding&nbsp;&nbsp;<b>{f.code}</b>&nbsp;&nbsp;<em style={{ fontWeight: 400, letterSpacing: 0 }}>continued</em></div>
                        <div style={{ height: '.4pt', background: 'var(--rule)', margin: '6px 0 0' }} />
                        <div style={{ height: '1.4pt', background: 'var(--rpt-accent)', marginTop: 1, marginBottom: 10 }} />
                      </div>
                    }
                  />
                ))}
              </React.Fragment>
            );
          })}

          {/* ══ APPENDIX A — CVSS ══ */}
          <Page pageNum={appendixAPage} totalPages={totalPages} project={project} logoUrl={logoUrl}>
            <SecHead num="">Appendix A — CVSS Severity Ratings</SecHead>
            <p className="rpt-p" style={{ marginTop: 6 }}>
              Severity is assigned per finding using the <em>Common Vulnerability Scoring System v3.1</em>.
              Each finding records both the numerical score and vector string, allowing re-derivation
              against custom environmental context.
            </p>
            <table className="rpt-table">
              <thead className="dk">
                <tr>
                  <th style={{ width: '20%' }}>Severity</th>
                  <th style={{ width: '18%' }}>CVSS Range</th>
                  <th>Definition</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><Badge sev="critical" /></td>
                  <td>9.0 – 10.0</td>
                  <td>Direct, immediate threat. Exploitable by an unauthenticated attacker with low effort. <b>Remediate immediately.</b></td>
                </tr>
                <tr>
                  <td><Badge sev="high" /></td>
                  <td>7.0 – 8.9</td>
                  <td>Significant threat to sensitive systems or data, or a meaningful component of an attack chain. <b>Remediate within 30 days.</b></td>
                </tr>
                <tr>
                  <td><Badge sev="medium" /></td>
                  <td>4.0 – 6.9</td>
                  <td>Threat requiring non-trivial preconditions but materially weakening posture. <b>Remediate within 90 days.</b></td>
                </tr>
                <tr>
                  <td><Badge sev="low" /></td>
                  <td>0.1 – 3.9</td>
                  <td>Minor exposure with limited impact in isolation. <b>Address as part of regular hygiene within 180 days.</b></td>
                </tr>
                <tr>
                  <td><Badge sev="info" /></td>
                  <td>0.0</td>
                  <td>Observation worth noting for hardening or hygiene. No immediate risk.</td>
                </tr>
              </tbody>
            </table>
            <div className="rpt-callout" style={{ marginTop: 16 }}>
              <b>Note —</b> CVSS scores reflect the <em>base score</em> only. Temporal and environmental
              modifiers are noted where relevant. Clients are encouraged to apply their own environmental
              vector to adjust scores to their specific context.
            </div>
          </Page>

          {/* ══ APPENDIX B — TOOLS ══ */}
          <Page pageNum={appendixBPage} totalPages={totalPages} project={project} logoUrl={logoUrl}>
            <SecHead num="">Appendix B — Tools and Techniques</SecHead>
            <p className="rpt-p" style={{ marginTop: 6 }}>
              The following tools and techniques were employed during the assessment. All tools were used
              in accordance with the agreed rules of engagement.
            </p>
            <table className="rpt-table">
              <thead className="dk">
                <tr>
                  <th style={{ width: '25%' }}>Tool / Technique</th>
                  <th style={{ width: '20%' }}>Category</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Burp Suite Professional', 'Web Proxy',         'HTTP interception, active scanning, session analysis'],
                  ['Nuclei',                  'Scanner',           'Template-based vulnerability detection across web surfaces'],
                  ['Nmap / Naabu',            'Network Scanner',   'Port discovery, service version detection, OS fingerprinting'],
                  ['ffuf / Feroxbuster',      'Fuzzing',           'Directory enumeration, parameter fuzzing, wordlist attacks'],
                  ['Semgrep',                 'SAST',              'Static analysis for common vulnerability patterns in source code'],
                  ['SQLMap',                  'Exploitation',      'Automated SQL injection detection and exploitation'],
                  ['Amass / Subfinder',       'OSINT / Recon',     'Subdomain enumeration and asset discovery'],
                  ['JWT Tool',                'Token Analysis',     'JWT signature algorithm confusion and secret brute-forcing'],
                  ['Hashcat',                 'Password Cracking',  'Offline hash cracking with GPU acceleration'],
                  ['Manual Testing',          'Methodology',        'Logic flaws, business process abuse, authentication bypass'],
                ].map(([tool, cat, purpose]) => (
                  <tr key={tool}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '9pt' }}>{tool}</td>
                    <td>{cat}</td>
                    <td style={{ color: 'var(--ink60)' }}>{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Page>

          {/* ══ APPENDIX C — GLOSSARY ══ */}
          <Page pageNum={appendixCPage} totalPages={totalPages} project={project} logoUrl={logoUrl}>
            <SecHead num="">Appendix C — Glossary</SecHead>
            <p className="rpt-p" style={{ marginTop: 6 }}>
              Key terms used throughout this report are defined below.
            </p>
            <table className="rpt-table">
              <thead className="dk">
                <tr><th style={{ width: '30%' }}>Term</th><th>Definition</th></tr>
              </thead>
              <tbody>
                {[
                  ['Attack Surface',          'The set of all points at which an attacker can enter or extract data from a system.'],
                  ['Authentication Bypass',   'A vulnerability allowing access to protected resources without valid credentials.'],
                  ['CVSS',                    'Common Vulnerability Scoring System — a standardised framework for rating vulnerability severity.'],
                  ['CWE',                     'Common Weakness Enumeration — a community-developed list of software and hardware weakness types.'],
                  ['IDOR',                    'Insecure Direct Object Reference — direct access to objects (records, files) using user-controlled input.'],
                  ['Lateral Movement',        'Techniques used by attackers to progressively move through a network after initial compromise.'],
                  ['OWASP',                   'Open Worldwide Application Security Project — provides freely available security guidance and tools.'],
                  ['Penetration Test',        'Authorised simulated cyberattack against a computer system to evaluate security weaknesses.'],
                  ['PoC',                     'Proof of Concept — a demonstration that a vulnerability exists and can be exploited.'],
                  ['PTES',                    'Penetration Testing Execution Standard — a common methodology framework for penetration tests.'],
                  ['Remediation',             'The process of fixing or mitigating a discovered security vulnerability.'],
                  ['SQL Injection',           'Insertion of malicious SQL code into a query via user-supplied input fields.'],
                  ['STRIDE',                  'A threat modelling framework covering Spoofing, Tampering, Repudiation, Info Disclosure, DoS, Elevation.'],
                  ['XSS',                     'Cross-Site Scripting — injection of malicious scripts into web pages viewed by other users.'],
                ].map(([term, def]) => (
                  <tr key={term}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '9pt' }}>{term}</td>
                    <td style={{ fontSize: '9.5pt', color: 'var(--ink80)' }}>{def}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Page>

        </div>

        {/* ══ SIDEBAR ══ */}
        <div className="thin-scroll no-print" style={{
          width: 272, borderLeft: '1px solid var(--line-1)', background: 'var(--bg-1)',
          overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column',
        }}>
          {/* Template */}
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 7 }}>Template</div>
            <select className="input" style={{ width: '100%' }} defaultValue="Technical Report" disabled>
              <option>Technical Report</option>
            </select>
          </div>

          {/* Navigate */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 7 }}>Navigate</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {/* Fixed pages */}
              {[
                { p: 1, label: 'Cover' }, { p: 2, label: 'DocCtl' }, { p: 3, label: 'ToC' },
                { p: 4, label: 'Exec' },  { p: 5, label: 'Strat' },  { p: 6, label: 'Tech' },
                { p: 7, label: 'Ovw' },
              ].map(({ p, label }) => (
                <button key={`${p}-${label}`} onClick={() => scrollToPage(p)} style={{
                  minWidth: 46, height: 44, padding: '0 4px',
                  background: 'var(--paper)', border: '1px solid var(--line-2)',
                  cursor: 'pointer', fontSize: 8, fontFamily: 'monospace',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 2, borderRadius: 2,
                }}>
                  <span style={{ color: '#8a857a' }}>{p}</span>
                  <span style={{ color: '#3a3830', fontSize: 7, letterSpacing: '0.04em' }}>{label}</span>
                </button>
              ))}
              {/* Sev section + finding pages */}
              {activeSevGroups.map(sev => {
                const groupFindings = sorted.filter(f => f.severity === sev);
                return (
                  <React.Fragment key={sev}>
                    <button onClick={() => scrollToPage(sevSectionPages[sev])} style={{
                      minWidth: 46, height: 44, padding: '0 4px',
                      background: SEV_COLOR[sev] + '18', border: `1px solid ${SEV_COLOR[sev]}44`,
                      cursor: 'pointer', fontSize: 8, fontFamily: 'monospace',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', gap: 2, borderRadius: 2,
                    }}>
                      <span style={{ color: SEV_COLOR[sev], fontWeight: 700 }}>{sevSectionPages[sev]}</span>
                      <span style={{ color: SEV_COLOR[sev], fontSize: 7 }}>{sev.slice(0, 4).toUpperCase()}</span>
                    </button>
                    {groupFindings.flatMap(f => {
                      const count = pageCounts[f.id] || 1;
                      return Array.from({ length: count }, (_, pi) => ({
                        p: findingStartPages[f.id] + pi,
                        label: pi === 0 ? f.code : `${f.code}+${pi + 1}`,
                        sev: f.severity,
                      }));
                    }).map(({ p, label, sev: s }) => (
                      <button key={`${p}-${label}`} onClick={() => scrollToPage(p)} style={{
                        minWidth: 46, height: 44, padding: '0 4px',
                        background: 'var(--paper)', border: '1px solid var(--line-2)',
                        cursor: 'pointer', fontSize: 8, fontFamily: 'monospace',
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', gap: 2, borderRadius: 2,
                      }}>
                        <span style={{ color: '#8a857a' }}>{p}</span>
                        <span style={{ color: SEV_COLOR[s], fontSize: 7, letterSpacing: '0.04em' }}>{label}</span>
                      </button>
                    ))}
                  </React.Fragment>
                );
              })}
              {/* Appendices */}
              {[
                { p: appendixAPage, label: 'App.A' },
                { p: appendixBPage, label: 'App.B' },
                { p: appendixCPage, label: 'App.C' },
              ].map(({ p, label }) => (
                <button key={`${p}-${label}`} onClick={() => scrollToPage(p)} style={{
                  minWidth: 46, height: 44, padding: '0 4px',
                  background: 'var(--paper)', border: '1px solid var(--line-2)',
                  cursor: 'pointer', fontSize: 8, fontFamily: 'monospace',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 2, borderRadius: 2,
                }}>
                  <span style={{ color: '#8a857a' }}>{p}</span>
                  <span style={{ color: '#3a3830', fontSize: 7 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 7 }}>Report stats</div>
            {[
              ['Total findings', totalFindings],
              ['Critical / High', critHigh],
              ['Avg risk score',  riskScore || '—'],
              ['Est. pages',      totalPages],
              ['Posture',         posture],
              ['Status',          latestReport?.status || 'draft'],
            ].map(([k, v]) => (
              <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11 }}>
                <span style={{ color: 'var(--ink-2)' }}>{k}</span>
                <span style={{ color: k === 'Posture' ? postureColor : 'var(--ink-0)', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Severity breakdown */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 7 }}>Severity breakdown</div>
            {SEV_ORDER.map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ width: 8, height: 8, background: SEV_COLOR[s], borderRadius: 1, flexShrink: 0 }} />
                <div style={{ fontSize: 11, color: 'var(--ink-2)', flex: 1, textTransform: 'capitalize' }}>{s}</div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: (counts[s] || 0) > 0 ? SEV_COLOR[s] : 'var(--ink-3)', fontWeight: 600 }}>
                  {counts[s] || 0}
                </div>
              </div>
            ))}
          </div>

          {/* Review Workflow */}
          {reportId && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-1)' }}>
              <div className="eyebrow" style={{ fontSize: 9, marginBottom: 10 }}>Review workflow</div>

              {/* Status banner */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, marginBottom: 12,
                background: reportStatus === 'approved' ? 'rgba(143,201,122,0.1)' :
                  reportStatus === 'rejected' ? 'rgba(255,92,58,0.1)' :
                  reportStatus === 'in-review' ? 'rgba(127,179,213,0.1)' : 'var(--bg-2)',
                border: `1px solid ${reportStatus === 'approved' ? 'rgba(143,201,122,0.25)' :
                  reportStatus === 'rejected' ? 'rgba(255,92,58,0.25)' :
                  reportStatus === 'in-review' ? 'rgba(127,179,213,0.25)' : 'var(--line-1)'}`,
              }}>
                <span style={{ fontSize: 16 }}>
                  {reportStatus === 'approved' ? '✅' : reportStatus === 'rejected' ? '❌' : reportStatus === 'in-review' ? '🔍' : '📝'}
                </span>
                <div>
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: reportStatus === 'approved' ? 'var(--status-resolved)' :
                      reportStatus === 'rejected' ? 'var(--sev-critical)' :
                      reportStatus === 'in-review' ? 'var(--sev-low)' : 'var(--ink-1)',
                    textTransform: 'capitalize',
                  }}>
                    {reportStatus === 'in-review' ? 'In Review' : reportStatus || 'Draft'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 1 }}>
                    {reportStatus === 'approved' && 'Report is final'}
                    {reportStatus === 'rejected' && 'Needs revision'}
                    {reportStatus === 'in-review' && (reviewerName ? `Assigned to ${reviewerName}` : 'Awaiting reviewer')}
                    {(!reportStatus || reportStatus === 'draft') && 'Ready to submit'}
                  </div>
                </div>
              </div>

              {reviewError && (
                <div style={{ fontSize: 11, color: 'var(--sev-critical)', marginBottom: 8, padding: '6px 8px', background: 'rgba(255,92,58,0.08)', borderRadius: 4, border: '1px solid rgba(255,92,58,0.2)' }}>
                  ⚠️ {reviewError}
                </div>
              )}

              {/* Draft or Rejected: submit for review */}
              {(reportStatus === 'draft' || reportStatus === 'rejected' || !reportStatus) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 2 }}>
                    {reportStatus === 'rejected' ? 'Revisions made? Resubmit for review:' : 'Assign a reviewer and submit:'}
                  </div>
                  <select
                    className="input"
                    style={{ width: '100%', fontSize: 11 }}
                    value={selectedReviewerId}
                    onChange={e => setSelectedReviewerId(e.target.value)}
                  >
                    <option value="">— Select reviewer —</option>
                    {allUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}
                    disabled={!selectedReviewerId || reviewSubmitting}
                    onClick={() => submitReview('submit')}
                  >
                    <Ico name="send" size={11} />
                    {reviewSubmitting ? 'Submitting…' : reportStatus === 'rejected' ? 'Resubmit for Review' : 'Submit for Review'}
                  </button>
                </div>
              )}

              {/* In-review: approve or reject — only shown to the assigned reviewer */}
              {reportStatus === 'in-review' && isAssignedReviewer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    className="btn btn-sm"
                    style={{ width: '100%', justifyContent: 'center', fontSize: 12, fontWeight: 600, padding: '8px 0',
                      background: 'rgba(143,201,122,0.12)', borderColor: 'rgba(143,201,122,0.35)', color: 'var(--status-resolved)' }}
                    disabled={reviewSubmitting}
                    onClick={() => submitReview('approve')}
                  >
                    ✅ {reviewSubmitting ? 'Approving…' : 'Approve Report'}
                  </button>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>Rejection reason (optional):</div>
                    <textarea
                      className="input"
                      placeholder="Describe what needs to be fixed…"
                      value={rejectComment}
                      onChange={e => setRejectComment(e.target.value)}
                      rows={2}
                      style={{ width: '100%', fontSize: 11, resize: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button
                    className="btn btn-sm"
                    style={{ width: '100%', justifyContent: 'center', fontSize: 12, fontWeight: 600, padding: '8px 0',
                      background: 'rgba(255,92,58,0.1)', borderColor: 'rgba(255,92,58,0.3)', color: 'var(--sev-critical)' }}
                    disabled={reviewSubmitting}
                    onClick={() => submitReview('reject')}
                  >
                    ❌ {reviewSubmitting ? 'Rejecting…' : 'Reject Report'}
                  </button>
                </div>
              )}

              {/* Approved final state */}
              {reportStatus === 'approved' && (
                <div style={{ fontSize: 12, color: 'var(--ink-2)', fontStyle: 'italic' }}>
                  This report has been approved and is ready for delivery.
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => requestPDF('export')}
              disabled={exporting}
            >
              <Ico name="download" size={14} /> {exporting ? 'Exporting…' : 'Export PDF'}
            </button>
            <button
              className="btn"
              style={{
                width: '100%', justifyContent: 'center',
                background: generated ? 'rgba(143,201,122,0.12)' : undefined,
                borderColor: generated ? 'rgba(143,201,122,0.3)' : undefined,
                color: generated ? 'var(--status-resolved)' : undefined,
              }}
              onClick={() => requestPDF('save')}
              disabled={generating}
            >
              <Ico name={generated ? 'check' : 'send'} size={14} />
              {generating ? 'Generating…' : generated ? 'Report saved' : 'Generate report'}
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
