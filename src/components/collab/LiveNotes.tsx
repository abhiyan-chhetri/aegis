'use client';

/**
 * LiveNotes — collaborative notes editor with true real-time SSE sync.
 * - SSE subscription to /api/collab/notes:PROJECT_ID
 * - Debounced auto-save (1.2 s) — broadcasts on save
 * - Conflict banner when someone edits while you're typing
 * - LivePresence avatars + typing indicator
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LivePresence } from './LivePresence';

const SAVE_DEBOUNCE = 1200;
const IDLE_BEFORE_SYNC = 4_000;

interface Props {
  projectId: string;
  initialNotes: string;
}

export function LiveNotes({ projectId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [conflict, setConflict] = useState<{ value: string; by: string } | null>(null);
  const [remoteTyping, setRemoteTyping] = useState<string | null>(null); // who's currently typing

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypedAt = useRef<number>(0);
  const lastSavedValue = useRef(initialNotes);
  const currentNotes = useRef(initialNotes);
  const esRef = useRef<EventSource | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { currentNotes.current = notes; }, [notes]);

  const save = useCallback(async (val: string) => {
    setSaveState('saving');
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: val }),
      });
      lastSavedValue.current = val;
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setSaveState('error');
    }
  }, [projectId]);

  function handleChange(val: string) {
    setNotes(val);
    setConflict(null);
    lastTypedAt.current = Date.now();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(val), SAVE_DEBOUNCE);

    // Send typing indicator (throttled to every 2s)
    if (!typingTimer.current) {
      fetch(`/api/collab/notes:${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'notes' }),
      }).catch(() => {});
      typingTimer.current = setTimeout(() => { typingTimer.current = null; }, 2000);
    }
  }

  // SSE subscription
  useEffect(() => {
    const es = new EventSource(`/api/collab/notes:${projectId}`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'notes_update') {
          // Ignore our own broadcasts (the server echoes back)
          if (data.notes === lastSavedValue.current) return;

          const idleSince = Date.now() - lastTypedAt.current;
          if (idleSince > IDLE_BEFORE_SYNC) {
            setNotes(data.notes);
            lastSavedValue.current = data.notes;
            setConflict(null);
          } else {
            setConflict({ value: data.notes, by: data.userName || 'Someone' });
          }
        }

        if (data.type === 'typing' && data.field === 'notes') {
          setRemoteTyping(data.userName || 'Someone');
          setTimeout(() => setRemoteTyping(prev => prev === data.userName ? null : prev), 3500);
        }

        if (data.type === 'typing' && data.field === null) {
          setRemoteTyping(null);
        }
      } catch { /* ignore malformed */ }
    };

    es.onerror = () => {
      // SSE reconnects automatically; no action needed
    };

    return () => {
      es.close();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [projectId]);

  function applyRemote() {
    if (conflict) {
      setNotes(conflict.value);
      lastSavedValue.current = conflict.value;
      setConflict(null);
    }
  }

  function keepMine() {
    if (conflict) {
      save(currentNotes.current);
      setConflict(null);
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Info / status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--accent)' }}>
        <span style={{ fontSize: 13 }}>📝</span>
        <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, flex: 1 }}>
          {remoteTyping
            ? <><strong style={{ color: 'var(--accent)' }}>{remoteTyping}</strong> is typing…</>
            : <>Notes are <strong>private to the team</strong>. Changes sync in real-time.</>}
        </span>
        <LivePresence entity={`project-notes:${projectId}`} />
      </div>

      {/* Conflict banner */}
      {conflict && (
        <div style={{
          padding: '12px 16px', background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--r-sm)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13 }}>⚠️</span>
          <span style={{ fontSize: 12, color: 'var(--ink-1)', flex: 1 }}>
            <strong>{conflict.by}</strong> updated the notes while you were typing.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={applyRemote} className="btn btn-sm" style={{ fontSize: 11 }}>Use theirs</button>
            <button onClick={keepMine} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Keep mine</button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Engagement Notes</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Markdown · Auto-saved · Real-time sync</div>
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
