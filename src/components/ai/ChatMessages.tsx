'use client';

/**
 * Shared AI chat message rendering — used by both the finding chat drawer and
 * the full chat page. Markdown with GFM, code blocks with a copy button,
 * streaming caret while the assistant is generating.
 */
import React, { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Ico } from '@/components/chrome/icons';

export interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cost?: number;
}

function PreBlock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      const text = ref.current?.innerText ?? '';
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div style={{ position: 'relative', margin: '8px 0' }} ref={ref}>
      {children}
      <button
        onClick={copy}
        title="Copy code"
        style={{
          position: 'absolute', top: 6, right: 6, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, fontFamily: 'var(--font-mono)',
          padding: '2px 7px', borderRadius: 4,
          background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)',
          color: '#ccc',
        }}
      >
        <Ico name={copied ? 'check' : 'copy'} size={11} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

const MD_COMPONENTS = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pre: ({ children }: any) => <PreBlock>{children}</PreBlock>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: ({ children, href }: any) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{children}</a>
  ),
};

function AssistantBody({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="md-preview" style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink-1)' }}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS as any}>
        {content}
      </ReactMarkdown>
      {streaming && (
        <span style={{ display: 'inline-block', width: 7, height: 14, background: 'var(--accent)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'chatCaret 1s step-end infinite' }} />
      )}
      <style>{`@keyframes chatCaret { 0%,100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
    </div>
  );
}

export function ChatMessages({ messages, streamingText }: {
  messages: ChatMsg[];
  /** While non-null, an assistant message is streaming this partial text. */
  streamingText?: string | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {messages.map(m => m.role === 'user' ? (
        <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            maxWidth: '82%', padding: '9px 13px', borderRadius: '12px 12px 3px 12px',
            // Use --accent-ink so the bubble text stays readable in BOTH themes
            // (light theme's --accent is near-white — hardcoded #fff was invisible).
            background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13.5, lineHeight: 1.6,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{m.content}</div>
        </div>
      ) : (
        <div key={m.id} style={{ display: 'flex', gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginTop: 2,
            background: 'linear-gradient(135deg,#5B9BD5,#9b7fd4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11,
          }}>AI</div>
          <div style={{ flex: 1, minWidth: 0, maxWidth: '100%' }}>
            <AssistantBody content={m.content} />
            {typeof m.cost === 'number' && m.cost > 0 && (
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)', marginTop: 4 }}>~${m.cost.toFixed(4)}</div>
            )}
          </div>
        </div>
      ))}

      {streamingText != null && (
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginTop: 2,
            background: 'linear-gradient(135deg,#5B9BD5,#9b7fd4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11,
          }}>AI</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <AssistantBody content={streamingText || ''} streaming />
          </div>
        </div>
      )}
    </div>
  );
}
