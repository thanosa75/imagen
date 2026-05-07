import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import api from '../../lib/api';

export default function SettingsPage() {
  const { apiBaseUrl, apiKey, theme, setApiBaseUrl, setApiKey, setTheme } = useSettingsStore();
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Use the api client which reads from the store
      const result = await api.health();
      setTestResult({
        ok: true,
        message: `Connected! Redis: ${result.redis}, Status: ${result.status}`,
      });
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed',
      });
    }
    setTesting(false);
  };

  return (
    <div className="space-y-5 pb-20">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h1>

      {/* API URL */}
      <div>
        <label htmlFor="api-url" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          API Base URL
        </label>
        <input
          id="api-url"
          type="text"
          value={apiBaseUrl}
          onChange={(e) => setApiBaseUrl(e.target.value)}
          placeholder="http://localhost:3000"
          className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600
                     bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono
                     placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>

      {/* API Key */}
      <div>
        <label htmlFor="api-key" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          API Key
        </label>
        <input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter your x-api-key..."
          className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600
                     bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono
                     placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        />
      </div>

      {/* Test connection */}
      <button
        onClick={handleTest}
        disabled={testing}
        className="w-full py-2.5 rounded-lg font-medium text-sm transition-all
                   bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200
                   hover:bg-slate-200 dark:hover:bg-slate-600
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {testing ? 'Testing...' : 'Test Connection'}
      </button>

      {testResult && (
        <div
          className={`p-3 rounded-lg text-sm ${
            testResult.ok
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
          }`}
        >
          {testResult.message}
        </div>
      )}

      {/* Theme */}
      <div>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Theme</label>
        <div className="mt-1 flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all
                ${theme === t
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* About */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">About</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Imagen v1.0 — AI-powered image analysis and generation PWA.
          Uses Google Gemini for processing.
        </p>
      </div>
    </div>
  );
}
