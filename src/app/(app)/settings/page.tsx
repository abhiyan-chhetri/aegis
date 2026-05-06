'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Topbar } from '@/components/chrome/Topbar';
import { Ico } from '@/components/chrome/icons';

const ACCENTS = [
  { color: '#f4f1ea', label: 'Bone (editorial)' },
  { color: '#ff7a45', label: 'Clay orange' },
  { color: '#c9a8f5', label: 'Iris lilac' },
  { color: '#f5a524', label: 'Amber' },
  { color: '#8fc97a', label: 'Moss' },
  { color: '#7fb3d5', label: 'Sky blue' },
];

const SEV_PALETTES: Record<string, Record<string, string>> = {
  editorial: { '--sev-critical': '#ff5c3a', '--sev-high': '#f5a524', '--sev-medium': '#e8d56b', '--sev-low': '#7fb3d5', '--sev-info': '#9a968c' },
  clinical:  { '--sev-critical': '#e03434', '--sev-high': '#e98534', '--sev-medium': '#d9b63a', '--sev-low': '#5892c3', '--sev-info': '#8a8a8a' },
  neon:      { '--sev-critical': '#ff2b5e', '--sev-high': '#ffb13a', '--sev-medium': '#f7e54b', '--sev-low': '#6fd0ff', '--sev-info': '#a09aa8' },
  muted:     { '--sev-critical': '#c65d4c', '--sev-high': '#c9953f', '--sev-medium': '#b5a75f', '--sev-low': '#7ea1b3', '--sev-info': '#8a867c' },
};

const PAPER_TONES: Record<string, Record<string, string>> = {
  cream:  { '--paper': '#faf7f0', '--paper-ink': '#1a1a1a', '--paper-rule': '#e5e0d5' },
  white:  { '--paper': '#ffffff', '--paper-ink': '#0f0f0f', '--paper-rule': '#e5e5e5' },
  stone:  { '--paper': '#f1ece0', '--paper-ink': '#20201c', '--paper-rule': '#d8d2c2' },
  carbon: { '--paper': '#1a1a1a', '--paper-ink': '#f4f1ea', '--paper-rule': '#333333' },
};

const DENSITIES: Record<string, Record<string, string>> = {
  compact:     { '--row-pad': '10px', '--card-pad': '16px' },
  comfortable: { '--row-pad': '14px', '--card-pad': '22px' },
  spacious:    { '--row-pad': '18px', '--card-pad': '28px' },
};

const DEFAULT_ENGAGEMENT_TYPES = [
  'Web Application', 'Network', 'Mobile', 'Cloud', 'Red Team',
  'Social Engineering', 'Physical', 'API', 'Internal',
];

type AppearanceSettings = {
  accent: string;
  sevPalette: string;
  paperTone: string;
  density: string;
  serifDisplay: boolean;
};

function applySettings(s: AppearanceSettings) {
  const r = document.documentElement;
  r.style.setProperty('--accent', s.accent);
  const lum = parseInt(s.accent.replace('#', ''), 16);
  const R = (lum >> 16) & 255, G = (lum >> 8) & 255, B = lum & 255;
  r.style.setProperty('--accent-ink', (R * 299 + G * 587 + B * 114) / 1000 > 180 ? '#0a0b0d' : '#f4f1ea');

  const pal = SEV_PALETTES[s.sevPalette] || SEV_PALETTES.editorial;
  for (const [k, v] of Object.entries(pal)) {
    r.style.setProperty(k, v);
    const hx = parseInt(v.replace('#', ''), 16);
    const rr = (hx >> 16) & 255, gg = (hx >> 8) & 255, bb = hx & 255;
    r.style.setProperty(`${k}-bg`, `rgba(${rr},${gg},${bb},0.12)`);
  }

  const paper = PAPER_TONES[s.paperTone] || PAPER_TONES.cream;
  for (const [k, v] of Object.entries(paper)) r.style.setProperty(k, v);

  const density = DENSITIES[s.density] || DENSITIES.comfortable;
  for (const [k, v] of Object.entries(density)) r.style.setProperty(k, v);

  r.style.setProperty('--font-serif', s.serifDisplay
    ? "'Fraunces', 'Tiempos Headline', Georgia, serif"
    : "'Geist', var(--font-geist-sans), sans-serif");
}

type Tab = 'Appearance' | 'Account' | 'Categories' | 'Integrations' | 'Branding' | 'AI';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div className="eyebrow" style={{ fontSize: 9, marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function SegControl({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} className="btn" style={{
          background: value === opt ? 'var(--ink-0)' : 'var(--bg-2)',
          color: value === opt ? 'var(--bg-0)' : 'var(--ink-1)',
          borderColor: value === opt ? 'var(--ink-0)' : 'var(--line-2)',
          textTransform: 'capitalize',
        }}>
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── Appearance Tab ─────────────────────────────────────────────────────────────
function AppearanceTab() {
  const [settings, setSettings] = useState<AppearanceSettings>({
    accent: '#f4f1ea', sevPalette: 'editorial', paperTone: 'cream', density: 'comfortable', serifDisplay: true,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('aegis-settings');
      if (stored) { const s = JSON.parse(stored) as AppearanceSettings; setSettings(s); applySettings(s); }
    } catch { /* ignore */ }
  }, []);

  function update<K extends keyof AppearanceSettings>(key: K, value: AppearanceSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    applySettings(next);
    setSaved(false);
  }

  function save() {
    localStorage.setItem('aegis-settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={save}>
          {saved ? '✓ Saved' : 'Save settings'}
        </button>
      </div>

      <Section title="Accent colour">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {ACCENTS.map(({ color, label }) => (
              <button key={color} onClick={() => update('accent', color)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
                background: settings.accent === color ? 'var(--bg-3)' : 'var(--bg-2)',
                border: `1px solid ${settings.accent === color ? 'var(--line-3)' : 'var(--line-1)'}`,
                borderRadius: 'var(--r-sm)', cursor: 'pointer', minWidth: 160,
              }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, background: color, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)', flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: 'var(--ink-1)' }}>{label}</span>
                {settings.accent === color && <span style={{ marginLeft: 'auto', color: 'var(--ink-2)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Density">
        <div className="card" style={{ padding: 20 }}>
          <SegControl options={['compact', 'comfortable', 'spacious']} value={settings.density} onChange={v => update('density', v)} />
        </div>
      </Section>

      <Section title="Severity palette">
        <div className="card" style={{ padding: 20 }}>
          <SegControl options={['editorial', 'clinical', 'neon', 'muted']} value={settings.sevPalette} onChange={v => update('sevPalette', v)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {['critical', 'high', 'medium', 'low', 'info'].map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: `var(--sev-${s})` }} />
                <span style={{ color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase' }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Report paper tone">
        <div className="card" style={{ padding: 20 }}>
          <SegControl options={['cream', 'white', 'stone', 'carbon']} value={settings.paperTone} onChange={v => update('paperTone', v)} />
        </div>
      </Section>

      <Section title="Typography">
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13.5, color: 'var(--ink-0)', fontWeight: 500 }}>Serif display type</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                Use Fraunces for headers and large numerals
              </div>
            </div>
            <button
              onClick={() => update('serifDisplay', !settings.serifDisplay)}
              style={{
                width: 42, height: 22, borderRadius: 100, cursor: 'pointer',
                background: settings.serifDisplay ? 'var(--accent)' : 'var(--bg-4)',
                border: 'none', position: 'relative', flexShrink: 0, transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff',
                left: settings.serifDisplay ? 22 : 2, transition: 'left 0.2s',
              }} />
            </button>
          </div>
          <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-2)', borderRadius: 'var(--r-sm)' }}>
            <div className="serif" style={{ fontSize: 22, color: 'var(--ink-0)', marginBottom: 4 }}>Authentication bypass via malformed JWT</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--font-sans)' }}>Critical · CVSS 9.1 · CWE-287</div>
          </div>
        </div>
      </Section>

      <Section title="Danger zone">
        <div className="card" style={{ padding: 20, border: '1px solid rgba(255,92,58,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13.5, color: 'var(--sev-critical)', fontWeight: 500 }}>Reset workspace settings</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Restore all appearance settings to defaults</div>
            </div>
            <button className="btn" style={{ borderColor: 'rgba(255,92,58,0.3)', color: 'var(--sev-critical)' }}
                    onClick={() => {
                      localStorage.removeItem('aegis-settings');
                      window.location.reload();
                    }}>
              Reset
            </button>
          </div>
        </div>
      </Section>
    </>
  );
}

// ── Account Tab ────────────────────────────────────────────────────────────────
function AccountTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user?.id) setUserId(d.user.id);
    }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPassword) { setMessage('New password is required'); setStatus('error'); return; }
    if (newPassword !== confirmPassword) { setMessage('Passwords do not match'); setStatus('error'); return; }
    if (!userId) { setMessage('Unable to determine current user'); setStatus('error'); return; }

    setStatus('saving');
    setMessage('');
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Failed to update password');
      } else {
        setStatus('success');
        setMessage('Password updated successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch {
      setStatus('error');
      setMessage('Network error');
    }
  }

  return (
    <Section title="Password">
      <div className="card" style={{ padding: 24, maxWidth: 480 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-0)', marginBottom: 4 }}>Change password</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20 }}>Update your login password.</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Current password</label>
            <input
              type="password"
              className="input"
              style={{ width: '100%' }}
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">New password</label>
            <input
              type="password"
              className="input"
              style={{ width: '100%' }}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm new password</label>
            <input
              type="password"
              className="input"
              style={{ width: '100%' }}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {message && (
            <div style={{
              padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13,
              background: status === 'success' ? 'rgba(143,201,122,0.1)' : 'var(--sev-critical-bg)',
              border: `1px solid ${status === 'success' ? 'rgba(143,201,122,0.3)' : 'rgba(255,92,58,0.25)'}`,
              color: status === 'success' ? 'var(--status-resolved)' : 'var(--sev-critical)',
            }}>
              {message}
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={status === 'saving'} style={{ alignSelf: 'flex-start' }}>
            {status === 'saving' ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </Section>
  );
}

// ── Categories Tab ─────────────────────────────────────────────────────────────
function CategoriesTab() {
  const [types, setTypes] = useState<string[]>(DEFAULT_ENGAGEMENT_TYPES);
  const [newType, setNewType] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      const rawSetting = d.settings?.engagementTypes;
      const raw = typeof rawSetting === 'string' ? rawSetting : rawSetting?.value;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) setTypes(parsed);
        } catch { /* use defaults */ }
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function persist(next: string[]) {
    setSaveStatus('saving');
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engagementTypes: JSON.stringify(next) }),
      });
      setSaveStatus('saved');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  }

  function removeType(t: string) {
    const next = types.filter(x => x !== t);
    setTypes(next);
    persist(next);
  }

  function addType() {
    const trimmed = newType.trim();
    if (!trimmed || types.includes(trimmed)) return;
    const next = [...types, trimmed];
    setTypes(next);
    setNewType('');
    persist(next);
  }

  if (!loaded) {
    return <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;
  }

  return (
    <Section title="Engagement types">
      <div className="card" style={{ padding: 20, maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-0)' }}>Engagement Type options</div>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: saveStatus === 'saved' ? 'var(--status-resolved)' : saveStatus === 'saving' ? 'var(--ink-3)' : 'transparent' }}>
            {saveStatus === 'saving' ? 'saving…' : saveStatus === 'saved' ? '✓ saved' : '·'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>
          These appear in the &ldquo;Engagement Type&rdquo; dropdown when creating or editing a project.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {types.map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 'var(--r-sm)' }}>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-1)' }}>{t}</span>
              <button
                onClick={() => removeType(t)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', padding: 2 }}
                title="Remove"
              >
                <Ico name="x" size={13} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="Add engagement type…"
            value={newType}
            onChange={e => setNewType(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addType())}
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={addType} disabled={!newType.trim()}>
            <Ico name="plus" size={13} /> Add
          </button>
        </div>
      </div>
    </Section>
  );
}

// ── Integrations Tab ───────────────────────────────────────────────────────────
function IntegrationsTab() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      if (d.settings?.teamsWebhookUrl) {
        const setting = d.settings.teamsWebhookUrl;
        const value = typeof setting === 'string' ? setting : setting.value;
        setWebhookUrl(value || '');
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function saveWebhook() {
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamsWebhookUrl: webhookUrl }),
      });
      setSaveStatus(res.ok ? 'saved' : 'error');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
    }
  }

  async function sendTest() {
    if (!webhookUrl.trim()) return;
    setTestStatus('sending');
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '✅ Aegis webhook connection successful!' }),
      });
      setTestStatus(res.ok ? 'success' : 'error');
      setTimeout(() => setTestStatus('idle'), 3000);
    } catch {
      setTestStatus('error');
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  }

  if (!loaded) {
    return <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;
  }

  return (
    <Section title="Microsoft Teams">
      <div className="card" style={{ padding: 24, maxWidth: 600 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-0)', marginBottom: 4 }}>Teams Webhook URL</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16, lineHeight: 1.6 }}>
          Sends notifications to Teams when reports are submitted for review, approved, or rejected, and when new findings are added.
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Incoming webhook URL</label>
          <input
            className="input"
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
            placeholder="https://outlook.office.com/webhook/..."
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={saveWebhook} disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Error' : 'Save'}
          </button>
          <button
            className="btn btn-ghost"
            onClick={sendTest}
            disabled={!webhookUrl.trim() || testStatus === 'sending'}
          >
            {testStatus === 'sending' ? 'Sending…' : testStatus === 'success' ? '✓ Sent' : testStatus === 'error' ? 'Failed' : 'Test'}
          </button>
          {testStatus === 'success' && (
            <span style={{ fontSize: 12, color: 'var(--status-resolved)' }}>Test message sent!</span>
          )}
          {testStatus === 'error' && (
            <span style={{ fontSize: 12, color: 'var(--sev-critical)' }}>Test failed — check the URL</span>
          )}
        </div>
      </div>
    </Section>
  );
}

// ── Branding Tab ──────────────────────────────────────────────────────────────
function BrandingTab() {
  const [logoUrl, setLogoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [slaStatus, setSlaStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loaded, setLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [slaCritical, setSlaCritical] = useState('7');
  const [slaHigh, setSlaHigh] = useState('14');
  const [slaMedium, setSlaMedium] = useState('30');
  const [slaLow, setSlaLow] = useState('60');

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      const logoSetting = d.settings?.logo;
      const slaSetting = d.settings?.slaSettings;
      const logo = typeof logoSetting === 'string' ? logoSetting : logoSetting?.value;
      const slaSettings = typeof slaSetting === 'string' ? slaSetting : slaSetting?.value;
      if (logo) setLogoUrl(logo);
      if (slaSettings) {
        try {
          const sla = JSON.parse(slaSettings);
          if (sla.critical) setSlaCritical(sla.critical.toString());
          if (sla.high) setSlaHigh(sla.high.toString());
          if (sla.medium) setSlaMedium(sla.medium.toString());
          if (sla.low) setSlaLow(sla.low.toString());
        } catch {}
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function saveSlaSettings() {
    setSlaStatus('saving');
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slaSettings: JSON.stringify({
            critical: parseInt(slaCritical) || 7,
            high: parseInt(slaHigh) || 14,
            medium: parseInt(slaMedium) || 30,
            low: parseInt(slaLow) || 60,
          }),
        }),
      });
      if (res.ok) {
        setSlaStatus('saved');
        setTimeout(() => setSlaStatus('idle'), 2000);
      } else {
        setSlaStatus('error');
        setTimeout(() => setSlaStatus('idle'), 2000);
      }
    } catch {
      setSlaStatus('error');
      setTimeout(() => setSlaStatus('idle'), 2000);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo must be smaller than 2 MB');
      return;
    }

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        setSaveStatus('saving');
        const res = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logo: base64 }),
        });
        if (res.ok) {
          setLogoUrl(base64);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        } else {
          setSaveStatus('error');
          setTimeout(() => setSaveStatus('idle'), 2000);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (!loaded) {
    return <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;
  }

  return (
    <>
    <Section title="Organization Logo">
      <div className="card" style={{ padding: 24, maxWidth: 600 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-0)', marginBottom: 4 }}>Logo for Pentest Reports</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16, lineHeight: 1.6 }}>
          Upload a logo that will appear on the front cover and header/footer of all generated pentest reports. Recommended size: 200×200px or larger. Formats: PNG, JPG, SVG.
        </div>

        {/* Preview */}
        <div style={{ marginBottom: 20, padding: 16, background: 'var(--bg-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--line-1)' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</div>
          {logoUrl ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, background: 'var(--bg-0)', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-1)' }}>
              <img src={logoUrl} alt="Logo" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, background: 'var(--bg-0)', borderRadius: 'var(--r-sm)', border: '1px dashed var(--line-1)', color: 'var(--ink-3)', fontSize: 12 }}>
              No logo uploaded
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : 'Upload Logo'}
          </button>
          {logoUrl && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setSaveStatus('saving');
                fetch('/api/settings', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ logo: '' }),
                }).then(res => {
                  if (res.ok) {
                    setLogoUrl('');
                    setSaveStatus('saved');
                    setTimeout(() => setSaveStatus('idle'), 2000);
                  } else {
                    setSaveStatus('error');
                  }
                });
              }}
              disabled={saveStatus === 'saving'}
            >
              Remove
            </button>
          )}
          {saveStatus === 'saved' && (
            <span style={{ fontSize: 12, color: 'var(--status-resolved)', display: 'flex', alignItems: 'center' }}>✓ Saved</span>
          )}
          {saveStatus === 'error' && (
            <span style={{ fontSize: 12, color: 'var(--sev-critical)', display: 'flex', alignItems: 'center' }}>Error</span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    </Section>

    <Section title="Finding Remediation SLAs">
      <div className="card" style={{ padding: 24, maxWidth: 600 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-0)', marginBottom: 4 }}>Remediation Timeline (Days)</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20, lineHeight: 1.6 }}>
          Set the expected remediation timeframe for each severity level. These timelines will appear in pentest reports to guide remediation prioritization.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--sev-critical)' }}>Critical (days)</label>
            <input
              className="input"
              type="number"
              min="1"
              value={slaCritical}
              onChange={e => setSlaCritical(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--sev-high)' }}>High (days)</label>
            <input
              className="input"
              type="number"
              min="1"
              value={slaHigh}
              onChange={e => setSlaHigh(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--sev-medium)' }}>Medium (days)</label>
            <input
              className="input"
              type="number"
              min="1"
              value={slaMedium}
              onChange={e => setSlaMedium(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ color: 'var(--sev-low)' }}>Low (days)</label>
            <input
              className="input"
              type="number"
              min="1"
              value={slaLow}
              onChange={e => setSlaLow(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={saveSlaSettings} disabled={slaStatus === 'saving'}>
            {slaStatus === 'saving' ? 'Saving…' : slaStatus === 'saved' ? '✓ Saved' : slaStatus === 'error' ? 'Error' : 'Save SLA Settings'}
          </button>
          {slaStatus === 'saved' && (
            <span style={{ fontSize: 12, color: 'var(--status-resolved)', display: 'flex', alignItems: 'center' }}>✓ Changes saved</span>
          )}
        </div>
      </div>
    </Section>
    </>
  );
}

// ── AI Tab ─────────────────────────────────────────────────────────────────────
type AIProvider = 'demo' | 'anthropic' | 'openai' | 'bedrock';

const PROVIDER_LABELS: Record<AIProvider, string> = {
  demo: 'Demo Mode (no API key needed)',
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI / Compatible API',
  bedrock: 'AWS Bedrock',
};

const DEFAULT_MODELS: Record<AIProvider, string[]> = {
  demo: [],
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'mistral-large-latest', 'mixtral-8x7b-instruct'],
  bedrock: [
    'anthropic.claude-opus-4-5-20251101-v1:0',
    'anthropic.claude-sonnet-4-5-20251101-v1:0',
    'anthropic.claude-3-5-haiku-20241022-v1:0',
    'meta.llama3-70b-instruct-v1:0',
  ],
};

function AITab() {
  const [provider, setProvider] = useState<AIProvider>('demo');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      const s = d.settings || {};
      const getValue = (key: string) => {
        const val = s[key];
        return typeof val === 'string' ? val : val?.value || '';
      };
      if (s.aiProvider) setProvider(getValue('aiProvider') as AIProvider);
      if (s.aiApiKey) setApiKey(getValue('aiApiKey'));
      if (s.aiBaseUrl) setBaseUrl(getValue('aiBaseUrl'));
      if (s.aiModel) setModel(getValue('aiModel'));
      if (s.aiRegion) setRegion(getValue('aiRegion'));
      if (s.aiAccessKeyId) setAccessKeyId(getValue('aiAccessKeyId'));
      if (s.aiSecretAccessKey) setSecretKey(getValue('aiSecretAccessKey'));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaveStatus('saving');
    try {
      const body: Record<string, string> = {
        aiProvider: provider,
        aiModel: model,
      };
      if (provider === 'anthropic' || provider === 'openai') {
        body.aiApiKey = apiKey;
        body.aiBaseUrl = baseUrl;
      }
      if (provider === 'bedrock') {
        body.aiRegion = region;
        body.aiAccessKeyId = accessKeyId;
        body.aiSecretAccessKey = secretKey;
      }
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setSaveStatus(res.ok ? 'saved' : 'error');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2500);
    }
  }

  async function testConnection() {
    setTestStatus('testing');
    setTestMsg('');
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'finding',
          context: {
            title: 'Connection test — SQL Injection in login form',
            description: 'Test connection to AI provider',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestStatus('error');
        setTestMsg(data.error || 'Request failed');
      } else {
        setTestStatus('success');
        setTestMsg(`Connected successfully via ${data.provider}`);
      }
    } catch (e) {
      setTestStatus('error');
      setTestMsg(e instanceof Error ? e.message : 'Network error');
    }
    setTimeout(() => { setTestStatus('idle'); setTestMsg(''); }, 5000);
  }

  if (!loaded) return <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>;

  return (
    <>
      <Section title="AI Provider">
        <div className="card" style={{ padding: 24, maxWidth: 600 }}>
          {/* Sparkle banner */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(91,155,213,0.1) 0%, rgba(143,201,122,0.1) 100%)',
            border: '1px solid rgba(91,155,213,0.2)', borderRadius: 'var(--r-md)', marginBottom: 24,
          }}>
            <span style={{ fontSize: 20 }}>✨</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-0)' }}>AI-Powered Report Generation</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
                Use <kbd style={{ background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 3, padding: '0 4px', fontSize: 10 }}>⌘⏎</kbd> in the finding editor to generate professional pentest content with AI
              </div>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Provider</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map(p => (
                <label key={p} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: provider === p ? 'var(--bg-2)' : 'var(--bg-0)',
                  border: `1px solid ${provider === p ? 'var(--accent)' : 'var(--line-1)'}`,
                  borderRadius: 'var(--r-sm)', cursor: 'pointer',
                }}>
                  <input type="radio" name="provider" value={p} checked={provider === p}
                    onChange={() => { setProvider(p); setModel(''); }}
                    style={{ accentColor: 'var(--accent)' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-0)' }}>{PROVIDER_LABELS[p]}</div>
                    {p === 'openai' && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>OpenAI, Azure OpenAI, Mistral, Groq, OpenRouter, Ollama, LiteLLM…</div>}
                    {p === 'bedrock' && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>AWS Bedrock with IAM access keys</div>}
                    {p === 'demo' && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Returns realistic mock data — great for testing the UI</div>}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Provider-specific fields */}
          {(provider === 'anthropic' || provider === 'openai') && (
            <>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>API Key</label>
                  <button onClick={() => setShowKeys(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink-3)' }}>
                    {showKeys ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  className="input"
                  style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  type={showKeys ? 'text' : 'password'}
                  placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
              </div>
              {provider === 'openai' && (
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">Base URL</label>
                  <input
                    className="input"
                    style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                    placeholder="https://api.openai.com/v1  (or your custom endpoint)"
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                  />
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                    Leave blank for OpenAI. For Ollama: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>http://localhost:11434/v1</code>
                  </div>
                </div>
              )}
            </>
          )}

          {provider === 'bedrock' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div className="form-group">
                  <label className="form-label">AWS Region</label>
                  <input className="input" style={{ width: '100%' }} placeholder="us-east-1" value={region} onChange={e => setRegion(e.target.value)} />
                </div>
                <div className="form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Credentials</label>
                    <button onClick={() => setShowKeys(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink-3)' }}>{showKeys ? 'Hide' : 'Show'}</button>
                  </div>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Access Key ID</label>
                <input className="input" style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }} type={showKeys ? 'text' : 'password'} placeholder="AKIA…" value={accessKeyId} onChange={e => setAccessKeyId(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Secret Access Key</label>
                <input className="input" style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }} type={showKeys ? 'text' : 'password'} placeholder="••••••••" value={secretKey} onChange={e => setSecretKey(e.target.value)} />
              </div>
            </>
          )}

          {/* Model */}
          {provider !== 'demo' && (
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Model</label>
              {DEFAULT_MODELS[provider].length > 0 ? (
                <>
                  <select className="input" style={{ width: '100%', marginBottom: 6 }} value={model} onChange={e => setModel(e.target.value)}>
                    <option value="">— Select a model —</option>
                    {DEFAULT_MODELS[provider].map(m => <option key={m} value={m}>{m}</option>)}
                    <option value="__custom">Custom model ID…</option>
                  </select>
                  {(model === '__custom' || (model && !DEFAULT_MODELS[provider].includes(model))) && (
                    <input className="input" style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }} placeholder="Enter model ID…" value={model === '__custom' ? '' : model} onChange={e => setModel(e.target.value)} />
                  )}
                </>
              ) : (
                <input className="input" style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }} placeholder="Model ID…" value={model} onChange={e => setModel(e.target.value)} />
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={save} disabled={saveStatus === 'saving'}>
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Error' : 'Save'}
            </button>
            <button className="btn btn-ghost" onClick={testConnection} disabled={testStatus === 'testing'}>
              {testStatus === 'testing' ? 'Testing…' : testStatus === 'success' ? '✓ OK' : testStatus === 'error' ? '✗ Failed' : 'Test connection'}
            </button>
            {testMsg && (
              <span style={{ fontSize: 12, color: testStatus === 'success' ? 'var(--status-resolved)' : 'var(--sev-critical)' }}>
                {testMsg}
              </span>
            )}
          </div>
        </div>
      </Section>

      <Section title="Usage Tips">
        <div className="card" style={{ padding: 20, maxWidth: 600 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { key: '⌘ ↩ in finding editor', desc: 'Generate full finding content from your description notes' },
              { key: '✨ Generate button in report', desc: 'Create executive summary, methodology and attack narrative from all findings' },
              { key: 'Demo mode', desc: 'Uses pre-crafted realistic sample data — no API key required' },
            ].map(({ key, desc }) => (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <kbd style={{ background: 'var(--bg-3)', border: '1px solid var(--line-2)', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', flexShrink: 0, color: 'var(--ink-1)' }}>{key}</kbd>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}

// ── Main settings page ─────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Appearance');

  const TABS: Tab[] = ['Appearance', 'Account', 'Categories', 'Integrations', 'Branding', 'AI'];

  return (
    <>
      <Topbar
        breadcrumb={['Settings']}
        title="Settings"
        subtitle="Workspace preferences and configuration"
      />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Tab bar */}
        <div className="tab-bar">
          {TABS.map(tab => (
            <button
              key={tab}
              className={`tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: 'var(--bg-0)' }}>
          <div style={{ maxWidth: 720 }}>
            {activeTab === 'Appearance' && <AppearanceTab />}
            {activeTab === 'Account' && <AccountTab />}
            {activeTab === 'Categories' && <CategoriesTab />}
            {activeTab === 'Integrations' && <IntegrationsTab />}
            {activeTab === 'Branding' && <BrandingTab />}
            {activeTab === 'AI' && <AITab />}
          </div>
        </div>
      </div>
    </>
  );
}
