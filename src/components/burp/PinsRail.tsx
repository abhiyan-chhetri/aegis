'use client';

/**
 * PinsRail — the "interesting rail". Drag ANYTHING here — traffic rows or
 * checklist items — to pin it; promote a pin straight into a finding draft
 * (reproduction/payload + affected asset pre-filled, severity + CWE mapped
 * from the technique category).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';

interface Pin {
  id: string;
  trafficId: string | null;
  checklistItemId: string | null;
  note: string;
  userName: string;
  createdAt: string;
  traffic: {
    method: string; url: string; statusCode: number; tool: string;
    host: string; path: string; createdAt: string | null;
    anomalies: Array<{ label: string }>;
  } | null;
  checklistItem: {
    category: string; technique: string; status: string;
    description: string; payload: string; endpoint: string | null;
  } | null;
}

/** Technique category → default severity + CWE for finding promotion. */
const CATEGORY_META: Record<string, { severity: string; cwe: string }> = {
  xss: { severity: 'medium', cwe: 'CWE-79' },
  sqli: { severity: 'high', cwe: 'CWE-89' },
  ssti: { severity: 'high', cwe: 'CWE-1336' },
  xxe: { severity: 'high', cwe: 'CWE-611' },
  ssrf: { severity: 'high', cwe: 'CWE-918' },
  idor: { severity: 'high', cwe: 'CWE-639' },
  auth: { severity: 'high', cwe: 'CWE-287' },
  jwt: { severity: 'medium', cwe: 'CWE-345' },
  'file-upload': { severity: 'high', cwe: 'CWE-434' },
  'command-injection': { severity: 'critical', cwe: 'CWE-78' },
  'path-traversal': { severity: 'high', cwe: 'CWE-22' },
  deserialization: { severity: 'high', cwe: 'CWE-502' },
  api: { severity: 'medium', cwe: 'CWE-284' },
  graphql: { severity: 'medium', cwe: 'CWE-284' },
  'cors-csrf': { severity: 'medium', cwe: 'CWE-352' },
  'open-redirect': { severity: 'low', cwe: 'CWE-601' },
  'info-disclosure': { severity: 'low', cwe: 'CWE-200' },
  headers: { severity: 'low', cwe: 'CWE-693' },
  'rate-limit': { severity: 'low', cwe: 'CWE-307' },
  recon: { severity: 'info', cwe: 'CWE-200' },
};

export function PinsRail({ projectId, onCount }: {
  projectId: string;
  onCount?: (n: number) => void;
}) {
  const router = useRouter();
  const [pins, setPins] = useState<Pin[]>([]);
  const [dropHover, setDropHover] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/burp/pins`);
      const data = await res.json();
      if (res.ok) {
        setPins(data.pins || []);
        onCount?.(data.pins?.length || 0);
      }
    } catch { /* ignore */ }
  }, [projectId, onCount]);
  useEffect(() => { load(); }, [load]);

  const addPin = async (payload: { trafficId?: string; checklistItemId?: string }) => {
    const res = await fetch(`/api/projects/${projectId}/burp/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast.success('Pinned to the rail');
      load();
    } else {
      toast.error('Couldn\'t pin');
    }
  };

  const removePin = async (id: string) => {
    await fetch(`/api/projects/${projectId}/burp/pins/${id}`, { method: 'DELETE' });
    load();
  };

  const saveNote = async (pin: Pin, note: string) => {
    await fetch(`/api/projects/${projectId}/burp/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trafficId: pin.trafficId, checklistItemId: pin.checklistItemId, note }),
    });
    load();
  };

  const promoteTraffic = async (pin: Pin) => {
    if (!pin.traffic) return;
    setBusy(pin.id);
    try {
      const detail = await fetch(`/api/projects/${projectId}/burp/traffic/${pin.trafficId}`).then(r => r.json()).catch(() => null);
      const t = detail?.traffic || pin.traffic;
      const title = pin.note || `Pinned: ${t.method} ${pin.traffic.host}${pin.traffic.path || ''}`;
      const reproduction = [
        '## Captured request/response (pinned from Burp Bridge)',
        '',
        `\`${t.method} ${t.url}\` → **${t.statusCode}**`,
        '',
        '### Request',
        '```http',
        `${t.method} ${t.url}`,
        (t.requestBody || '(no body)'),
        '```',
        '### Response',
        '```http',
        `HTTP ${t.statusCode}`,
        (t.responseBody || '(no body)'),
        '```',
      ].join('\n');

      const res = await fetch(`/api/projects/${projectId}/findings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.slice(0, 120),
          severity: 'medium',
          summary: 'Pinned from Burp Bridge traffic for further analysis.',
          description: `Pinned from captured traffic:\n\n- Endpoint: \`${t.method} ${t.url}\`\n- Status: ${t.statusCode}\n- Tool: ${t.tool || 'proxy'}\n\n_(Investigate and fill in the details.)_`,
          reproduction,
          assets: [t.host || ''],
          cvss: 0, cvssVector: '', cvssLocked: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      await removePin(pin.id);
      toast.success('Finding draft created', { description: data.finding?.code || 'new finding' });
      router.push(`/projects/${projectId}/findings/${data.finding?.id || data.id}`);
    } catch (e) {
      toast.error('Couldn\'t create finding', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setBusy(null);
    }
  };

  const promoteChecklist = async (pin: Pin) => {
    if (!pin.checklistItem) return;
    setBusy(pin.id);
    try {
      const meta = CATEGORY_META[pin.checklistItem.category] ?? { severity: 'medium', cwe: '' };
      const ep = pin.checklistItem.endpoint || '';
      const host = ep.match(/^[A-Z]+\s+([^\s/]+)/)?.[1] || '';
      const title = pin.note || `${pin.checklistItem.technique}${ep ? ` — ${ep}` : ''}`;
      const reproduction = [
        '## Checklist item (pinned from Burp Bridge)',
        '',
        `**Technique:** ${pin.checklistItem.technique}`,
        `**Endpoint:** ${ep || 'general'}`,
        '',
        '### Attempt',
        '```text',
        pin.checklistItem.payload || '(no payload recorded)',
        '```',
        '',
        'Confirm the issue against the live target and expand this section.',
      ].join('\n');

      const res = await fetch(`/api/projects/${projectId}/findings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.slice(0, 120),
          severity: meta.severity,
          summary: `Checklist technique: ${pin.checklistItem.technique} (${pin.checklistItem.category}).`,
          description: pin.checklistItem.description || `Generated from checklist technique "${pin.checklistItem.technique}".`,
          reproduction,
          cwe: meta.cwe,
          assets: host ? [host] : [],
          cvss: 0, cvssVector: '', cvssLocked: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      await removePin(pin.id);
      toast.success('Finding draft created', { description: `${data.finding?.code || 'new'} · ${meta.severity} · ${meta.cwe || 'no CWE'}` });
      router.push(`/projects/${projectId}/findings/${data.finding?.id || data.id}`);
    } catch (e) {
      toast.error('Couldn\'t create finding', { description: e instanceof Error ? e.message : 'network error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDropHover(true); }}
      onDragLeave={() => setDropHover(false)}
      onDrop={e => {
        e.preventDefault();
        setDropHover(false);
        const trafficId = e.dataTransfer.getData('text/aegis-traffic') || e.dataTransfer.getData('text/plain');
        const checklistId = e.dataTransfer.getData('text/aegis-checklist');
        if (checklistId) addPin({ checklistItemId: checklistId });
        else if (trafficId) addPin({ trafficId });
      }}
      style={{
        width: 264, flexShrink: 0, borderRadius: 'var(--r-sm)',
        border: `1.5px dashed ${dropHover ? 'var(--accent)' : 'var(--line-2)'}`,
        background: dropHover ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'var(--bg-1)',
        display: 'flex', flexDirection: 'column', maxHeight: 520, overflow: 'hidden',
        transition: 'border-color .15s, background .15s',
      }}
    >
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Ico name="pin" size={13} style={{ color: 'var(--sev-medium)' }} />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-0)', flex: 1 }}>Interesting rail</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{pins.length}</span>
      </div>
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pins.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--ink-3)', textAlign: 'center', padding: '18px 8px', lineHeight: 1.6 }}>
            Drag traffic rows <strong>or checklist items</strong> here to pin them.
            <br />Promote a pin straight into a finding draft.
          </div>
        )}
        {pins.map(pin => (
          <div key={pin.id} style={{ border: '1px solid var(--line-1)', borderRadius: 'var(--r-xs)', background: 'var(--bg-0)', overflow: 'hidden' }}>
            {/* Header line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px' }}>
              {pin.traffic && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: pin.traffic.method === 'GET' ? '#5B9BD5' : '#4CAF7D', flexShrink: 0 }}>
                  {pin.traffic.method}
                </span>
              )}
              {pin.checklistItem && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, padding: '1px 5px', borderRadius: 3, background: 'rgba(155,127,212,.12)', color: '#9b7fd4', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {pin.checklistItem.category}
                </span>
              )}
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pin.traffic
                  ? pin.traffic.host + (pin.traffic.path || '')
                  : pin.checklistItem
                    ? pin.checklistItem.technique
                    : pin.note || 'untracked pin'}
              </span>
              <button onClick={() => removePin(pin.id)} style={{ background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', padding: 2 }}>
                <Ico name="x" size={10} />
              </button>
            </div>

            {/* Body line */}
            {pin.traffic && (
              <div style={{ padding: '0 8px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, color: pin.traffic.statusCode >= 400 ? 'var(--sev-high)' : 'var(--ink-2)' }}>
                  {pin.traffic.statusCode}
                </span>
                {pin.traffic.anomalies.length > 0 && (
                  <span style={{ fontSize: 9.5, color: 'var(--sev-critical)' }} title={pin.traffic.anomalies.map(a => a.label).join(' · ')}>⚑{pin.traffic.anomalies.length}</span>
                )}
                <button className="btn btn-sm" onClick={() => promoteTraffic(pin)} disabled={busy === pin.id}
                  style={{ marginLeft: 'auto', fontSize: 9.5, padding: '1px 8px', gap: 3 }}>
                  <Ico name="sparkles" size={10} style={{ color: '#9b7fd4' }} />
                  {busy === pin.id ? 'Creating…' : 'Promote → finding'}
                </button>
              </div>
            )}
            {pin.checklistItem && (
              <div style={{ padding: '0 8px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 8.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '1px 5px', borderRadius: 3,
                  background: pin.checklistItem.status === 'succeeded' ? 'rgba(76,175,125,.12)' : pin.checklistItem.status === 'failed' ? 'rgba(255,92,58,.12)' : 'var(--bg-2)',
                  color: pin.checklistItem.status === 'succeeded' ? 'var(--status-resolved)' : pin.checklistItem.status === 'failed' ? 'var(--sev-critical)' : 'var(--ink-3)',
                }}>{pin.checklistItem.status}</span>
                <span className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {pin.checklistItem.endpoint || 'general'}
                </span>
                <button className="btn btn-sm" onClick={() => promoteChecklist(pin)} disabled={busy === pin.id}
                  style={{ fontSize: 9.5, padding: '1px 8px', gap: 3 }}>
                  <Ico name="sparkles" size={10} style={{ color: '#9b7fd4' }} />
                  {busy === pin.id ? 'Creating…' : 'Promote → finding'}
                </button>
              </div>
            )}
            {!pin.traffic && !pin.checklistItem && (
              <div style={{ padding: '0 8px 6px' }}>
                <input
                  className="input"
                  placeholder="Note…"
                  defaultValue={pin.note}
                  onBlur={e => { if (e.target.value.trim() !== pin.note) saveNote(pin, e.target.value.trim()); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  style={{ fontSize: 10.5, padding: '2px 6px' }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
