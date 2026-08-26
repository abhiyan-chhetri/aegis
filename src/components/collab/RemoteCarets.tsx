'use client';

/**
 * RemoteCarets — renders remote users' carets INSIDE a textarea/input using the
 * mirror-div technique: a transparent clone of the text (identical font
 * metrics, padding and text-box width) is stacked exactly over the real
 * control, and each remote caret is drawn as a coloured bar that spans the
 * full line box — exactly like the control's own native caret — at the line
 * and column where the remote user's caret currently sits.
 *
 * The parent of the control must be `position: relative`.
 */
import React, { useEffect, useRef, useState } from 'react';

export interface CaretSpec {
  key: string;
  color: string;
  name: string;
  offset: number;
}

interface MirrorStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;   // px — the line box height of the control's text
  tabSize: number;
  paddingTop: number;   // where the first text line starts (content-box)
  paddingLeft: number;
  width: number;        // content-box width (matches the control's wrap width)
  // The control's box relative to its position:relative parent — the overlay
  // is sized to this so the mirror coordinates are exact.
  top: number;
  left: number;
  widthBox: number;
  heightBox: number;
}

function measureControl(el: HTMLTextAreaElement | HTMLInputElement): MirrorStyle {
  const cs = getComputedStyle(el);
  const fontSize = parseFloat(cs.fontSize) || 13;
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padLeft = parseFloat(cs.paddingLeft) || 0;
  const padRight = parseFloat(cs.paddingRight) || 0;
  // clientWidth ALREADY excludes the vertical scrollbar, so the text-box width
  // is simply clientWidth minus horizontal padding. (The old code subtracted
  // the scrollbar again, which made the mirror wrap ~15px earlier than the
  // textarea and put carets on the wrong lines.)
  const width = Math.max(0, el.clientWidth - padLeft - padRight);

  const isInput = el.tagName === 'INPUT';
  // Inputs centre their text vertically; approximate their line box and centre
  // the mirror the same way.
  const lineHeight = isInput
    ? Math.max(1, fontSize * 1.25)
    : (parseFloat(cs.lineHeight) || 1.7 * fontSize);
  const paddingTopEff = isInput ? Math.max(0, (el.clientHeight - lineHeight) / 2) : padTop;

  return {
    fontFamily: cs.fontFamily,
    fontSize,
    lineHeight,
    tabSize: parseInt(cs.tabSize, 10) || 8,
    paddingTop: paddingTopEff,
    paddingLeft: padLeft,
    width,
    top: el.offsetTop,
    left: el.offsetLeft,
    widthBox: el.offsetWidth,
    heightBox: el.offsetHeight,
  };
}

function CaretLayer({ text, caret, style, scrollTop, singleLine }: {
  text: string;
  caret: CaretSpec;
  style: MirrorStyle;
  scrollTop: number;
  singleLine?: boolean;
}) {
  const { fontFamily, fontSize, lineHeight, tabSize, paddingTop, paddingLeft, width } = style;
  // CRITICAL: a numeric line-height is a unitless MULTIPLIER in CSS (× font-size),
  // so it must be sent with an explicit px unit — otherwise every mirror line is
  // lineHeight × fontSize tall and carets land ~13 lines off.
  const lhPx = `${lineHeight}px`;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: paddingTop - scrollTop,
        left: paddingLeft,
        width: singleLine ? 'max-content' : width,
        minWidth: width,
        fontFamily,
        fontSize,
        lineHeight: lhPx,
        tabSize,
        whiteSpace: singleLine ? 'nowrap' : 'pre-wrap',
        overflow: 'hidden',
        letterSpacing: 'normal',
        color: 'transparent',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {text.slice(0, Math.max(0, Math.min(caret.offset, text.length)))}
      <span
        style={{
          display: 'inline-block',
          width: 2,
          height: lhPx, // spans the full line box like the native caret
          background: caret.color,
          boxShadow: '0 0 0 1px rgba(255,255,255,.55)',
          verticalAlign: 'top',
          borderRadius: 1,
          animation: 'remoteCaretBlink 1.1s step-end infinite',
        }}
      />
    </div>
  );
}

export function RemoteCarets({ text, carets, controlRef, className, singleLine }: {
  text: string;
  carets: CaretSpec[];
  controlRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  className?: string;
  singleLine?: boolean;
}) {
  const [style, setStyle] = useState<MirrorStyle | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const raf = useRef<number | null>(null);

  // Measure the control; re-measure whenever its size changes (including when
  // a vertical scrollbar appears/disappears, which changes the wrap width) and
  // once web fonts settle.
  useEffect(() => {
    const el = controlRef.current;
    if (!el) return;
    const measure = () => setStyle(measureControl(el));
    measure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener('resize', measure);
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [controlRef]);

  // Track scroll of the control so carets stay glued to text.
  useEffect(() => {
    const el = controlRef.current;
    if (!el) return;
    const onScroll = () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => setScrollTop(el.scrollTop));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [controlRef]);

  if (!style || carets.length === 0) return null;

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        top: style.top,
        left: style.left,
        width: style.widthBox,
        height: style.heightBox,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {carets.map(c => (
        <CaretLayer key={c.key} text={text} caret={c} style={style} scrollTop={scrollTop} singleLine={singleLine} />
      ))}
      <style>{`
        @keyframes remoteCaretBlink {
          0%, 45% { opacity: 1; }
          50%, 95% { opacity: 0.25; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
