'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Ico, Avatar } from '@/components/chrome/icons';

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string;
  initials: string;
};

const TEAMS = ['Offensive', 'Cloud', 'AppSec', 'Auth', 'Infra', 'Reporting'];

function generatePassword(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

// ── Member slide-over ──────────────────────────────────────────────────────────
function MemberSlideOver({ member, load, findings, onClose }: {
  member: Member;
  load: number;
  findings: number;
  onClose: () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 40 }} />
      <div className="thin-scroll" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
        background: 'var(--bg-1)', borderLeft: '1px solid var(--line-2)',
        boxShadow: 'var(--shadow-lg)', zIndex: 50,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid var(--line-1)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Avatar id={member.initials} size={52} />
            <div style={{ flex: 1 }}>
              <div className="serif" style={{ fontSize: 20, color: 'var(--ink-0)', lineHeight: 1.2 }}>{member.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                {member.initials} · {member.team}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 6 }}>{member.role}</div>
            </div>
            <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: 28, padding: 0 }}>
              <Ico name="x" size={14} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ padding: '16px 18px' }}>
              <div className="eyebrow" style={{ fontSize: 9, marginBottom: 8 }}>Active projects</div>
              <div className="serif" style={{ fontSize: 32, color: 'var(--ink-0)', lineHeight: 1 }}>{load}</div>
              <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < load ? 'var(--ink-0)' : 'var(--bg-4)' }} />
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: '16px 18px' }}>
              <div className="eyebrow" style={{ fontSize: 9, marginBottom: 8 }}>Findings assigned</div>
              <div className="serif" style={{ fontSize: 32, color: 'var(--ink-0)', lineHeight: 1 }}>{findings}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>open vulnerabilities</div>
            </div>
          </div>

          <div className="card" style={{ padding: '16px 18px' }}>
            <div className="eyebrow" style={{ fontSize: 9, marginBottom: 14 }}>Contact</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Ico name="send" size={14} style={{ color: 'var(--ink-3)' }} />
              <span style={{ fontSize: 13, color: 'var(--ink-1)' }}>{member.email}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--line-1)', flexShrink: 0 }}>
          <a
            href={`mailto:${member.email}`}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}
          >
            <Ico name="send" size={14} />
            Send email
          </a>
        </div>
      </div>
    </>
  );
}

// ── Create user modal ──────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [team, setTeam] = useState('Offensive');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setError('');
    setSubmitting(true);

    const password = generatePassword();
    const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, team, password, initials }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create user');
        setSubmitting(false);
        return;
      }
      setGeneratedPassword(password);
      setSubmitting(false);
      onCreated();
    } catch {
      setError('Network error');
      setSubmitting(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 460, background: 'var(--bg-1)', borderRadius: 'var(--r-lg)',
        border: '1px solid var(--line-2)', boxShadow: 'var(--shadow-lg)',
        zIndex: 50, padding: 32,
      }}>
        {generatedPassword ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(143,201,122,0.12)', border: '1px solid rgba(143,201,122,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ico name="check" size={18} style={{ color: 'var(--status-resolved)' }} />
              </div>
              <div>
                <div className="serif" style={{ fontSize: 18, color: 'var(--ink-0)' }}>User created</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Share the generated password with the user</div>
              </div>
            </div>
            <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '14px 18px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>Generated password</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--ink-0)', letterSpacing: '0.08em', userSelect: 'all' }}>{generatedPassword}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20, lineHeight: 1.6 }}>
              This password will not be shown again. Make sure to copy it and share it securely with the new user.
            </div>
            <button className="btn btn-primary" onClick={onClose} style={{ width: '100%', justifyContent: 'center' }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <div className="serif" style={{ fontSize: 20, color: 'var(--ink-0)', marginBottom: 6 }}>Create team member</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Add a new user to the Aegis workspace.</div>
            </div>
            {error && (
              <div style={{ padding: '10px 14px', background: 'var(--sev-critical-bg)', border: '1px solid rgba(255,92,58,0.25)', borderRadius: 'var(--r-sm)', color: 'var(--sev-critical)', fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Full name <span style={{ color: 'var(--sev-critical)' }}>*</span></label>
                <input className="input" style={{ width: '100%' }} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alex Kim" required />
              </div>
              <div className="form-group">
                <label className="form-label">Email address <span style={{ color: 'var(--sev-critical)' }}>*</span></label>
                <input className="input" type="email" style={{ width: '100%' }} value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. alex@company.com" required />
              </div>
              <div className="form-group">
                <label className="form-label">Role / Title</label>
                <input className="input" style={{ width: '100%' }} value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Senior Pentester" />
              </div>
              <div className="form-group">
                <label className="form-label">Team</label>
                <select className="input" style={{ width: '100%' }} value={team} onChange={e => setTeam(e.target.value)}>
                  {TEAMS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ flex: 1, justifyContent: 'center' }}>
                  <Ico name="plus" size={14} />
                  {submitting ? 'Creating…' : 'Create user'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              </div>
            </form>
          </>
        )}
      </div>
    </>
  );
}

// ── Edit user modal ────────────────────────────────────────────────────────────
function EditUserModal({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role);
  const [team, setTeam] = useState(member.team || 'Offensive');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, team }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update user');
        setSubmitting(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Network error');
      setSubmitting(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 420, background: 'var(--bg-1)', borderRadius: 'var(--r-lg)',
        border: '1px solid var(--line-2)', boxShadow: 'var(--shadow-lg)',
        zIndex: 50, padding: 32,
      }}>
        <div style={{ marginBottom: 24 }}>
          <div className="serif" style={{ fontSize: 20, color: 'var(--ink-0)', marginBottom: 6 }}>Edit member</div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Update profile for {member.name}</div>
        </div>
        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--sev-critical-bg)', border: '1px solid rgba(255,92,58,0.25)', borderRadius: 'var(--r-sm)', color: 'var(--sev-critical)', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Full name <span style={{ color: 'var(--sev-critical)' }}>*</span></label>
            <input className="input" style={{ width: '100%' }} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Role / Title</label>
            <input className="input" style={{ width: '100%' }} value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Senior Pentester" />
          </div>
          <div className="form-group">
            <label className="form-label">Team</label>
            <select className="input" style={{ width: '100%' }} value={team} onChange={e => setTeam(e.target.value)}>
              {TEAMS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ flex: 1, justifyContent: 'center' }}>
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function TeamClient({ loadByUser, findingsByUser }: {
  loadByUser: Record<string, number>;
  findingsByUser: Record<string, number>;
}) {
  const [users, setUsers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function handleDelete(m: Member) {
    if (!window.confirm(`Delete ${m.name}? This cannot be undone.`)) return;
    setDeleteError('');
    try {
      const res = await fetch(`/api/users/${m.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400 && data.error?.includes('own account')) {
          setDeleteError('You cannot delete your own account.');
        } else {
          setDeleteError(data.error || 'Failed to delete user');
        }
        return;
      }
      fetchUsers();
    } catch {
      setDeleteError('Network error');
    }
  }

  return (
    <>
      <div className="thin-scroll" style={{ flex: 1, overflowY: 'auto', padding: 28, background: 'var(--bg-0)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20, gap: 12 }}>
          {deleteError && (
            <div style={{ fontSize: 12, color: 'var(--sev-critical)', flex: 1 }}>{deleteError}</div>
          )}
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Ico name="plus" size={14} /> Add member
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {users.map(m => {
            const load = loadByUser[m.id] || 0;
            const findingsCount = findingsByUser[m.id] || 0;
            return (
              <div
                key={m.id}
                className="card card-hover"
                style={{ padding: 20, cursor: 'pointer' }}
                onClick={() => setSelectedMember(m)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar id={m.initials || m.name.split(' ').map((n: string) => n[0]).join('')} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="serif" style={{ fontSize: 17, color: 'var(--ink-0)', lineHeight: 1.2 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      {m.initials} · {m.team}
                    </div>
                  </div>
                  {/* Edit + Delete buttons */}
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ width: 26, padding: 0 }}
                      title="Edit"
                      onClick={() => setEditMember(m)}
                    >
                      <Ico name="pen" size={13} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ width: 26, padding: 0, color: 'var(--sev-critical)' }}
                      title="Delete"
                      onClick={() => handleDelete(m)}
                    >
                      <Ico name="x" size={13} />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-1)', marginTop: 14 }}>{m.role}</div>
                <hr className="hr" style={{ margin: '14px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="eyebrow" style={{ fontSize: 9 }}>Active projects</div>
                    <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} style={{ width: 16, height: 5, borderRadius: 2, background: i < load ? 'var(--ink-0)' : 'var(--bg-4)' }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{load} lead</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="eyebrow" style={{ fontSize: 9 }}>Findings assigned</div>
                    <div className="serif" style={{ fontSize: 28, color: 'var(--ink-0)', marginTop: 4, lineHeight: 1 }}>{findingsCount}</div>
                  </div>
                </div>
                <hr className="hr" style={{ margin: '14px 0' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.email}
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); window.location.href = `mailto:${m.email}`; }}
                  >
                    <Ico name="send" size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedMember && !editMember && (
        <MemberSlideOver
          member={selectedMember}
          load={loadByUser[selectedMember.id] || 0}
          findings={findingsByUser[selectedMember.id] || 0}
          onClose={() => setSelectedMember(null)}
        />
      )}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={fetchUsers}
        />
      )}
      {editMember && (
        <EditUserModal
          member={editMember}
          onClose={() => setEditMember(null)}
          onSaved={fetchUsers}
        />
      )}
    </>
  );
}
