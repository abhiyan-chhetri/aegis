'use client';

/**
 * LiveNotes — collaborative notes editor with:
 *  - Debounced auto-save (1.2 s)
 *  - Server poll every 20 s (syncs if user hasn't typed in >4 s)
 *  - Conflict banner when a remote edit arrives while you're typing
 *  - LivePresence avatars for who else is on this page
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LivePresence } from './LivePresence';

const SAVE_DEBOUNCE = 1200;
const POLL_INTERVAL = 20_000;
const IDLE_BEFORE_SYNC = 4_000; // ms since last keystroke before we auto-apply remote content

interface Props {
  projectId: string;
  initialNotes: string;
}

export function LiveNotes({ projectId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [conflict, setConflict] = useState<string | null>(null); // remote value when conflict
  const [remoteEditor, setRemoteEditor] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypedAt = useRef<number>(0);
  const lastSavedValue = useRef(initialNotes);
  const currentNotes = useRef(initialNotes);

  // Keep ref in sync so poll closure always has latest
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
  }

  // Poll server for remote changes
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return;
      const data = await res.json();
      const serverNotes: string = data.project?.notes ?? '';

      // No change
      if (serverNotes === lastSavedValue.current) return;

      const idleSince = Date.now() - lastTypedAt.current;
      if (idleSince > IDLE_BEFORE_SYNC) {
        // User is idle — silently apply
        setNotes(serverNotes);
        lastSavedValue.current = serverNotes;
        setRemoteEditor(null);
      } else {
        // User is actively typing — show conflict banner
        setConflict(serverNotes);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    pollTimer.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [poll]);

  function applyRemote() {
    if (conflict !== null) {
      setNotes(conflict);
      lastSavedValue.current = conflict;
      setConflict(null);
      setRemoteEditor(null);
    }
  }

  function keepMine() {
    if (conflict !== null) {
      save(currentNotes.current);
      setConflict(null);
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Info banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)', borderLeft: '3px solid var(--accent)' }}>
        <span style={{ fontSize: 13 }}>📝</span>
        <span style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, flex: 1 }}>
          Notes are <strong>private to the team</strong> and sent to AI when generating findings or summaries.
          Changes sync automatically across team members.
        </span>
        <LivePresence entity={`project-notes:${projectId}`} />
      </div>

      {/* Conflict banner */}
      {conflict !== null && (
        <div style={{
          padding: '12px 16px', background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--r-sm)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13 }}>⚠️</span>
          <span style={{ fontSize: 12, color: 'var(--ink-1)', flex: 1 }}>
            <strong>Someone else updated the notes</strong> while you were typing.
            {remoteEditor && ` (${remoteEditor})`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={applyRemote} className="btn btn-sm" style={{ fontSize: 11 }}>
              Use theirs
            </button>
            <button onClick={keepMine} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
              Keep mine
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 2 }}>Engagement Notes</div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Markdown supported · Auto-saved · Live sync</div>
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
          placeholder={`# Engagement Notes\n\n## Recon Findings\n- Target runs nginx 1.18 with default error pages\n\n## Client Context\n- Pentest scope agreed\n- Out of scope: payment gateway\n\n## Tester Observations\n- Auth bypass via role parameter\n- API keys found in JS bundle\n\n## Notes for AI\n- Focus on business impact\n- Client is fintech — emphasise PCI-DSS`}
          style={{ minHeight: 420, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.7 }}
        />
      </div>
    </div>
  );
}
