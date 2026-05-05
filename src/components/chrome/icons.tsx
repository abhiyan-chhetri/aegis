'use client';

import React from 'react';

type IconProps = {
  d: string;
  size?: number;
  strokeWidth?: number;
  fill?: string;
  style?: React.CSSProperties;
  className?: string;
};

export function Icon({ d, size = 16, strokeWidth = 1.6, fill = 'none', style, className }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={fill} stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      className={className}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

export const ICONS: Record<string, string> = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  projects:  '<path d="M3 7.5 12 3l9 4.5v9L12 21 3 16.5v-9Z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  findings:  '<path d="M12 2 3 7v6c0 4.5 3.8 8.3 9 9 5.2-.7 9-4.5 9-9V7l-9-5Z"/><path d="m9 12 2 2 4-4"/>',
  library:   '<path d="M4 4h5v16H4zM15 4h5v16h-5zM10 7h4v13h-4z"/>',
  team:      '<circle cx="9" cy="9" r="3.2"/><circle cx="17" cy="10" r="2.5"/><path d="M3 19c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5"/><path d="M15 18.5c.5-1.8 2-2.8 4-2.8 1 0 1.8.3 2.5.8"/>',
  reports:   '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M9 13h7M9 17h7M9 9h3"/>',
  templates: '<rect x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="11" width="10" height="10" rx="1"/><rect x="15" y="11" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/>',
  settings:  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  search:    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  bell:      '<path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 8H4c0-2 2-3 2-8Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  plus:      '<path d="M12 5v14M5 12h14"/>',
  chevRight: '<path d="m9 6 6 6-6 6"/>',
  chevDown:  '<path d="m6 9 6 6 6-6"/>',
  chevLeft:  '<path d="m15 6-6 6 6 6"/>',
  arrow:     '<path d="M5 12h14M13 6l6 6-6 6"/>',
  more:      '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  filter:    '<path d="M3 5h18l-7 9v5l-4 2v-7L3 5Z"/>',
  sort:      '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
  eye:       '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  download:  '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  check:     '<path d="m5 13 4 4 10-10"/>',
  cmd:       '<path d="M9 9V5.5A2.5 2.5 0 1 0 6.5 8H9m6 1V5.5A2.5 2.5 0 1 1 17.5 8H15m0 7v3.5A2.5 2.5 0 1 0 17.5 16H15m-6-1v3.5A2.5 2.5 0 1 1 6.5 16H9M9 9h6v6H9z"/>',
  pen:       '<path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20H4v-4L16.5 3.5Z"/>',
  trash:     '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14"/>',
  user:      '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  clock:     '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link:      '<path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1L11 5"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1L13 19"/>',
  shield:    '<path d="M12 2 3 6v6c0 5 4 9 9 10 5-1 9-5 9-10V6l-9-4Z"/>',
  code:      '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>',
  target:    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  paper:     '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4"/>',
  image:     '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
  send:      '<path d="M3 11 22 2l-9 19-2-8-8-2Z"/>',
  branch:    '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M6 12h6a4 4 0 0 0 4-4v-.5"/>',
  x:         '<path d="M6 6l12 12M18 6 6 18"/>',
  moon:      '<path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/>',
  bold:      '<path d="M7 4h7a4 4 0 0 1 0 8H7zM7 12h8a4 4 0 0 1 0 8H7z"/>',
  italic:    '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
  heading:   '<path d="M6 4v16M18 4v16M6 12h12"/>',
  list:      '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  quote:     '<path d="M7 7h4v6a4 4 0 0 1-4 4M14 7h4v6a4 4 0 0 1-4 4"/>',
  codeblock: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m9 10-2 2 2 2M15 10l2 2-2 2"/>',
  calendar:  '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  flag:      '<path d="M4 21V4h13l-2 4 2 4H4"/>',
  circle:    '<circle cx="12" cy="12" r="9"/>',
  tag:       '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  palette:   '<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 6 18c-1.5 1-3 1.5-4.5 1.5-1.5-.5-2.5-1.5-2.5-3 0-2 1-3 2-4l2-1.5c2-1.5 3-3 1-5.5-2-2.5-4-3-4-3"/>',
  note:      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><polyline points="14,2 14,8 20,8"/>',
  logout:    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  chart:     '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  alert:     '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  info:      '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  copy:      '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  grid:      '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  list2:     '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  save:      '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  folder:    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  sparkles:  '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>',
  zap:       '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
};

type IcoProps = {
  name: string;
  size?: number;
  strokeWidth?: number;
  fill?: string;
  style?: React.CSSProperties;
  className?: string;
};

export function Ico({ name, size, strokeWidth, fill, style, className }: IcoProps) {
  return (
    <Icon
      d={ICONS[name] || ICONS.circle}
      size={size}
      strokeWidth={strokeWidth}
      fill={fill}
      style={style}
      className={className}
    />
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M20 3 L34 9 V21 C34 29 28 35 20 37 C12 35 6 29 6 21 V9 L20 3 Z"
            stroke="currentColor" strokeWidth="1.6" />
      <path d="M20 12 L27 15.5 V22 C27 26 24 29 20 30 C16 29 13 26 13 22 V15.5 L20 12 Z"
            fill="currentColor" opacity="0.9" />
      <path d="M20 3 L20 37" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
    </svg>
  );
}

export function Avatar({ id, name, size = 26 }: { id?: string; name?: string; size?: number }) {
  const initials = id || (name ? name.split(' ').map(n => n[0]).join('').slice(0, 2) : '??');
  const hue = [...initials].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `oklch(0.28 0.02 ${hue})`,
      border: '1px solid var(--line-2)',
      color: 'var(--ink-0)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontFamily: 'var(--font-mono)', fontWeight: 500,
      letterSpacing: '0.02em', flexShrink: 0,
    }}>
      {initials.slice(0, 2)}
    </div>
  );
}
