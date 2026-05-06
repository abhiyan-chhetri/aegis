'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Ico } from '@/components/chrome/icons';

type Tool = 'rect' | 'arrow' | 'text' | 'highlight' | 'redact' | 'freehand' | 'move' | 'circle' | 'delete';

interface Point { x: number; y: number; }

interface Shape {
  tool: Tool;
  color: string;
  strokeWidth: number;
  opacity: number;
  x1: number; y1: number;
  x2: number; y2: number;
  text?: string;
  points?: Point[];
}

interface Props {
  imageUrl: string;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

const COLORS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#c9a8f5', '#FFFFFF', '#000000'];
const STROKE_WIDTHS = [2, 4, 8];
const HIGHLIGHT_OPACITY = 0.35;

const TOOLS: { id: Tool; label: string; icon?: string; sym?: string }[] = [
  { id: 'move',      label: 'Move',       sym: '✋' },
  { id: 'rect',      label: 'Rectangle',  sym: '▭' },
  { id: 'circle',    label: 'Circle',     sym: '●' },
  { id: 'arrow',     label: 'Arrow',      icon: 'arrow' },
  { id: 'text',      label: 'Text',       sym: 'T' },
  { id: 'highlight', label: 'Highlight',  sym: '▬' },
  { id: 'redact',    label: 'Redact',     icon: 'eye' },
  { id: 'freehand',  label: 'Freehand',   icon: 'pen' },
  { id: 'delete',    label: 'Delete',     sym: '✕' },
];

export function ScreenshotAnnotator({ imageUrl, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement | null>(null);

  const [tool,        setTool]        = useState<Tool>('rect');
  const [color,       setColor]       = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const [opacity,     setOpacity]     = useState(1);
  const [shapes,      setShapes]      = useState<Shape[]>([]);
  const [current,     setCurrent]     = useState<Shape | null>(null);
  const [drawing,     setDrawing]     = useState(false);
  const [dims,        setDims]        = useState({ w: 0, h: 0 });
  const [textPos,     setTextPos]     = useState<Point | null>(null);
  const [textVal,     setTextVal]     = useState('');
  const [movingIdx,   setMovingIdx]   = useState<number | null>(null); // Index of shape being moved/resized
  const [moveOffset,  setMoveOffset]  = useState<Point | null>(null); // Offset for moving
  const [isResizing,  setIsResizing]  = useState(false); // Is resizing instead of moving

  // Load image + compute canvas dimensions
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      const maxW = window.innerWidth  * 0.82;
      const maxH = window.innerHeight * 0.72;
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      setDims({
        w: Math.round(img.naturalWidth  * scale),
        h: Math.round(img.naturalHeight * scale),
      });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Draw everything onto canvas
  const redraw = useCallback((extra?: Shape | null) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current || !dims.w) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
    const all = extra ? [...shapes, extra] : shapes;
    all.forEach((s, i) => {
      paintShape(ctx, s);
      // Highlight selected shape (when moving)
      if (i === movingIdx) {
        ctx.save();
        ctx.strokeStyle = '#5B9BD5';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        const sx = Math.min(s.x1, s.x2);
        const sy = Math.min(s.y1, s.y2);
        const w = Math.abs(s.x2 - s.x1);
        const h = Math.abs(s.y2 - s.y1);
        ctx.strokeRect(sx - 2, sy - 2, w + 4, h + 4);
        ctx.restore();
      }
    });
  }, [shapes, dims, movingIdx]);

  useEffect(() => { redraw(); }, [redraw]);

  function paintShape(ctx: CanvasRenderingContext2D, s: Shape) {
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.strokeStyle = s.color;
    ctx.fillStyle   = s.color;
    ctx.lineWidth   = s.strokeWidth;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    const { x1, y1, x2, y2 } = s;

    const sx = Math.min(x1, x2);
    const sy = Math.min(y1, y2);
    const w  = Math.abs(x2 - x1);
    const h  = Math.abs(y2 - y1);

    switch (s.tool) {
      case 'rect':
        ctx.strokeRect(sx, sy, w, h);
        break;

      case 'circle': {
        const cx = sx + w / 2;
        const cy = sy + h / 2;
        const rx = w / 2;
        const ry = h / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case 'highlight':
        ctx.globalAlpha = HIGHLIGHT_OPACITY;
        ctx.fillRect(sx, sy, w, h);
        break;

      case 'redact':
        ctx.globalAlpha = 1; // Fully opaque
        ctx.fillStyle = s.color;
        ctx.fillRect(sx, sy, w, h);
        break;

      case 'arrow': {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const ang  = Math.atan2(y2 - y1, x2 - x1);
        const head = Math.max(s.strokeWidth * 4, 14);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
        ctx.stroke();
        break;
      }

      case 'freehand':
        if (s.points && s.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(s.points[0].x, s.points[0].y);
          s.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          ctx.stroke();
        }
        break;

      case 'text':
        if (s.text) {
          const fs = 16 + (s.strokeWidth - 2) * 4; // Scale with stroke width
          ctx.globalAlpha = 1;
          ctx.font = `bold ${fs}px Arial, sans-serif`;
          ctx.fillStyle = s.color;
          ctx.textBaseline = 'top';
          ctx.shadowColor = 'rgba(0,0,0,0.7)';
          ctx.shadowBlur = 3;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          ctx.fillText(s.text, x1 + 2, y1 + 2);
          ctx.shadowColor = 'transparent';
        }
        break;
    }
    ctx.restore();
  }

  function canvasPoint(e: React.MouseEvent): Point {
    const c    = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left)  * (c.width  / rect.width),
      y: (e.clientY - rect.top)   * (c.height / rect.height),
    };
  }

  function findShapeAtPoint(p: Point): number | null {
    // Check shapes in reverse order (last drawn = top layer)
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      const sx = Math.min(s.x1, s.x2);
      const sy = Math.min(s.y1, s.y2);
      const w = Math.abs(s.x2 - s.x1);
      const h = Math.abs(s.y2 - s.y1);
      const tolerance = 8; // pixels

      // Check bounding box with tolerance
      if (p.x >= sx - tolerance && p.x <= sx + w + tolerance &&
          p.y >= sy - tolerance && p.y <= sy + h + tolerance) {
        return i;
      }
    }
    return null;
  }

  function onMouseDown(e: React.MouseEvent) {
    const p = canvasPoint(e);

    if (tool === 'delete') {
      const idx = findShapeAtPoint(p);
      if (idx !== null) {
        setShapes(prev => prev.filter((_, i) => i !== idx));
      }
      return;
    }

    if (tool === 'move') {
      const idx = findShapeAtPoint(p);
      if (idx !== null) {
        const s = shapes[idx];
        const sx = Math.min(s.x1, s.x2);
        const sy = Math.min(s.y1, s.y2);
        const w = Math.abs(s.x2 - s.x1);
        const h = Math.abs(s.y2 - s.y1);
        const cornerDist = 12; // pixels

        // Check if clicking near a corner (for resize)
        const nearCorner = (
          (Math.abs(p.x - (sx + w)) < cornerDist && Math.abs(p.y - (sy + h)) < cornerDist) ||
          (Math.abs(p.x - sx) < cornerDist && Math.abs(p.y - sy) < cornerDist)
        );

        setMovingIdx(idx);
        setIsResizing(nearCorner);
        if (nearCorner) {
          setMoveOffset({ x: p.x - s.x2, y: p.y - s.y2 });
        } else {
          setMoveOffset({ x: p.x - s.x1, y: p.y - s.y1 });
        }
      }
      return;
    }

    if (tool === 'text') { setTextPos(p); setTextVal(''); return; }
    const s: Shape = { tool, color, strokeWidth, opacity, x1: p.x, y1: p.y, x2: p.x, y2: p.y,
      points: tool === 'freehand' ? [p] : undefined };
    setCurrent(s);
    setDrawing(true);
  }

  function onMouseMove(e: React.MouseEvent) {
    const p = canvasPoint(e);

    if (movingIdx !== null && moveOffset) {
      const s = shapes[movingIdx];

      if (isResizing) {
        // Resize: adjust x2, y2 (bottom-right corner)
        const updated = {
          ...s,
          x2: p.x - moveOffset.x,
          y2: p.y - moveOffset.y,
        };
        setShapes(prev => prev.map((sh, i) => i === movingIdx ? updated : sh));
      } else {
        // Move shape
        const dx = p.x - s.x1 - moveOffset.x;
        const dy = p.y - s.y1 - moveOffset.y;
        const updated = {
          ...s,
          x1: s.x1 + dx,
          y1: s.y1 + dy,
          x2: s.x2 + dx,
          y2: s.y2 + dy,
          points: s.points ? s.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) : undefined,
        };
        setShapes(prev => prev.map((sh, i) => i === movingIdx ? updated : sh));
      }
      return;
    }

    if (!drawing || !current) return;
    const upd: Shape = {
      ...current,
      x2: p.x, y2: p.y,
      points: tool === 'freehand' ? [...(current.points ?? []), p] : current.points,
    };
    setCurrent(upd);
    redraw(upd);
  }

  function onMouseUp(e: React.MouseEvent) {
    if (movingIdx !== null) {
      setMovingIdx(null);
      setMoveOffset(null);
      setIsResizing(false);
      return;
    }

    if (!drawing || !current) return;
    const p = canvasPoint(e);
    const final: Shape = {
      ...current,
      x2: p.x, y2: p.y,
      points: tool === 'freehand' ? [...(current.points ?? []), p] : current.points,
    };
    setShapes(prev => [...prev, final]);
    setCurrent(null);
    setDrawing(false);
  }

  function submitText() {
    if (!textPos) return;
    if (textVal.trim()) {
      setShapes(prev => [...prev, {
        tool: 'text', color, strokeWidth, opacity,
        x1: textPos.x, y1: textPos.y, x2: textPos.x, y2: textPos.y,
        text: textVal,
      }]);
    }
    setTextPos(null);
    setTextVal('');
  }

  function undo() { setShapes(prev => prev.slice(0, -1)); }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { if (textPos) setTextPos(null); else onClose(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textPos]);

  const loading = !dims.w || !dims.h;

  const cursorStyle = tool === 'text' ? 'text' : tool === 'move' ? (isResizing ? 'nwse-resize' : 'grab') : tool === 'delete' ? 'not-allowed' : 'crosshair';

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.94)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {loading ? (
        <div style={{ color: 'var(--ink-2)', fontSize: 14 }}>Loading image…</div>
      ) : (
        <>
          {/* ── Toolbar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', marginBottom: 12,
            background: 'var(--bg-1)', border: '1px solid var(--line-1)',
            borderRadius: 'var(--r-sm)', flexWrap: 'wrap', maxWidth: '92vw',
          }}>

            {/* Tools */}
            <div style={{ display: 'flex', gap: 3 }}>
              {TOOLS.map(t => (
                <button
                  key={t.id}
                  title={t.label}
                  onClick={() => setTool(t.id)}
                  style={{
                    width: 32, height: 30, borderRadius: 'var(--r-xs)',
                    border: `1px solid ${tool === t.id ? 'var(--accent)' : 'var(--line-1)'}`,
                    background: tool === t.id ? 'var(--bg-3)' : 'var(--bg-0)',
                    color: tool === t.id ? 'var(--ink-0)' : 'var(--ink-3)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 600,
                  }}
                >
                  {t.sym
                    ? <span style={{ lineHeight: 1 }}>{t.sym}</span>
                    : <Ico name={t.icon!} size={14} />
                  }
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 24, background: 'var(--line-1)', flexShrink: 0 }} />

            {/* Color swatches */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {COLORS.map(c => (
                <button
                  key={c}
                  title={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: c, cursor: 'pointer', padding: 0,
                    border: `2px solid ${color === c ? 'var(--ink-0)' : c === '#FFFFFF' ? 'var(--line-2)' : 'transparent'}`,
                    outline: 'none', flexShrink: 0,
                  }}
                />
              ))}
            </div>

            <div style={{ width: 1, height: 24, background: 'var(--line-1)', flexShrink: 0 }} />

            {/* Stroke width */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {STROKE_WIDTHS.map(w => (
                <button
                  key={w}
                  title={`${w}px`}
                  onClick={() => setStrokeWidth(w)}
                  style={{
                    width: 32, height: 28, borderRadius: 'var(--r-xs)',
                    border: `1px solid ${strokeWidth === w ? 'var(--accent)' : 'var(--line-1)'}`,
                    background: strokeWidth === w ? 'var(--bg-3)' : 'var(--bg-0)',
                    color: 'var(--ink-0)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <div style={{ width: 14, height: w, background: 'var(--ink-1)', borderRadius: 100 }} />
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 24, background: 'var(--line-1)', flexShrink: 0 }} />

            {/* Opacity slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 150 }}>
              <label style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                α
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={opacity * 100}
                onChange={e => setOpacity(Number(e.target.value) / 100)}
                style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: 'var(--line-1)', outline: 'none',
                  accentColor: color,
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', minWidth: 20 }}>
                {Math.round(opacity * 100)}%
              </span>
            </div>

            <div style={{ width: 1, height: 24, background: 'var(--line-1)', flexShrink: 0 }} />

            {/* Undo */}
            <button
              onClick={undo}
              disabled={shapes.length === 0}
              style={{
                padding: '0 10px', height: 28, borderRadius: 'var(--r-xs)',
                border: '1px solid var(--line-1)',
                background: 'var(--bg-0)', color: 'var(--ink-2)',
                cursor: shapes.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: 12, opacity: shapes.length === 0 ? 0.4 : 1,
              }}
            >
              ↩ Undo
            </button>

            <div style={{ flex: 1, minWidth: 8 }} />

            {/* Cancel / Save */}
            <button
              onClick={onClose}
              style={{
                padding: '0 12px', height: 30, borderRadius: 'var(--r-xs)',
                border: '1px solid var(--line-1)',
                background: 'var(--bg-0)', color: 'var(--ink-2)',
                cursor: 'pointer', fontSize: 12,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn btn-primary btn-sm"
              style={{ height: 30, padding: '0 14px', fontSize: 12 }}
            >
              <Ico name="save" size={13} /> Save annotation
            </button>
          </div>

          {/* ── Canvas ── */}
          <div style={{ position: 'relative', lineHeight: 0 }}>
            <canvas
              ref={canvasRef}
              width={dims.w}
              height={dims.h}
              style={{
                display: 'block',
                maxWidth: '90vw',
                maxHeight: '72vh',
                cursor: cursorStyle,
                borderRadius: 4,
                userSelect: 'none',
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            />

            {/* Text input modal */}
            {textPos && (
              <div style={{
                position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                zIndex: 9001, background: 'var(--bg-1)', border: '1px solid var(--line-1)',
                borderRadius: 'var(--r-sm)', padding: '12px 14px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>
                  Click position marked. Type text and press Enter:
                </div>
                <input
                  autoFocus
                  value={textVal}
                  onChange={e => setTextVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { submitText(); return; }
                    if (e.key === 'Escape') setTextPos(null);
                  }}
                  placeholder="Enter text…"
                  style={{
                    width: 280,
                    padding: '8px 10px',
                    borderRadius: 'var(--r-xs)',
                    border: `1px solid ${color}`,
                    background: 'var(--bg-0)',
                    color: 'var(--ink-0)',
                    fontSize: 14,
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxShadow: `0 0 0 2px ${color}20`,
                  }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button
                    onClick={submitText}
                    style={{
                      flex: 1, padding: '6px 10px', fontSize: 11,
                      background: color, color: '#fff', border: 'none',
                      borderRadius: 'var(--r-xs)', cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    Add Text
                  </button>
                  <button
                    onClick={() => setTextPos(null)}
                    style={{
                      flex: 1, padding: '6px 10px', fontSize: 11,
                      background: 'var(--bg-2)', color: 'var(--ink-2)', border: 'none',
                      borderRadius: 'var(--r-xs)', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Hint bar */}
          <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)', display: 'flex', gap: 16 }}>
            <span>{tool === 'text' ? 'Click image to place text' : 'Click and drag to draw'}</span>
            <span>⌘Z / Ctrl+Z to undo</span>
            <span>Esc to cancel</span>
          </div>
        </>
      )}
    </div>
  );
}
