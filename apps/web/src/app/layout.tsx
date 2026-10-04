import type { Metadata } from 'next';

import '@/styles/globals.css';
import { QueryProvider } from '@/lib/query-client';

const themeInitScript = `
  try {
    var saved = localStorage.getItem('campusforge-theme');
    var theme = saved === 'dark' || saved === 'light'
      ? saved
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch (_) {}
`;

export const metadata: Metadata = {
  title: {
    default: 'CampusForge',
    template: '%s | CampusForge',
  },
  description:
    'AI-powered operating system for students and academic teams. Manage deadlines, collaborate, study smarter.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
