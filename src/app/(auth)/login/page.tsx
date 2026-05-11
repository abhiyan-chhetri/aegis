'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/chrome/icons';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Login failed');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-0)', padding: 24,
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 400, borderRadius: '0 0 300px 300px',
        background: 'radial-gradient(ellipse, rgba(244,241,234,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 420, animation: 'fadeIn 0.2s ease' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, color: 'var(--ink-0)' }}>
            <Logo size={32} />
            <div style={{ textAlign: 'left' }}>
              <div className="serif" style={{ fontSize: 24, fontWeight: 400, color: 'var(--ink-0)', lineHeight: 1 }}>Aegis</div>
              <div className="eyebrow" style={{ fontSize: 9, marginTop: 4 }}>Pentest Report Platform</div>
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--bg-1)', border: '1px solid var(--line-1)',
          borderRadius: 'var(--r-lg)', overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ padding: '28px 32px 20px', borderBottom: '1px solid var(--line-1)' }}>
            <h1 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 400, color: 'var(--ink-0)' }}>Sign in</h1>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>Internal access only — Aegis workspace</p>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '24px 32px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{
                padding: '10px 14px', background: 'rgba(255,92,58,0.1)', border: '1px solid rgba(255,92,58,0.25)',
                borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--sev-critical)', animation: 'fadeIn 0.15s ease',
              }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="input" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com" required autoComplete="email"
                style={{ width: '100%' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="input" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password"
                style={{ width: '100%' }}
              />
            </div>

            <button
              type="submit" className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', height: 40, fontSize: 14, marginTop: 4, justifyContent: 'center' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: 'var(--ink-4)' }}>
          🛡️ Aegis — Internal Security Operations Platform
        </div>
      </div>
    </div>
  );
}
