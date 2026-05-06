'use client';

import { useEffect } from 'react';

export function ThemeLoader() {
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('aegis-settings') || '{}');
      const r = document.documentElement;
      if (s.accent) {
        r.style.setProperty('--accent', s.accent);
      }
      if (s.density) {
        const d: Record<string, Record<string, string>> = {
          compact: { '--row-pad': '10px', '--card-pad': '16px' },
          comfortable: { '--row-pad': '14px', '--card-pad': '22px' },
          spacious: { '--row-pad': '18px', '--card-pad': '28px' },
        };
        const dd = d[s.density];
        if (dd) {
          Object.entries(dd).forEach(([key, value]) => {
            r.style.setProperty(key, value);
          });
        }
      }
      if (s.serifDisplay === false) {
        r.style.setProperty('--font-serif', "'Geist', sans-serif");
      }
    } catch (e) {
      // Silently ignore errors
    }
  }, []);

  return null;
}
