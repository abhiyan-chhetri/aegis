'use client';

/**
 * BurpSettings — engagement keys (generate/revoke), the scope guard, retention,
 * stats, and setup instructions for the Burp extension.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';
import { BurpSettings as SettingsT, BurpStats, EngagementKey } from './types';

interface RejectedHost { host: string; count: number; lastSeen: string }

export function BurpSettings({ projectId, onStatsChange, onClose }: {
  projectId: string;
  onStatsChange: () => void;
  onClose?: () => void;
}) {
  const [settings, setSettings] = useState<SettingsT | null>(null);
  const [keys, setKeys] = useState<EngagementKey[]>([]);
  const [stats, setStats] = useState<BurpStats | null>(null);
  const [rejectedHosts, setRejectedHosts] = useState<RejectedHost[]>([]);
  const [callbackUrl, setCallbackUrl] = useState('http://127.0.0.1:8787');
  const [scopeText, setScopeText] = useState('');
  const [retention, setRetention] = useState(90);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingScope, setSavingScope] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingCallback, setSavingCallback] = useState(false);
  const [purging, setPurging] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [generatingPairing, setGeneratingPairing] = useState(false);
  // Capture rules
  const [dropHostsText, setDropHostsText] = useState('');
  const [onlyTools, setOnlyTools] = useState<string[]>([]);
  const [dropStatic, setDropStatic] = useState(false);
  const TOOL_OPTIONS = ['proxy', 'repeater', 'intruder', 'scanner', 'manual', 'other'];

  const loadRules = (rules: Record<string, unknown>) => {
    setDropHostsText((Array.isArray(rules.dropHosts) ? rules.dropHosts : []).join('\n'));
    setOnlyTools(Array.isArray(rules.onlyTools) ? rules.onlyTools.map(String) : []);
    setDropStatic(rules.dropStatic === true);
  };

  const purgeAll = async () => {
    if (!confirm(
      'Clear ALL Burp Bridge data for this project?\n\n' +
      'This permanently deletes captured traffic, endpoints, checklist items, WebSocket messages, pins and engagement keys. ' +
      'The Burp extension loses access immediately. There is no undo.\n\n' +
      '(Marking the project Completed does this automatically.)'
    )) return;
    setPurging(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/purge`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Purge failed');
      const p = data.purged || {};
      toast.success('Burp Bridge data cleared', {
        description: `${p.traffic} traffic · ${p.endpoints} endpoints · ${p.checklist} checklist · ${p.websocket} WS · ${p.pins} pins freed.`,
      });
      load();
      onStatsChange();
    } catch (e) {
      toast.error('Purge failed', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setPurging(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/burp`);
      const data = await res.json();
      if (res.ok) {
        setSettings(data.settings);
        setKeys(data.keys || []);
        setStats(data.stats);
        setRejectedHosts(data.rejectedHosts || []);
        setScopeText(data.settings?.burpScope || '');
        setRetention(data.settings?.burpRetentionDays || 90);
        loadRules(data.settings?.burpCaptureRules || {});
      }
    } catch { /* ignore */ }
    try {
      const cb = await fetch('/api/burp/callback').then(r => r.json());
      if (cb?.callbackUrl) setCallbackUrl(cb.callbackUrl);
    } catch { /* ignore */ }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const addHostToScope = async (host: string) => {
    const next = (scopeText.trim() ? scopeText.trim() + '\n' : '') + host.split(':')[0];
    setScopeText(next);
    const res = await fetch(`/api/projects/${projectId}/burp`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ burpScope: next }),
    });
    if (res.ok) {
      toast.success(`${host} added to the scope guard`);
      setRejectedHosts(prev => prev.filter(h => h.host !== host));
      load();
      onStatsChange();
    } else {
      toast.error('Couldn\'t update scope');
    }
  };

  const saveCallback = async () => {
    setSavingCallback(true);
    try {
      const res = await fetch('/api/burp/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackUrl }),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success('Extension callback URL saved');
    } catch (e) {
      toast.error('Couldn\'t save callback URL', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setSavingCallback(false);
    }
  };

  const generatePairing = async () => {
    setGeneratingPairing(true);
    setPairingCode(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/pairing`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setPairingCode(d.code);
    } catch (e) {
      toast.error('Couldn\'t generate pairing code', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setGeneratingPairing(false);
    }
  };

  const saveRules = async () => {
    setSavingScope(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          burpCaptureRules: {
            dropHosts: dropHostsText.split('\n').map(l => l.trim()).filter(Boolean),
            onlyTools,
            dropStatic,
          },
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success('Capture rules saved — applied to new traffic on ingest');
      load();
    } catch (e) {
      toast.error('Couldn\'t save capture rules', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setSavingScope(false);
    }
  };

  const createKey = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/burp/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create key');
      setNewKey(data.key);
      load();
      onStatsChange();
    } catch (e) {
      toast.error('Couldn\'t create key', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!confirm('Revoke this engagement key? The Burp extension will immediately lose access.')) return;
    const res = await fetch(`/api/burp/keys/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Key revoked'); load(); } else { toast.error('Couldn\'t revoke key'); }
  };

  const saveSettings = async () => {
    setSavingScope(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ burpScope: scopeText, burpRetentionDays: retention }),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success('Burp settings saved');
      load();
      onStatsChange();
    } catch (e) {
      toast.error('Couldn\'t save settings', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setSavingScope(false);
    }
  };

  const ingestUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/burp/traffic`;

  const runTestEvent = async () => {
    setTesting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/test-event`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test event failed');
      toast.success(`Pipeline OK — test event ingested (${data.accepted} accepted)`, { description: 'Open the Traffic tab — it should be streaming in live right now.' });
      load();
      onStatsChange();
    } catch (e) {
      toast.error('Test event failed', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setTesting(false);
    }
  };

  const card = (content: React.ReactNode, pad = true) => (
    <div className="card" style={{ padding: pad ? 'var(--card-pad)' : 0, overflow: 'hidden' }}>{content}</div>
  );

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Scope guard */}
      {card(
        <>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ marginBottom: 3 }}>🛡️ Scope guard</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              Only traffic for these hosts is accepted by the ingest endpoint — anything else is rejected (counted below).
              One host per line. Wildcards supported: <span className="mono">*.example.com</span>. Empty = accept everything (extension-side filter only).
            </div>
          </div>
          <div style={{ padding: '14px 18px' }}>
            <textarea
              className="input"
              value={scopeText}
              onChange={e => setScopeText(e.target.value)}
              rows={5}
              placeholder={'api.example.com\napp.example.com\n*.internal.example.net'}
              style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
            />
            {stats && stats.outOfScope > 0 && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--sev-critical)', background: 'rgba(255,92,58,.08)', border: '1px solid rgba(255,92,58,.2)', borderRadius: 'var(--r-sm)', padding: '6px 10px' }}>
                ⚠ {stats.outOfScope} request{stats.outOfScope === 1 ? '' : 's'} rejected by the scope guard so far.
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Retain traffic for
                <input
                  type="number"
                  className="input"
                  value={retention}
                  onChange={e => setRetention(Number(e.target.value) || 90)}
                  min={1}
                  max={3650}
                  style={{ width: 70, fontSize: 12 }}
                />
                days
              </label>
              <button className="btn btn-primary btn-sm" onClick={saveSettings} disabled={savingScope} style={{ marginLeft: 'auto', fontSize: 11.5, gap: 5 }}>
                <Ico name="save" size={12} />
                {savingScope ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Engagement keys */}
      {card(
        <>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ marginBottom: 3 }}>🔑 Engagement keys</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                The Burp extension authenticates with one of these. Only the hash is stored — the plaintext is shown once.
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={createKey} disabled={creating} style={{ gap: 5, fontSize: 11.5 }}>
              <Ico name="plus" size={12} />
              {creating ? 'Creating…' : 'Generate key'}
            </button>
          </div>

          {newKey && (
            <div style={{ padding: '14px 18px', background: 'rgba(16,185,129,.06)', borderBottom: '1px solid var(--line-1)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginBottom: 6 }}>
                <strong style={{ color: 'var(--status-resolved)' }}>Copy this now — it won\'t be shown again.</strong> Put it in the Burp extension config:
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12.5, background: '#0F1115', color: '#8FE3B0', padding: '8px 12px', borderRadius: 4, wordBreak: 'break-all' }}>{newKey}</code>
                <button
                  className="btn btn-sm"
                  onClick={() => { navigator.clipboard.writeText(newKey); toast.success('Key copied'); }}
                  style={{ gap: 4, fontSize: 11 }}
                >
                  <Ico name="copy" size={12} /> Copy
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setNewKey(null)} style={{ fontSize: 11 }}>Done</button>
              </div>
            </div>
          )}

          {keys.length === 0 && !newKey && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
              No active keys. Generate one to connect the Burp extension.
            </div>
          )}
          {keys.map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--line-1)' }}>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: k.revokedAt ? 'var(--ink-4)' : 'var(--ink-0)' }}>
                {k.keyPrefix}••••••••••
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{k.label}</span>
              <div style={{ flex: 1 }} />
              {k.lastUsedAt && (
                <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--status-resolved)' }}>
                  last used {new Date(k.lastUsedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {k.revokedAt ? (
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-4)', textTransform: 'uppercase' }}>revoked</span>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => revokeKey(k.id)} style={{ fontSize: 10.5, color: 'var(--sev-critical)' }}>
                  Revoke
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {/* Extension setup */}
      {card(
        <>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ marginBottom: 3 }}>📡 Extension setup</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Load the Aegis Burp Bridge extension (Java, Montoya API) into Burp Suite and point it here.</div>
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
              <span className="eyebrow" style={{ marginRight: 8, fontSize: 9 }}>INGEST URL</span>
              <code className="mono" style={{ fontSize: 12, background: 'var(--bg-2)', padding: '3px 8px', borderRadius: 4 }}>{ingestUrl}</code>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { navigator.clipboard.writeText(ingestUrl); toast.success('Ingest URL copied'); }}
                style={{ marginLeft: 8, fontSize: 10.5, padding: '1px 8px' }}
              >
                <Ico name="copy" size={11} /> Copy
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
              <span className="eyebrow" style={{ marginRight: 8, fontSize: 9 }}>AUTH HEADER</span>
              <code className="mono" style={{ fontSize: 12, background: 'var(--bg-2)', padding: '3px 8px', borderRadius: 4 }}>x-engagement-key: &lt;key&gt;</code>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
              The extension jar builds from <code className="mono">burp-extension/</code> in the Aegis repo
              (<code className="mono">mvn package</code> → <code className="mono">target/aegis-burp-bridge.jar</code>) and loads via
              <strong> Extensions → Add</strong>. Its suite tab has the server URL, key, scope &amp; noise filters.
            </div>
            <ol style={{ fontSize: 12, color: 'var(--ink-3)', margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.8 }}>
              <li>Generate an engagement key above and paste it into the extension tab.</li>
              <li>Hit <strong>Test connection</strong> in the extension tab — you should get "connected".</li>
              <li>Browse the target through Burp Proxy / fire Repeater / Intruder — traffic streams in live.</li>
              <li><strong>Repeater / Intruder</strong> activity automatically marks matching checklist items as tested.</li>
            </ol>
          </div>
        </>
      )}

      {/* Test pipeline */}
      {card(
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 3 }}>🧪 Test the pipeline</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              Fires a synthetic request/response through the exact same ingest path the extension uses — dedup, anomaly flags, secret scan, live broadcast.
              You should see it appear in the Traffic tab instantly.
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={runTestEvent} disabled={testing} style={{ gap: 5, fontSize: 11.5, flexShrink: 0 }}>
            <Ico name="zap" size={12} />
            {testing ? 'Firing…' : 'Send test event'}
          </button>
        </div>
      )}

      {/* Scope sync-back: hosts the extension forwarded that were rejected */}
      {rejectedHosts.length > 0 && (
        card(
          <>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)' }}>
              <div className="eyebrow" style={{ marginBottom: 3 }}>🔄 Scope sync-back</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                The extension forwarded traffic for hosts the scope guard rejected — add any that are genuinely in scope:
              </div>
            </div>
            {rejectedHosts.map(h => (
              <div key={h.host} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px', borderBottom: '1px solid var(--line-1)' }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-1)', flex: 1 }}>{h.host}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{h.count} rejected</span>
                <button className="btn btn-sm" onClick={() => addHostToScope(h.host)} style={{ fontSize: 10.5, gap: 4 }}>
                  <Ico name="plus" size={11} /> Add to scope guard
                </button>
              </div>
            ))}
          </>
        )
      )}

      {/* Danger zone: clear Burp data */}
      {card(
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, borderLeft: '3px solid var(--sev-critical)' }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 3 }}>🗑️ Clear Burp Bridge data</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              Wipes captured traffic, endpoints, checklist, WebSocket messages, pins and keys for this project.
              Done automatically when the project is marked <strong>Completed</strong> — use this for manual cleanup
              (e.g. after each engagement phase).
            </div>
          </div>
          <button
            className="btn btn-sm"
            onClick={purgeAll}
            disabled={purging}
            style={{ gap: 5, fontSize: 11.5, flexShrink: 0, borderColor: 'var(--sev-critical)', color: 'var(--sev-critical)' }}
          >
            <Ico name="trash" size={12} />
            {purging ? 'Clearing…' : 'Clear Burp data'}
          </button>
        </div>
      )}

      {/* Pairing code — auto-provision the extension */}
      {card(
        <>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ marginBottom: 3 }}>🔗 One-click extension setup (pairing)</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                Generate an 8-character code, paste it into the extension's <strong>Pairing code</strong> field — it fetches the server URL + engagement key automatically. Single-use, expires in 10 minutes.
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={generatePairing} disabled={generatingPairing} style={{ gap: 5, fontSize: 11.5 }}>
              <Ico name="plus" size={12} />
              {generatingPairing ? 'Generating…' : 'Generate pairing code'}
            </button>
          </div>
          {pairingCode && (
            <div style={{ padding: '14px 18px', background: 'rgba(16,185,129,.06)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginBottom: 6 }}>
                <strong style={{ color: 'var(--status-resolved)' }}>Copy this code</strong> into the extension's Pairing code field:
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, letterSpacing: '0.2em', background: '#0F1115', color: '#8FE3B0', padding: '8px 14px', borderRadius: 4 }}>{pairingCode}</code>
                <button className="btn btn-sm" onClick={() => { navigator.clipboard.writeText(pairingCode); toast.success('Code copied'); }} style={{ gap: 4, fontSize: 11 }}>
                  <Ico name="copy" size={12} /> Copy
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setPairingCode(null)} style={{ fontSize: 11 }}>Done</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Capture rules — ingest filters */}
      {card(
        <>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)' }}>
            <div className="eyebrow" style={{ marginBottom: 3 }}>🎛️ Capture rules</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              Applied server-side on ingest — drop noise without touching the extension. New traffic only.
            </div>
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Drop hosts (one per line)</div>
              <textarea
                className="input"
                value={dropHostsText}
                onChange={e => setDropHostsText(e.target.value)}
                rows={3}
                placeholder={'tracking.example.com\ncdn.example.net'}
                style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
              />
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: 9, marginBottom: 4 }}>Only capture these tools (empty = all)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TOOL_OPTIONS.map(t => (
                  <label key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--ink-2)', cursor: 'pointer', padding: '3px 8px', border: `1px solid ${onlyTools.includes(t) ? 'var(--line-3)' : 'var(--line-1)'}`, borderRadius: 100, background: onlyTools.includes(t) ? 'var(--bg-2)' : 'transparent' }}>
                    <input type="checkbox" checked={onlyTools.includes(t)} onChange={e => setOnlyTools(prev => e.target.checked ? [...prev, t] : prev.filter(x => x !== t))} style={{ accentColor: '#5B9BD5' }} />
                    {t}
                  </label>
                ))}
              </div>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={dropStatic} onChange={e => setDropStatic(e.target.checked)} style={{ accentColor: '#5B9BD5' }} />
              Drop static assets (images / fonts / css / archives)
            </label>
            <button className="btn btn-primary btn-sm" onClick={saveRules} disabled={savingScope} style={{ alignSelf: 'flex-start', fontSize: 11.5, gap: 5 }}>
              <Ico name="save" size={12} />
              {savingScope ? 'Saving…' : 'Save capture rules'}
            </button>
          </div>
        </>
      )}

      {/* Show-in-Burp callback */}      {card(
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 3 }}>🖱️ "Show in Burp" callback</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              Where the Aegis UI asks the extension to open an exchange in Burp (Repeater tab). Matches the extension's Reveal port.
            </div>
          </div>
          <input
            className="input"
            value={callbackUrl}
            onChange={e => setCallbackUrl(e.target.value)}
            style={{ width: 230, fontSize: 12, fontFamily: 'var(--font-mono)' }}
            placeholder="http://127.0.0.1:8787"
          />
          <button className="btn btn-primary btn-sm" onClick={saveCallback} disabled={savingCallback} style={{ fontSize: 11, gap: 4 }}>
            <Ico name="save" size={12} />
            {savingCallback ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {[
            ['Captured traffic', stats.trafficTotal],
            ['Anomaly flags', stats.anomalyTraffic],
            ['Secrets found', stats.secretTraffic],
            ['Endpoints', stats.endpoints],
            ['JS assets', stats.jsAssets],
            ['Rejected (scope)', stats.outOfScope],
          ].map(([label, value]) => (
            <div key={label as string} className="card" style={{ padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--ink-0)' }}>{value}</div>
              <div style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--ink-3)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (!onClose) return body;

  // Modal variant
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.55)' }}>
      <div style={{
        width: 760, maxWidth: '95vw', height: '88vh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)',
        boxShadow: '0 24px 80px rgba(0,0,0,.5)', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Ico name="settings" size={16} style={{ color: 'var(--ink-2)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink-0)' }}>Burp Bridge setup</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>Engagement key, scope guard, retention &amp; extension instructions</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: 28, padding: 0 }}><Ico name="x" size={14} /></button>
        </div>
        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 16 }}>{body}</div>
      </div>
    </div>
  );
}
