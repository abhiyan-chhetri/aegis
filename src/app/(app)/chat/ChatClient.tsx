'use client';

/**
 * ChatClient — DeepSeek-style security chat: conversation sidebar + streaming
 * markdown chat. Conversations are private per user (server enforces userId).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';
import { ChatMessages, type ChatMsg } from '@/components/ai/ChatMessages';
import { TrafficMatchPicker } from '@/components/burp/TrafficMatchPicker';
import type { TrafficRow } from '@/components/burp/types';

interface ChatMeta {
  id: string;
  kind: 'general' | 'finding';
  title: string;
  findingId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  cost: number;
}

function relDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function ChatClient() {
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Burp traffic attach
  const [attachedTraffic, setAttachedTraffic] = useState<TrafficRow[]>([]);
  const [attachedProjectId, setAttachedProjectId] = useState('');
  const [attachPicker, setAttachPicker] = useState(false);
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [projectPicker, setProjectPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const aborterRef = useRef<AbortController | null>(null);

  const loadChats = useCallback(async () => {
    try {
      const r = await fetch('/api/chat', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        setChats(d.chats || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadChats();
  }, [loadChats]);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/chat/${id}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      setMessages((d.messages || []).map((m: Record<string, unknown>) => ({
        id: String(m.id),
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: String(m.content || ''),
        cost: typeof m.cost === 'number' ? m.cost : undefined,
      })));
    } catch { /* ignore */ }
  }, []);

  function selectChat(id: string) {
    setActiveId(id);
    setMessages([]);
    setStreamingText(null);
    loadMessages(id);
  }

  async function newChat() {
    aborterRef.current?.abort();
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'general' }),
      });
      if (!r.ok) throw new Error('Failed to create chat');
      const d = await r.json();
      setChats(prev => [{ ...d.chat, kind: 'general', findingId: null, messageCount: 0, cost: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...prev]);
      setActiveId(d.chat.id);
      setMessages([]);
      setStreamingText(null);
    } catch (e) {
      toast.error('Could not start a chat', { description: e instanceof Error ? e.message : undefined });
    }
  }

  // ── Burp traffic attach ─────────────────────────────────────────────────────
  const openAttach = async () => {
    if (!attachedProjectId) {
      // Pick a project first — traffic is project-scoped.
      if (projectOptions.length === 0) {
        try {
          const r = await fetch('/api/projects');
          const d = await r.json();
          const list = d.projects || d.project || [];
          setProjectOptions(list.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
        } catch { /* ignore */ }
      }
      setProjectPicker(true);
      return;
    }
    setAttachPicker(true);
  };

  async function send() {    const content = input.trim();
    if (!content || !activeId || busy) return;
    setInput('');
    setBusy(true);
    setMessages(prev => [...prev, { id: `local-${Date.now()}`, role: 'user', content }]);
    setStreamingText('');

    const ac = new AbortController();
    aborterRef.current = ac;
    try {
      const res = await fetch(`/api/chat/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          trafficIds: attachedTraffic.map(t => t.id),
          projectId: attachedProjectId || undefined,
        }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

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
          if (typeof ev.delta === 'string') {
            acc += ev.delta;
            setStreamingText(acc);
          }
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
      // Update sidebar (title + updatedAt + count bump).
      loadChats();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        toast.error('Chat failed', { description: e instanceof Error ? e.message : undefined });
      }
      setStreamingText(null);
      setMessages(prev => prev.filter(m => !m.id.startsWith('ai-')));
    } finally {
      setBusy(false);
    }
  }

  async function deleteChat(id: string) {
    try {
      const r = await fetch(`/api/chat/${id}`, { method: 'DELETE' });
      if (!r.ok) return;
      setChats(prev => prev.filter(c => c.id !== id));
      if (activeId === id) { setActiveId(null); setMessages([]); setStreamingText(null); }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', background: 'var(--bg-0)' }}>
      {/* Sidebar */}
      <div className="thin-scroll" style={{
        width: 260, flexShrink: 0, borderRight: '1px solid var(--line-1)', background: 'var(--bg-1)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <div style={{ padding: 12 }}>
          <button
            onClick={newChat}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', gap: 6 }}
          >
            <Ico name="plus" size={13} /> New chat
          </button>
        </div>
        {loading ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--ink-3)' }}>Loading…</div>
        ) : chats.length === 0 ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--ink-3)' }}>
            No conversations yet. Start a new chat to ask security questions.
          </div>
        ) : (
          chats.map(c => (
            <div
              key={c.id}
              onClick={() => selectChat(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                padding: '9px 12px', margin: '1px 8px', borderRadius: 'var(--r-sm)',
                background: activeId === c.id ? 'var(--bg-3)' : 'transparent',
                borderLeft: activeId === c.id ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <Ico name="message" size={13} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'var(--ink-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.title}
                </div>
                <div className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>
                  {relDate(c.updatedAt || c.createdAt)}{c.kind === 'finding' ? ' · finding' : ''}
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteChat(c.id); }}
                title="Delete conversation"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 3 }}
              >
                <Ico name="trash" size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Main chat */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!activeId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 30 }}>
            <div style={{ fontSize: 34 }}>🛡️</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink-0)' }}>Security AI Assistant</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-3)', maxWidth: 420, lineHeight: 1.7 }}>
              Ask anything — shell one-liners, PoCs, exploitation techniques, CVSS reasoning,
              remediation design. Conversations are private to you.
            </div>
            <button className="btn btn-primary" onClick={newChat} style={{ gap: 6, marginTop: 6 }}>
              <Ico name="plus" size={13} /> Start a conversation
            </button>
          </div>
        ) : (
          <>
            <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '22px 26px' }}>
              {messages.length === 0 && !streamingText ? (
                <div style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5, padding: '40px 0' }}>
                  Send a message to start. This chat is private to you.
                </div>
              ) : (
                <div style={{ maxWidth: 780, margin: '0 auto' }}>
                  <ChatMessages messages={messages} streamingText={streamingText} />
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div style={{ padding: '12px 20px 18px', borderTop: '1px solid var(--line-1)', background: 'var(--bg-1)' }}>
              <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  className="input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder="Ask a security question… (Enter to send, Shift+Enter for newline)"
                  rows={Math.min(5, Math.max(1, input.split('\n').length))}
                  style={{ flex: 1, fontSize: 13, lineHeight: 1.6, resize: 'none' }}
                />
                <button
                  onClick={openAttach}
                  disabled={busy}
                  className="btn btn-ghost"
                  title={attachedTraffic.length > 0 ? `${attachedTraffic.length} request/response pair${attachedTraffic.length === 1 ? '' : 's'} attached — click to change` : 'Attach captured Burp traffic to the prompt'}
                  style={{ height: 38, padding: '0 11px', position: 'relative' }}
                >
                  <Ico name="link" size={14} style={{ color: attachedTraffic.length > 0 ? '#5B9BD5' : 'var(--ink-3)' }} />
                  {attachedTraffic.length > 0 && (
                    <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 15, height: 15, borderRadius: 100, background: '#5B9BD5', color: '#fff', fontSize: 9, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{attachedTraffic.length}</span>
                  )}
                </button>
                <button
                  onClick={send}
                  disabled={busy || !input.trim()}
                  className="btn btn-primary"
                  title="Send"
                  style={{ height: 38, padding: '0 14px', gap: 6 }}
                >
                  <Ico name="send" size={13} />
                </button>
              </div>
              {attachedTraffic.length > 0 && (
                <div style={{ maxWidth: 780, margin: '6px auto 0', fontSize: 10.5, color: '#5B9BD5', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ico name="link" size={11} />
                  {attachedTraffic.length} captured request/response pair{attachedTraffic.length === 1 ? '' : 's'} will be sent with your next message
                  <button onClick={() => setAttachedTraffic([])} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 10.5, textDecoration: 'underline', marginLeft: 'auto' }}>clear</button>
                </div>
              )}
              <div style={{ maxWidth: 780, margin: '6px auto 0', fontSize: 10.5, color: 'var(--ink-3)' }}>
                AI responses are generated by your configured provider. Never paste live credentials or client secrets into the chat.
              </div>
            </div>
          </>
        )}
      </div>

      {/* Project picker for attach */}
      {projectPicker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.5)' }}>
          <div style={{ width: 420, maxWidth: '92vw', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', boxShadow: '0 24px 80px rgba(0,0,0,.5)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ico name="link" size={15} style={{ color: '#5B9BD5' }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-0)', flex: 1 }}>Which project's traffic?</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setProjectPicker(false)} style={{ width: 26, padding: 0 }}><Ico name="x" size={13} /></button>
            </div>
            <div style={{ padding: 10, maxHeight: 340, overflowY: 'auto' }}>
              {projectOptions.length === 0 && <div style={{ padding: 16, fontSize: 12, color: 'var(--ink-3)', textAlign: 'center' }}>No projects found.</div>}
              {projectOptions.map(p => (
                <button key={p.id} onClick={() => { setAttachedProjectId(p.id); setProjectPicker(false); setAttachPicker(true); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--line-1)', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink-1)', borderRadius: 'var(--r-xs)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Traffic match picker */}
      {attachPicker && attachedProjectId && (
        <TrafficMatchPicker
          projectId={attachedProjectId}
          text={input || (messages[messages.length - 1]?.content || '')}
          title="Attach matching traffic"
          contextLabel="the chat message"
          onClose={() => setAttachPicker(false)}
          onConfirm={(samples) => {
            setAttachedTraffic(samples);
            setAttachPicker(false);
            if (samples.length > 0) toast.success(`${samples.length} traffic pair${samples.length === 1 ? '' : 's'} attached`);
          }}
        />
      )}
    </div>
  );
}
