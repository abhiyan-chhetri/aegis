'use client';

/**
 * LiveNotes — collaborative notes editor with true real-time SSE streaming.
 *
 * Behaviour (matches Google Docs / Office co-author):
 * - Every keystroke broadcasts the latest text after a short debounce (400 ms).
 * - Remote edits are applied LIVE while preserving the local caret position.
 *   No "Keep mine / Keep theirs" prompt — both clients converge instantly.
 * - "X is typing…" badge with per-user accent colour.
 * - Live presence avatars (LivePresence).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LivePresence } from './LivePresence';

const SAVE_DEBOUNCE = 400;          // ms — broadcast cadence while typing
const REMOTE_APPLY_DELAY = 250;     // ms — wait briefly so we don't fight a fast typer

interface Props {
  projectId: string;
  initialNotes: string;
}

interface RemoteTyper {
  userId: string;
  userName: string;
  userColor: string;
}

export function LiveNotes({ projectId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [typers, setTypers] = useState<Map<string, RemoteTyper>>(new Map());

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBroadcastValue = useRef(initialNotes);
  const isLocalEditing = useRef(false);
  const localEditTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingRemote = useRef<string | null>(null);
  const remoteApplyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async (val: string) => {
    setSaveState('saving');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: val }),
      });
      lastBroadcastValue.current = val;
      setSaveState(res.ok ? 'saved' : 'error');
      setTimeout(() => setSaveState(prev => prev === 'saved' ? 'idle' : prev), 1800);
    } catch {
      setSaveState('error');
    }
  }, [projectId]);

  function handleChange(val: string) {
    setNotes(val);
    isLocalEditing.current = true;
    if (localEditTimer.current) clearTimeout(localEditTimer.current);
    localEditTimer.current = setTimeout(() => { isLocalEditing.current = false; }, 1500);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(val), SAVE_DEBOUNCE);

    // Send "I'm typing" pulse (throttled by the server's typing state TTL)
    fetch(`/api/collab/notes:${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field: 'notes' }),
    }).catch(() => {});
  }

  // Apply a remote update with caret-preservation logic.
  function applyRemoteValue(newValue: string) {
    if (newValue === notes) return;
    const el = textareaRef.current;
    if (!el) {
      setNotes(newValue);
      return;
    }
    const oldValue = el.value;
    const oldStart = el.selectionStart;
    const oldEnd = el.selectionEnd;

    // Compute the diff to map the caret across the remote change.
    // Find the common prefix and suffix lengths between old and new.
    let prefix = 0;
    const minLen = Math.min(oldValue.length, newValue.length);
    while (prefix < minLen && oldValue[prefix] === newValue[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < (minLen - prefix) &&
      oldValue[oldValue.length - 1 - suffix] === newValue[newValue.length - 1 - suffix]
    ) suffix++;

    const oldChangedStart = prefix;
    const oldChangedEnd   = oldValue.length - suffix;
    const newChangedEnd   = newValue.length - suffix;
    const delta           = newChangedEnd - oldChangedEnd;

    const newStart = oldStart <= oldChangedStart ? oldStart
                   : oldStart >= oldChangedEnd  ? oldStart + delta
                   : newChangedEnd;
    const newEnd   = oldEnd   <= oldChangedStart ? oldEnd
                   : oldEnd   >= oldChangedEnd  ? oldEnd + delta
                   : newChangedEnd;

    setNotes(newValue);
    lastBroadcastValue.current = newValue;

    // Restore caret after React commits the new value
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(newStart, newEnd);
      } catch { /* element gone */ }
    });
  }

  // SSE subscription
  useEffect(() => {
    const es = new EventSource(`/api/collab/notes:${projectId}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'content_update' && data.field === 'notes') {
          // Ignore our own echo (the server broadcasts everyone)
          if (data.value === lastBroadcastValue.current) return;

          if (!isLocalEditing.current) {
            // We're idle — apply immediately
            applyRemoteValue(data.value);
          } else {
            // We're typing — queue the remote value and apply after a short delay
            pendingRemote.current = data.value;
            if (remoteApplyTimer.current) clearTimeout(remoteApplyTimer.current);
            remoteApplyTimer.current = setTimeout(() => {
              if (pendingRemote.current !== null && !isLocalEditing.current) {
                applyRemoteValue(pendingRemote.current);
              }
              pendingRemote.current = null;
            }, REMOTE_APPLY_DELAY);
          }
        }

        if (data.type === 'typing' && data.field === 'notes') {
          setTypers(prev => {
            const next = new Map(prev);
            next.set(data.userId, {
              userId: data.userId,
              userName: data.userName || 'Someone',
              userColor: data.userColor || '#6366f1',
            });
            return next;
          });
          // Auto-expire after 4s of no further "typing" pulses
          setTimeout(() => {
            setTypers(prev => {
              const next = new Map(prev);
              next.delete(data.userId);
              return next;
            });
          }, 4000);
        }

        if (data.type === 'typing' && data.field === null) {
          setTypers(prev => {
            const next = new Map(prev);
            next.delete(data.userId);
            return next;
          });
        }
      } catch { /* malformed event */ }
    };

    return () => {
      es.close();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (localEditTimer.current) clearTimeout(localEditTimer.current);
      if (remoteApplyTimer.current) clearTimeout(remoteApplyTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const typerList = Array.from(typers.values());

  return (
    <div style={{ padding: '24px 28px', maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Info / status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--accent)' }}>
        <span style={{ fontSize: 13 }}>📝</span>
        <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {typerList.length > 0 ? (
            <>
              {typerList.map((t, i) => (
                <React.Fragment key={t.userId}>
                  <span style={{ color: t.userColor, fontWeight: 600 }}>{t.userName}</span>
                  {i < typerList.length - 1 && <span>·</span>}
                </React.Fragment>
              ))}
              <span>{typerList.length === 1 ? 'is typing…' : 'are typing…'}</span>
              <span className="caret-pulse" style={{ display: 'inline-block', width: 7, height: 12, background: typerList[0].userColor, marginLeft: 2, verticalAlign: 'middle' }} />
            </>
          ) : (
            <>Notes are <strong>private to the team</strong>. Edits stream live to everyone.</>
          )}
        </span>
        <LivePresence entity={`project-notes:${projectId}`} />
      </div>

      <div className="card" style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Engagement Notes</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Markdown · Live-streaming · Auto-saved</div>
          </div>
          <div style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: saveState === 'saved' ? 'var(--status-resolved)'
              : saveState === 'saving' ? 'var(--ink-3)'
              : saveState === 'error' ? 'var(--sev-critical)'
              : 'var(--ink-4)',
          }}>
            {saveState === 'saved' ? '✓ Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Error saving' : `${notes.length} chars`}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          className="input thin-scroll"
          value={notes}
          onChange={e => handleChange(e.target.value)}
          placeholder={`# Engagement Notes\n\n## Recon Findings\n- Target runs nginx 1.18\n\n## Client Context\n- Pentest scope agreed\n\n## AI Context\n- Focus on business impact`}
          style={{ minHeight: 420, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.7 }}
        />
      </div>
    </div>
  );
}
