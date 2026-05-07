// ── Settings Store ───────────────────────────────────────────
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface SettingsState {
  apiBaseUrl: string;
  apiKey: string;
  theme: Theme;

  setApiBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setTheme: (theme: Theme) => void;
  testConnection: () => Promise<boolean>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      // In production, default to same-origin (empty string) since nginx reverse-proxies /health, /jobs, /prompts -> api:3000.
      // In dev, default to localhost:3000 (Vite dev server proxies these paths).
      apiBaseUrl: import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL ?? 'http://localhost:3000'),
      apiKey: '',
      theme: 'system',

      setApiBaseUrl: (url: string) => set({ apiBaseUrl: url }),
      setApiKey: (key: string) => set({ apiKey: key }),
      setTheme: (theme: Theme) => {
        set({ theme });
        applyTheme(theme);
      },

      testConnection: async (): Promise<boolean> => {
        try {
          const { apiBaseUrl } = get();
          const prefix = import.meta.env.PROD ? '/api' : '';
          const response = await fetch(`${apiBaseUrl}${prefix}/health`, {
            headers: { 'X-Request-ID': crypto.randomUUID?.() ?? 'test' },
          });
          return response.ok;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'imagen-settings',
      partialize: (state) => ({
        apiBaseUrl: state.apiBaseUrl,
        apiKey: state.apiKey,
        theme: state.theme,
      }),
    },
  ),
);

// Apply theme on store hydration
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');

  if (theme === 'system') {
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

// Listen for system theme changes when in 'system' mode
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (e) => {
      const { theme } = useSettingsStore.getState();
      if (theme === 'system') {
        document.documentElement.classList.toggle('dark', e.matches);
      }
    });

  // Initial theme application
  const { theme } = useSettingsStore.getState();
  applyTheme(theme);
}
