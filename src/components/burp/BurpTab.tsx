'use client';

/**
 * BurpTab — the Burp Bridge workspace inside a project: live activity stream,
 * traffic capture browser, endpoint inventory, AI attack checklist (with the
 * god-level cheatsheet), and settings (engagement key, scope guard, retention).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Ico } from '@/components/chrome/icons';
import { toast } from '@/components/ui/Toast';
import { TrafficList } from './TrafficList';
import { EndpointTable } from './EndpointTable';
import { ChecklistView } from './ChecklistView';
import { BurpSettings } from './BurpSettings';
import { CoverageView } from './CoverageView';
import { WebSocketsView } from './WebSocketsView';
import { SecretsView } from './SecretsView';
import { BurpStats, TrafficRow } from './types';

type SubTab = 'traffic' | 'websocket' | 'endpoints' | 'checklist' | 'coverage' | 'secrets' | 'settings';

const SUBTABS: Array<{ key: SubTab; label: string; icon: string }> = [
  { key: 'traffic', label: 'Traffic', icon: 'inbox' },
  { key: 'websocket', label: 'WebSockets', icon: 'waves' },
  { key: 'endpoints', label: 'Endpoints', icon: 'target' },
  { key: 'checklist', label: 'Checklist', icon: 'list' },
  { key: 'coverage', label: 'Coverage', icon: 'chart' },
  { key: 'secrets', label: 'Secrets', icon: 'key' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

export function BurpTab({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [tab, setTab] = useState<SubTab>('traffic');
  const [stats, setStats] = useState<BurpStats | null>(null);
  const [live, setLive] = useState<boolean>(false);
  const [newTraffic, setNewTraffic] = useState<TrafficRow[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const idSig = useRef('');

  // ── Load stats once ─────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/burp`);
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => { loadStats(); }, [loadStats]);

  // ── Live activity stream (SSE) ──────────────────────────────────────────────
  useEffect(() => {
    const es = new EventSource(`/api/projects/${projectId}/burp/stream`);
    esRef.current = es;
    // Stats updates from streaming events are DEBOUNCED: an Intruder burst can
    // push hundreds of events/sec — a setStats per event would re-render the
    // whole tab (and the live row merge) on every single one. We accumulate
    // deltas and flush them once a second instead.
    const pending = { traffic: 0, anomalies: 0 };
    const flushTimer = setInterval(() => {
      if (pending.traffic === 0) return;
      setStats(prev => prev ? {
        ...prev,
        trafficTotal: prev.trafficTotal + pending.traffic,
        trafficToday: prev.trafficToday + pending.traffic,
        anomalyTraffic: prev.anomalyTraffic + pending.anomalies,
      } : prev);
      pending.traffic = 0;
      pending.anomalies = 0;
    }, 1000);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') { setLive(true); return; }
        if (data.type === 'traffic' && data.traffic) {
          const row: TrafficRow = {
            id: data.traffic.id,
            method: data.traffic.method,
            url: data.traffic.url,
            host: '',
            pathNoQuery: '',
            query: '',
            statusCode: data.traffic.statusCode,
            contentType: '',
            tool: data.traffic.tool || 'proxy',
            sizeBytes: 0,
            truncated: false,
            anomalies: data.traffic.anomalies || [],
            secrets: [],
            findingId: null,
            createdAt: data.traffic.createdAt || new Date().toISOString(),
          };
          // Cap the live merge queue — only the newest 50 rows matter.
          setNewTraffic(prev => {
            if (prev.some(r => r.id === row.id)) return prev;
            return [row, ...prev].slice(0, 50);
          });
          pending.traffic++;
          if ((data.traffic.anomalies || []).length > 0) pending.anomalies++;
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => { setLive(false); };
    return () => { es.close(); esRef.current = null; clearInterval(flushTimer); };
  }, [projectId]);

  // Also bump stats when the settings view creates data.
  useEffect(() => {
    if (idSig.current !== projectId) {
      idSig.current = projectId;
      setNewTraffic([]);
    }
  }, [projectId]);

  const statChip = (label: string, value: string | number, color = 'var(--ink-1)') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 74 }}>
      <span style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-3)' }}>{label}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-0)' }}>Burp Bridge</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 100,
              fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase',
              background: live ? 'rgba(16,185,129,.12)' : 'var(--bg-2)',
              color: live ? 'var(--status-resolved)' : 'var(--ink-3)',
              border: `1px solid ${live ? 'rgba(16,185,129,.3)' : 'var(--line-1)'}`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: live ? 'var(--status-resolved)' : 'var(--ink-4)', animation: live ? 'livePulse 1.6s ease-in-out infinite' : undefined }} />
              {live ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
            {projectName} · live traffic from the Burp extension, auto-anomaly flags, AI checklist &amp; secrets scan
          </div>
        </div>

        {/* Stats chips */}
        {stats && (
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', padding: '8px 14px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)' }}>
            {statChip('traffic', stats.trafficTotal)}
            {statChip('today', stats.trafficToday)}
            {statChip('flags', stats.anomalyTraffic, stats.anomalyTraffic > 0 ? 'var(--sev-critical)' : 'var(--ink-1)')}
            {statChip('secrets', stats.secretTraffic, stats.secretTraffic > 0 ? '#e8b339' : 'var(--ink-1)')}
            {statChip('endpoints', stats.endpoints)}
            <div style={{ width: 1, height: 30, background: 'var(--line-1)' }} />
            {statChip('open', stats.checklist.untested)}
            {statChip('tested', stats.checklist.tested + stats.checklist.succeeded, 'var(--status-resolved)')}
          </div>
        )}

        <button className="btn btn-ghost btn-sm" onClick={() => setSettingsOpen(true)} style={{ gap: 5, fontSize: 11.5 }} title="Bridge settings">
          <Ico name="settings" size={13} />
          Setup
        </button>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line-1)', paddingBottom: 8 }}>
        {SUBTABS.map(s => (
          <button
            key={s.key}
            onClick={() => setTab(s.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 'var(--r-sm)',
              border: '1px solid transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
              background: tab === s.key ? 'var(--bg-3)' : 'transparent',
              color: tab === s.key ? 'var(--ink-0)' : 'var(--ink-3)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
            }}
          >
            <Ico name={s.icon} size={13} />
            {s.label}
            {s.key === 'traffic' && newTraffic.length > 0 && (
              <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', background: '#5B9BD5', color: '#fff', borderRadius: 100, padding: '0 6px', lineHeight: '14px' }}>
                {newTraffic.length}
              </span>
            )}
            {s.key === 'checklist' && stats && stats.checklist.untested > 0 && (
              <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', background: 'var(--sev-high-bg)', color: 'var(--sev-high)', borderRadius: 100, padding: '0 6px', lineHeight: '14px' }}>
                {stats.checklist.untested}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'traffic' && (
        <TrafficList
          projectId={projectId}
          newTraffic={newTraffic}
          onAckNew={() => setNewTraffic([])}
          onStatsChange={loadStats}
        />
      )}
      {tab === 'websocket' && <WebSocketsView projectId={projectId} />}
      {tab === 'endpoints' && <EndpointTable projectId={projectId} />}
      {tab === 'checklist' && (
        <ChecklistView
          projectId={projectId}
          projectName={projectName}
          onStatsChange={loadStats}
        />
      )}
      {tab === 'coverage' && <CoverageView projectId={projectId} />}
      {tab === 'secrets' && <SecretsView projectId={projectId} />}
      {tab === 'settings' && <BurpSettings projectId={projectId} onStatsChange={loadStats} />}

      {/* Setup modal (open from the header) */}
      {settingsOpen && <BurpSettings projectId={projectId} onStatsChange={loadStats} onClose={() => setSettingsOpen(false)} />}

      <style>{`@keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
    </div>
  );
}
