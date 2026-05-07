import { type ReactNode } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import BottomNav from './BottomNav';
import OfflineBanner from './OfflineBanner';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const theme = useSettingsStore((s) => s.theme);

  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-white dark:bg-slate-900">
      {/* Offline banner at top */}
      <OfflineBanner />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/80">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
              Imagen
            </h1>
            {/* Desktop nav (hidden on mobile where BottomNav takes over) */}
            <nav className="hidden md:flex items-center gap-1">
              {[
                { to: '/capture', label: 'Capture' },
                { to: '/prompts', label: 'Prompts' },
                { to: '/jobs', label: 'Jobs' },
                { to: '/settings', label: 'Settings' },
              ].map((item) => (
                <a
                  key={item.to}
                  href={item.to}
                  className="px-2.5 py-1 text-sm rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
          {theme === 'system' && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              auto
            </span>
          )}
          {theme === 'light' && (
            <span className="text-xs text-amber-500">☀️</span>
          )}
          {theme === 'dark' && (
            <span className="text-xs text-indigo-400">🌙</span>
          )}
        </div>
      </header>

      {/* Main content — grows to fill space, scrollable */}
      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto overflow-x-hidden px-4 pb-24 pt-4">
        {children}
      </main>

      {/* Bottom nav (mobile only) */}
      <BottomNav />
    </div>
  );
}
