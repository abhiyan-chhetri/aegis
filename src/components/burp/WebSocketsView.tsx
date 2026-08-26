'use client';

/**
 * WebSocketsView — captured WebSocket messages from the extension
 * (server pushes them via /api/burp/websocket).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';

interface WsMessage {
  id: string;
  host: string;
  url: string;
  direction: 'sent' | 'received';
  content: string;
  tool: string;
  createdAt: string;
}

export function WebSocketsView({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [direction, setDirection] = useState('');
  const [host, setHost] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams();
      if (direction) sp.set('direction', direction);
      if (host) sp.set('host', host);
      const res = await fetch(`/api/projects/${projectId}/burp/websocket?${sp}`);
      const d = await res.json();
      if (res.ok) setMessages(d.messages || []);
    } catch {
      toast.error('Couldn\'t load WebSocket messages');
    }
  }, [projectId, direction, host]);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select className="input" value={direction} onChange={e => setDirection(e.target.value)} style={{ width: 130, fontSize: 12 }}>
          <option value="">Both directions</option>
          <option value="sent">Sent (client→server)</option>
          <option value="received">Received (server→client)</option>
        </select>
        <input className="input" placeholder="Host filter…" value={host} onChange={e => setHost(e.target.value)} style={{ width: 180, fontSize: 12 }} />
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={load} style={{ gap: 4, fontSize: 11 }}>
          <Ico name="history" size={12} /> Refresh
        </button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {messages.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12.5 }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>🔌</div>
            No WebSocket messages captured yet. The extension captures them when a page/tool opens a WebSocket to an in-scope host.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Dir</th>
                <th>Host</th>
                <th style={{ width: 60 }}>Tool</th>
                <th>Message</th>
                <th style={{ width: 90 }}>Time</th>
                <th style={{ width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {messages.map(m => (
                <React.Fragment key={m.id}>
                  <tr onClick={() => setExpanded(expanded === m.id ? null : m.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span style={{
                        fontSize: 9, fontFamily: 'var(--font-mono)', padding: '1px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '.05em',
                        background: m.direction === 'sent' ? 'rgba(91,155,213,.12)' : 'rgba(76,175,125,.12)',
                        color: m.direction === 'sent' ? '#5B9BD5' : '#4CAF7D',
                      }}>{m.direction === 'sent' ? '▲ sent' : '▼ recv'}</span>
                    </td>
                    <td><span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-1)' }}>{m.host}</span></td>
                    <td><span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{m.tool}</span></td>
                    <td>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 420 }}>
                        {m.content.slice(0, 120)}{m.content.length > 120 ? '…' : ''}
                      </span>
                    </td>
                    <td><span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{new Date(m.createdAt).toLocaleTimeString('en-GB')}</span></td>
                    <td><Ico name={expanded === m.id ? 'chevDown' : 'chevRight'} size={11} style={{ color: 'var(--ink-3)' }} /></td>
                  </tr>
                  {expanded === m.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <pre style={{
                          margin: 0, padding: 10, background: '#0F1115', color: '#D7DCE2',
                          fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>{m.content}</pre>
                        {m.url && <div style={{ fontSize: 10.5, color: 'var(--ink-3)', padding: '4px 10px', background: 'var(--bg-2)' }}>{m.url}</div>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
