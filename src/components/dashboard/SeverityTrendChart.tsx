'use client';

import React, { useState, useRef } from 'react';

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

export function SeverityTrendChart({ data }: SeverityTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const maxTrendVal = Math.max(...data.map(d => d.critical + d.high + d.medium + d.low));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      setTooltipPos({
        x: e.clientX + 12,
        y: e.clientY + 12,
      });
    }
  };

  return (
    <section className="card" style={{ padding: '20px 20px 16px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 3 }}>Severity Trend</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>Open findings by week · last 12 weeks</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {(['critical', 'high', 'medium', 'low'] as const).map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: `var(--sev-${s})` }} />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-1)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{s[0]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip - fixed positioning */}
      {hoveredIndex !== null && (
        <div style={{
          position: 'fixed',
          left: `${tooltipPos.x}px`,
          top: `${tooltipPos.y}px`,
          backgroundColor: 'var(--bg-2)',
          border: '1px solid var(--line-1)',
          borderRadius: 6,
          padding: '12px 14px',
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          zIndex: 9999,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ color: 'var(--ink-2)', marginBottom: 6, fontWeight: 500 }}>Week {WEEK_LABELS[hoveredIndex]}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ color: 'var(--sev-critical)' }}>
              <span style={{ fontWeight: 600 }}>Critical:</span> {data[hoveredIndex].critical}
            </div>
            <div style={{ color: 'var(--sev-high)' }}>
              <span style={{ fontWeight: 600 }}>High:</span> {data[hoveredIndex].high}
            </div>
            <div style={{ color: 'var(--sev-medium)' }}>
              <span style={{ fontWeight: 600 }}>Medium:</span> {data[hoveredIndex].medium}
            </div>
            <div style={{ color: 'var(--sev-low)' }}>
              <span style={{ fontWeight: 600 }}>Low:</span> {data[hoveredIndex].low}
            </div>
          </div>
        </div>
      )}

      {/* SVG Chart */}
      <svg
        ref={svgRef}
        width="100%"
        viewBox="0 0 520 120"
        preserveAspectRatio="none"
        style={{ display: 'block', height: 120 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {data.map((d, i) => {
          const x = (i / 11) * 500 + 10;
          const barW = 34;
          const total = d.critical + d.high + d.medium + d.low;
          const barH = (total / maxTrendVal) * 88;
          let y = 96;
          const segs: { color: string; h: number }[] = [
            { color: 'var(--sev-low)',      h: (d.low / total) * barH },
            { color: 'var(--sev-medium)',   h: (d.medium / total) * barH },
            { color: 'var(--sev-high)',     h: (d.high / total) * barH },
            { color: 'var(--sev-critical)', h: (d.critical / total) * barH },
          ];

          return (
            <g key={i}>
              {/* Invisible rect for hover */}
              <rect
                x={x - barW / 2 - 8}
                y={0}
                width={barW + 16}
                height={100}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredIndex(i)}
              />

              {/* Visible bars */}
              {segs.map((seg, si) => {
                y -= seg.h;
                return (
                  <rect
                    key={si}
                    x={x - barW / 2}
                    y={y}
                    width={barW}
                    height={seg.h}
                    fill={seg.color}
                    opacity={hoveredIndex === i ? 1 : 0.82}
                    rx={si === segs.length - 1 ? 2 : 0}
                    style={{ transition: 'opacity 0.2s ease' }}
                  />
                );
              })}
            </g>
          );
        })}

        {/* X axis labels - improved visibility */}
        {WEEK_LABELS.map((lbl, i) => (
          <text
            key={i}
            x={(i / 11) * 500 + 10}
            y={112}
            textAnchor="middle"
            fontSize={10}
            fontWeight={hoveredIndex === i ? 600 : 400}
            fill={hoveredIndex === i ? 'var(--ink-1)' : 'var(--ink-2)'}
            fontFamily="var(--font-mono)"
            style={{ pointerEvents: 'none' }}
          >
            {lbl}
          </text>
        ))}
      </svg>
    </section>
  );
}
