'use client';

import React, { useState, useRef, useEffect } from 'react';
import { animate, stagger } from 'animejs';
import { Ico } from '@/components/chrome/icons';

const WEEK_LABELS = ['12w', '11w', '10w', '9w', '8w', '7w', '6w', '5w', '4w', '3w', '2w', 'Now'];

interface TrendDataPoint {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface SeverityTrendChartProps {
  data: TrendDataPoint[];
}

const SEV_META: { key: keyof TrendDataPoint; label: string; color: string }[] = [
  { key: 'critical', label: 'Critical', color: 'var(--sev-critical)' },
  { key: 'high',     label: 'High',     color: 'var(--sev-high)' },
  { key: 'medium',   label: 'Medium',   color: 'var(--sev-medium)' },
  { key: 'low',      label: 'Low',      color: 'var(--sev-low)' },
];

// SVG viewport in "drawing units" — we render the chart in a viewBox and let
// the browser scale it to the container width. Heights are absolute px so we
// can position the tooltip and labels precisely.
const VB_W = 520;
const VB_H = 180;
const CHART_TOP = 18;
const CHART_BOTTOM = 148;
const CHART_LEFT = 28;
const CHART_RIGHT = VB_W - 12;
const CHART_H = CHART_BOTTOM - CHART_TOP; // 130
const CHART_W = CHART_RIGHT - CHART_LEFT;

export function SeverityTrendChart({ data }: SeverityTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [view, setView] = useState<'stack' | 'lines'>('stack');
  const wrapperRef = useRef<HTMLElement | null>(null);

  // ── Totals + scale ─────────────────────────────────────────────────────────
  const totals = data.map(d => d.critical + d.high + d.medium + d.low);
  const overallTotal = totals.reduce((a, b) => a + b, 0);
  const maxVal = Math.max(1, ...totals);

  // Nice round Y-axis ticks (4 gridlines)
  const yTicks = (() => {
    const step = Math.max(1, Math.ceil(maxVal / 4));
    return [0, step, step * 2, step * 3, step * 4];
  })();
  const yScale = (v: number) => CHART_BOTTOM - (v / yTicks[yTicks.length - 1]) * CHART_H;
  const xScale = (i: number) => CHART_LEFT + (data.length <= 1 ? CHART_W / 2 : (i / (data.length - 1)) * CHART_W);

  // ── Animation on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!wrapperRef.current) return;
    const bars = wrapperRef.current.querySelectorAll<SVGRectElement>('rect[data-anim="bar"]');
    if (bars.length > 0) {
      bars.forEach(b => { b.style.transformOrigin = `center ${CHART_BOTTOM}px`; });
      animate(bars, {
        opacity: [0, 1],
        scaleY: [0, 1],
        duration: 520,
        delay: stagger(28, { from: 'last' }),
        easing: 'easeOutQuad',
      });
    }
    const lines = wrapperRef.current.querySelectorAll<SVGPathElement>('path[data-anim="line"]');
    lines.forEach(p => {
      const len = p.getTotalLength?.() ?? 0;
      if (!len) return;
      p.style.strokeDasharray = String(len);
      p.style.strokeDashoffset = String(len);
      animate(p, { strokeDashoffset: [len, 0], duration: 700, easing: 'easeOutQuad' });
    });
  }, [view, data.length]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (overallTotal === 0) {
    return (
      <section className="card" style={{ padding: '20px 20px 16px' }}>
        <Header view={view} setView={setView} />
        <div style={{
          height: VB_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, color: 'var(--ink-3)',
        }}>
          <Ico name="chart" size={28} style={{ opacity: 0.35 }} />
          <div style={{ fontSize: 12.5 }}>No findings recorded yet — chart will populate as you add findings.</div>
        </div>
      </section>
    );
  }

  // ── Stack view path / segments ─────────────────────────────────────────────
  const barW = Math.max(8, Math.min(28, (CHART_W / Math.max(1, data.length)) * 0.6));

  // ── Lines view: one polyline per severity ─────────────────────────────────
  const linePath = (key: keyof TrendDataPoint) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(d[key]).toFixed(1)}`).join(' ');

  return (
    <section className="card" ref={wrapperRef as React.RefObject<HTMLElement>} style={{ padding: '20px 20px 16px', position: 'relative' }}>
      <Header view={view} setView={setView} />

      {/* Tooltip — anchored to the chart, not the mouse */}
      {hoveredIndex !== null && data[hoveredIndex] && (
        <div style={{
          position: 'absolute',
          // Position above the hovered bar (px math approximating viewBox scaling)
          left: `${(xScale(hoveredIndex) / VB_W) * 100}%`,
          top: 56,
          transform: 'translate(-50%, 0)',
          backgroundColor: 'var(--bg-2)',
          border: '1px solid var(--line-2)',
          borderRadius: 6,
          padding: '10px 12px',
          fontSize: 11.5,
          fontFamily: 'var(--font-mono)',
          zIndex: 5,
          pointerEvents: 'none',
          boxShadow: 'var(--shadow-md)',
          minWidth: 140,
        }}>
          <div style={{ color: 'var(--ink-3)', marginBottom: 6, fontSize: 10, letterSpacing: '0.08em' }}>
            WEEK {WEEK_LABELS[hoveredIndex]}
          </div>
          {SEV_META.map(s => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '1.5px 0' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 1, background: s.color }} />
                <span style={{ color: 'var(--ink-2)' }}>{s.label}</span>
              </span>
              <span style={{ color: 'var(--ink-0)', fontWeight: 600 }}>{data[hoveredIndex][s.key]}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0 0', marginTop: 4, borderTop: '1px solid var(--line-1)' }}>
            <span style={{ color: 'var(--ink-3)' }}>Total</span>
            <span style={{ color: 'var(--ink-0)', fontWeight: 700 }}>{totals[hoveredIndex]}</span>
          </div>
        </div>
      )}

      {/* SVG chart */}
      <svg
        width="100%"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        style={{ display: 'block', height: VB_H }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* Y gridlines + labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={CHART_LEFT} x2={CHART_RIGHT}
              y1={yScale(t)} y2={yScale(t)}
              stroke="var(--line-1)" strokeWidth={1} strokeDasharray={i === 0 ? undefined : '2 4'}
            />
            <text
              x={CHART_LEFT - 6} y={yScale(t) + 3}
              textAnchor="end" fontSize={9}
              fill="var(--ink-3)" fontFamily="var(--font-mono)"
            >{t}</text>
          </g>
        ))}

        {/* Bars or lines */}
        {view === 'stack' ? (
          data.map((d, i) => {
            const total = totals[i];
            const x = xScale(i);
            if (total === 0) return null;
            const barH = (total / yTicks[yTicks.length - 1]) * CHART_H;
            let y = CHART_BOTTOM;
            const segs = SEV_META.slice().reverse().map(s => {
              const h = (d[s.key] / Math.max(1, total)) * barH;
              return { ...s, h };
            });
            return (
              <g key={i}>
                {/* hover hit area */}
                <rect
                  x={x - barW} y={CHART_TOP}
                  width={barW * 2} height={CHART_H}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredIndex(i)}
                />
                {segs.map((seg, si) => {
                  y -= seg.h;
                  return (
                    <rect
                      key={si} data-anim="bar"
                      x={x - barW / 2} y={y}
                      width={barW} height={seg.h}
                      fill={seg.color}
                      opacity={hoveredIndex === null || hoveredIndex === i ? 1 : 0.32}
                      rx={si === segs.length - 1 ? 2 : 0}
                      style={{ transition: 'opacity 0.18s ease' }}
                    />
                  );
                })}
              </g>
            );
          })
        ) : (
          <>
            {/* Soft "area" fill under each line */}
            {SEV_META.map(s => {
              const top = data.map((d, i) => `${xScale(i).toFixed(1)},${yScale(d[s.key]).toFixed(1)}`).join(' ');
              const baseline = `${xScale(data.length - 1).toFixed(1)},${CHART_BOTTOM} ${xScale(0).toFixed(1)},${CHART_BOTTOM}`;
              return (
                <polygon
                  key={`area-${s.key}`}
                  points={`${top} ${baseline}`}
                  fill={s.color}
                  fillOpacity={0.07}
                />
              );
            })}
            {/* Lines */}
            {SEV_META.map(s => (
              <path
                key={`line-${s.key}`}
                data-anim="line"
                d={linePath(s.key)}
                stroke={s.color}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={hoveredIndex === null ? 1 : 0.92}
              />
            ))}
            {/* Dots */}
            {SEV_META.map(s =>
              data.map((d, i) => (
                <circle
                  key={`dot-${s.key}-${i}`}
                  cx={xScale(i)} cy={yScale(d[s.key])}
                  r={hoveredIndex === i ? 3.5 : 2.4}
                  fill={s.color}
                  style={{ transition: 'r 0.15s ease' }}
                />
              ))
            )}
            {/* Hover hit areas — invisible vertical strips covering each x */}
            {data.map((_, i) => (
              <rect
                key={`hit-${i}`}
                x={xScale(i) - (CHART_W / data.length) / 2}
                y={CHART_TOP}
                width={CHART_W / data.length}
                height={CHART_H}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
                style={{ cursor: 'pointer' }}
              />
            ))}
            {/* Vertical guide on hover */}
            {hoveredIndex !== null && (
              <line
                x1={xScale(hoveredIndex)} x2={xScale(hoveredIndex)}
                y1={CHART_TOP} y2={CHART_BOTTOM}
                stroke="var(--accent)" strokeOpacity={0.4} strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
          </>
        )}

        {/* X axis labels */}
        {WEEK_LABELS.map((lbl, i) => (
          <text
            key={i}
            x={xScale(i)} y={CHART_BOTTOM + 14}
            textAnchor="middle"
            fontSize={9.5}
            fontWeight={hoveredIndex === i ? 700 : 400}
            fill={hoveredIndex === i ? 'var(--ink-0)' : 'var(--ink-3)'}
            fontFamily="var(--font-mono)"
            style={{ pointerEvents: 'none', transition: 'fill 0.15s ease' }}
          >
            {lbl}
          </text>
        ))}
      </svg>

      {/* Footer summary */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--line-1)',
        fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-3)',
      }}>
        <span><b style={{ color: 'var(--ink-1)' }}>{overallTotal.toLocaleString()}</b> findings tracked over 12 weeks</span>
        <span><b style={{ color: 'var(--ink-1)' }}>{(overallTotal / 12).toFixed(1)}</b> avg / week</span>
      </div>
    </section>
  );
}

// ── Header with view toggle + legend ────────────────────────────────────────
function Header({ view, setView }: { view: 'stack' | 'lines'; setView: (v: 'stack' | 'lines') => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 3 }}>Severity Trend</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>Open findings by week · last 12 weeks</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Legend */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {SEV_META.map(s => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
              <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label[0]}</span>
            </div>
          ))}
        </div>
        {/* View toggle */}
        <div style={{ display: 'inline-flex', background: 'var(--bg-2)', borderRadius: 'var(--r-xs)', padding: 2 }}>
          {(['stack', 'lines'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '3px 9px', fontSize: 10, fontFamily: 'var(--font-mono)',
                borderRadius: 'var(--r-xs)', border: 'none', cursor: 'pointer',
                background: view === v ? 'var(--bg-1)' : 'transparent',
                color: view === v ? 'var(--ink-0)' : 'var(--ink-3)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                transition: 'all 0.12s',
              }}
            >{v}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
