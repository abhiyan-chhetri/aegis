'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Avatar } from '@/components/chrome/icons';

interface User {
  id: string;
  name: string;
  initials?: string;
}

interface Comment {
  id: string;
  content: string;
  mentions: string; // JSON array of mentioned user IDs
  createdAt: string;
  user: { id: string; name: string; initials?: string };
}

interface FindingCommentsProps {
  findingId: string;
}

export function FindingComments({ findingId }: FindingCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mentions, setMentions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/findings/${findingId}/comments`).then(r => r.json()),
      fetch('/api/users').then(r => r.json()),
    ])
      .then(([commentsData, usersData]) => {
        setComments(commentsData.comments ?? []);
        setAllUsers(usersData.users ?? []);
      })
      .catch(() => setError('Could not load data'))
      .finally(() => setLoading(false));
  }, [findingId]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    // Check for @ mentions
    const atIndex = value.lastIndexOf('@');
    if (atIndex !== -1) {
      const afterAt = value.substring(atIndex + 1);
      // Check if we're still in the middle of typing a mention (no space after @)
      if (!afterAt.includes(' ')) {
        setMentionQuery(afterAt);
        const filtered = allUsers.filter(u =>
          u.name.toLowerCase().includes(afterAt.toLowerCase())
        );
        setSuggestions(filtered);
        setShowSuggestions(true);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const selectMention = (user: User) => {
    const atIndex = text.lastIndexOf('@');
    const beforeAt = text.substring(0, atIndex);
    const newText = `${beforeAt}@${user.name} `;
    setText(newText);
    setShowSuggestions(false);

    if (!mentions.includes(user.id)) {
      setMentions(prev => [...prev, user.id]);
    }

    textareaRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/findings/${findingId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text.trim(),
          mentions: mentions.length > 0 ? mentions : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to submit comment');
      }
      const { comment } = await res.json();
      setComments(prev => [...prev, comment]);
      setText('');
      setMentions([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit comment');
    } finally {
      setSubmitting(false);
    }
  };

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const renderMentions = (mentionsJSON: string) => {
    try {
      const mentionIds = JSON.parse(mentionsJSON) as string[];
      if (mentionIds.length === 0) return null;
      const mentionedNames = mentionIds
        .map(id => allUsers.find(u => u.id === id)?.name)
        .filter(Boolean);
      if (mentionedNames.length === 0) return null;
      return (
        <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>
          @{mentionedNames.join(', @')}
        </div>
      );
    } catch {
      return null;
    }
  };

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        Comments{comments.length > 0 ? ` · ${comments.length}` : ''}
      </div>

      {/* Comment list */}
      {!loading && comments.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12, lineHeight: 1.5 }}>
          No comments yet. Start the conversation.
        </p>
      )}

      {loading && (
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 12 }}>Loading…</p>
      )}

      {comments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {comments.map(c => (
            <div key={c.id} style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
            }}>
              <Avatar name={c.user.name} id={c.user.initials} size={22} />
              <div style={{
                flex: 1,
                background: 'var(--bg-2)',
                border: '1px solid var(--line-1)',
                borderRadius: 'var(--r-sm)',
                padding: '7px 10px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-1)' }}>{c.user.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                    {relativeTime(c.createdAt)}
                  </span>
                </div>
                {renderMentions(c.mentions)}
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-1)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {c.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit}>
        <div style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e as any);
            }}
            placeholder="Add a comment… (type @ to mention someone, ⌘Enter to send)"
            rows={3}
            style={{
              display: 'block',
              width: '100%',
              resize: 'none',
              padding: '8px 10px',
              background: 'var(--bg-0)',
              border: '1px solid var(--line-2)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--ink-1)',
              fontSize: 12.5,
              fontFamily: 'inherit',
              lineHeight: 1.55,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 6,
            }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0,
              background: 'var(--bg-1)',
              border: '1px solid var(--line-2)',
              borderRadius: 'var(--r-sm)',
              marginBottom: 4,
              maxHeight: 200,
              overflowY: 'auto',
              zIndex: 10,
            }}>
              {suggestions.map(user => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => selectMention(user)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '6px 10px',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: 'var(--ink-1)',
                    fontSize: 12,
                    borderBottom: '1px solid var(--line-1)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }}
                >
                  <Avatar name={user.name} id={user.initials} size={18} />
                  <span>{user.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {error && (
          <div style={{
            fontSize: 11.5, color: 'var(--sev-critical)',
            background: 'rgba(255,92,58,0.08)',
            border: '1px solid rgba(255,92,58,0.2)',
            borderRadius: 'var(--r-sm)',
            padding: '5px 8px',
            marginBottom: 6,
          }}>
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={!text.trim() || submitting}
          className="btn btn-sm btn-primary"
          style={{ width: '100%', justifyContent: 'center', opacity: !text.trim() ? 0.5 : 1 }}
        >
          {submitting ? 'Posting…' : 'Post comment'}
        </button>
      </form>
    </div>
  );
}
