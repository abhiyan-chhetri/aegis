import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeLoader } from '@/components/ThemeLoader';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Aegis — Pentest Report Platform',
  description: 'Internal penetration testing report management platform',
};

// No-flash theme — must run BEFORE React hydrates so a stored "light" theme
// doesn't flash dark on reload. Inlined into <head> below.
const NO_FLASH_THEME =
  `(function(){try{var t=localStorage.getItem('aegis.theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} style={{ height: '100%' }} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,400&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      <body style={{ height: '100%', margin: 0 }}>
        <ThemeLoader />
        {children}
      </body>
    </html>
  );
}
