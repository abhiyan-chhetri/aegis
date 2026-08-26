'use client';

/**
 * FindingChat — per-finding AI chat drawer. One private conversation per
 * finding per user (server-side user scoping). The AI gets the finding's
 * context (title, description, impact, remediation, …) injected automatically.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';
import { ChatMessages, type ChatMsg } from '@/components/ai/ChatMessages';
import { TrafficMatchPicker } from '@/components/burp/TrafficMatchPicker';
import type { TrafficRow } from '@/components/burp/types';

export function FindingChat({ findingId, findingCode, projectId, onClose }: {
  findingId: string;
  findingCode: string;
  projectId?: string;
  onClose: () => void;
}) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attached, setAttached] = useState<TrafficRow[]>([]);
  const [findingText, setFindingText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Build the match text from the finding's own content so the picker finds
  // the traffic that actually belongs to this finding.
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/findings/${findingId}`, { cache: 'no-store' });
        const d = await res.json();
        if (!alive) return;
        const f = d.finding || d;
        const parts = [f?.title, f?.description, f?.reproduction, f?.summary, f?.impact].filter((x: unknown) => typeof x === 'string' && x);
        setFindingText(parts.join('\n').slice(0, 12000));
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [findingId, projectId]);

  // Find-or-create the per-finding conversation.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let r = await fetch(`/api/chat?findingId=${encodeURIComponent(findingId)}`, { cache: 'no-store' });
        let d = await r.json();
        let existing = (d.chats || [])[0];
        if (!existing) {
          r = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'finding', findingId }),
          });
          d = await r.json();
          existing = d.chat;
        }
        if (!alive || !existing?.id) return;
        setChatId(existing.id);
        const mr = await fetch(`/api/chat/${existing.id}`, { cache: 'no-store' });
        const md = await mr.json();
        if (!alive) return;
        setMessages((md.messages || []).map((m: Record<string, unknown>) => ({
          id: String(m.id),
          role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
          content: String(m.content || ''),
          cost: typeof m.cost === 'number' ? m.cost : undefined,
        })));
        setReady(true);
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [findingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  async function send() {
    const content = input.trim();
    if (!content || !chatId || busy) return;
    setInput('');
    setBusy(true);
    setMessages(prev => [...prev, { id: `local-${Date.now()}`, role: 'user', content }]);
    setStreamingText('');
    try {
      const res = await fetch(`/api/chat/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, trafficIds: attached.map(t => t.id) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let acc = '';
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          let ev: Record<string, unknown>;
          try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (typeof ev.delta === 'string') { acc += ev.delta; setStreamingText(acc); }
          if (ev.done) {
            setStreamingText(null);
            setMessages(prev => [...prev, {
              id: `ai-${Date.now()}`,
              role: 'assistant',
              content: acc,
              cost: typeof ev.cost === 'number' ? ev.cost : undefined,
            }]);
            if (typeof ev.error === 'string' && ev.error) toast.error('AI chat error', { description: ev.error });
          }
        }
      }
    } catch {
      toast.error('Chat failed', { description: 'Check your AI provider configuration.' });
      setStreamingText(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 80 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '94vw',
        background: 'var(--bg-1)', borderLeft: '1px solid var(--line-2)', zIndex: 90,
        display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#5B9BD5,#9b7fd4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11 }}>AI</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-0)' }}>Finding AI chat</div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{findingCode} · private to you</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: 28, padding: 0 }}><Ico name="x" size={14} /></button>
        </div>

        {/* Messages */}
        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {!ready ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 12, padding: '30px 0' }}>Loading conversation…</div>
          ) : messages.length === 0 && !streamingText ? (
            <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5, padding: '30px 10px', lineHeight: 1.7 }}>
              Ask about this finding — why it matters, how to explain it, how to remediate it,
              or how to write the reproduction better. The AI already has this finding's context.
            </div>
          ) : (
            <ChatMessages messages={messages} streamingText={streamingText} />
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--line-1)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            className="input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about this finding…"
            rows={Math.min(4, Math.max(1, input.split('\n').length))}
            style={{ flex: 1, fontSize: 13, lineHeight: 1.6, resize: 'none' }}
          />
          {projectId && (
            <button
              onClick={() => setPickerOpen(true)}
              disabled={busy}
              className="btn btn-ghost"
              title={attached.length > 0 ? `${attached.length} request/response pair${attached.length === 1 ? '' : 's'} attached — click to change` : 'Attach matching captured traffic to the prompt'}
              style={{ height: 36, padding: '0 10px', position: 'relative' }}
            >
              <Ico name="link" size={13} style={{ color: attached.length > 0 ? '#5B9BD5' : 'var(--ink-3)' }} />
              {attached.length > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -5, minWidth: 15, height: 15, borderRadius: 100,
                  background: '#5B9BD5', color: '#fff', fontSize: 9, fontFamily: 'var(--font-mono)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                }}>{attached.length}</span>
              )}
            </button>
          )}
          <button onClick={send} disabled={busy || !input.trim() || !chatId} className="btn btn-primary" title="Send" style={{ height: 36, padding: '0 13px' }}>
            <Ico name="send" size={13} />
          </button>
        </div>
        {attached.length > 0 && (
          <div style={{ padding: '0 16px 10px', fontSize: 10.5, color: '#5B9BD5', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Ico name="link" size={11} />
            {attached.length} captured request/response pair{attached.length === 1 ? '' : 's'} will be sent with your next message
            <button onClick={() => setAttached([])} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 10.5, textDecoration: 'underline', marginLeft: 'auto' }}>
              clear
            </button>
          </div>
        )}
      </div>

      {/* Traffic match picker */}
      {pickerOpen && projectId && (
        <TrafficMatchPicker
          projectId={projectId}
          text={findingText || findingCode}
          title="Attach matching traffic"
          contextLabel="the chat message"
          onClose={() => setPickerOpen(false)}
          onConfirm={(samples) => {
            setAttached(samples);
            setPickerOpen(false);
            if (samples.length > 0) toast.success(`${samples.length} traffic pair${samples.length === 1 ? '' : 's'} attached`);
          }}
        />
      )}
    </>
  );
}
