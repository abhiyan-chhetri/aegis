'use client';

import Link from 'next/link';
import { Avatar } from '@/components/chrome/icons';

interface Mention {
  id: string;
  content: string;
  mentions: string;
  createdAt: string;
  findingId: string;
  userId: string;
  userName: string;
  projectId: string;
  findingTitle: string;
  projectName: string;
  projectCode: string;
}

interface MentionsListProps {
  mentions: Mention[];
}

export function MentionsList({ mentions }: MentionsListProps) {
  if (mentions.length === 0) {
    return null;
  }

  const handleDone = async (commentId: string) => {
    await fetch('/api/findings/comments/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commentId }),
    });
    // Reload to remove from list
    window.location.reload();
  };

  return (
    <>
      <div style={{ padding: '6px 16px 4px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line-1)' }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>
          💬 You were mentioned ({mentions.length})
        </span>
      </div>
      {mentions.map((m) => (
        <div key={m.id} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 16px',
          borderBottom: '1px solid var(--line-1)',
          background: 'rgba(184,146,58,0.04)',
        }}>
          <Avatar name={m.userName} size={22} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink-0)', fontWeight: 500, marginBottom: 2 }}>
              {m.userName} mentioned you
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-1)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{m.content.substring(0, 60)}..."
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{m.projectCode} · {m.findingTitle}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <Link href={`/projects/${m.projectId}/findings/${m.findingId}`} className="btn btn-sm" style={{ fontSize: 10, background: 'rgba(184,146,58,0.12)', borderColor: 'rgba(184,146,58,0.3)', color: 'var(--accent)' }}>
              View
            </Link>
            <button
              onClick={() => handleDone(m.id)}
              className="btn btn-sm"
              style={{ fontSize: 10, background: 'rgba(118,118,118,0.12)', borderColor: 'rgba(118,118,118,0.3)', color: 'var(--ink-3)', cursor: 'pointer' }}
              title="Mark as done"
            >
              Done
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
