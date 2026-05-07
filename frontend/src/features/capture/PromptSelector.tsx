import { useState } from 'react';
import type { PromptListItem } from '../../types/prompt';

interface PromptSelectorProps {
  prompts: PromptListItem[];
  selectedPromptId: string | null;
  isLoading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}

const outcomeColors: Record<string, string> = {
  text: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  image: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

export default function PromptSelector({
  prompts,
  selectedPromptId,
  isLoading,
  error,
  onSelect,
  onRefresh,
}: PromptSelectorProps) {
  const [search, setSearch] = useState('');

  const filtered = prompts.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Choose a prompt
        </label>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-xs text-indigo-500 hover:text-indigo-400 disabled:opacity-40 transition-colors"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search prompts..."
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700
                   bg-white dark:bg-slate-800 text-slate-900 dark:text-white
                   placeholder:text-slate-400 dark:placeholder:text-slate-500
                   focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
      />

      {/* Error state */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && prompts.length === 0 && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse h-20 rounded-xl bg-slate-200 dark:bg-slate-700"
            />
          ))}
        </div>
      )}

      {/* Prompt cards */}
      <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
        {filtered.map((prompt) => {
          const selected = prompt.id === selectedPromptId;
          return (
            <button
              key={prompt.id}
              onClick={() => onSelect(prompt.id)}
              className={`text-left w-full p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer
                ${selected
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-md'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {prompt.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {prompt.description}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${outcomeColors[prompt.supportedOutcomes[0]] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
                >
                  {prompt.supportedOutcomes[0]}
                </span>
              </div>
            </button>
          );
        })}

        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-6">
            No prompts found
          </p>
        )}
      </div>
    </div>
  );
}
