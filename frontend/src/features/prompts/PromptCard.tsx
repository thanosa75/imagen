import type { PromptListItem } from '../../types/prompt';

interface PromptCardProps {
  prompt: PromptListItem;
  onDelete: (id: string) => void;
}

const outcomeColors: Record<string, string> = {
  text: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  image: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

export default function PromptCard({ prompt, onDelete }: PromptCardProps) {
  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700
                    bg-white dark:bg-slate-800 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {prompt.name}
            </h3>
            <span
              className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${outcomeColors[prompt.supportedOutcomes[0]] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
            >
              {prompt.supportedOutcomes[0]}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
            {prompt.description}
          </p>
          <p className="text-[10px] text-slate-400 mt-1 font-mono">{prompt.id}</p>
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            onDelete(prompt.id);
          }}
          className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title="Delete prompt"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
