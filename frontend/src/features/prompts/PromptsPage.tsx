import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePromptStore } from '../../stores/promptStore';
import PromptCard from './PromptCard';

export default function PromptsPage() {
  const { prompts, isLoading, error, fetchPrompts, deletePrompt } = usePromptStore();
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => { fetchPrompts(); }, [fetchPrompts]);

  const filtered = prompts.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()),
  );

  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    try {
      await deletePrompt(id);
      setConfirmDelete(null);
    } catch {
      // error is in store
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Prompts</h1>
        <Link
          to="/prompts/new"
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-500 text-white
                     hover:bg-indigo-400 active:scale-[0.98] transition-all shadow-sm"
        >
          + New
        </Link>
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
                   focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      />

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
          <button onClick={fetchPrompts} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Loading */}
      {isLoading && prompts.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-24 rounded-xl bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
      )}

      {/* List */}
      {!isLoading && filtered.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-8">
          {search ? 'No prompts match your search.' : 'No prompts yet.'}
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((p) => (
          <div key={p.id}>
            <Link to={`/prompts/${p.id}`} className="block">
              <PromptCard prompt={p} onDelete={handleDelete} />
            </Link>
            {confirmDelete === p.id && (
              <div className="mt-1 text-center">
                <span className="text-xs text-red-500">
                  Click delete again to confirm, or{' '}
                  <button onClick={() => setConfirmDelete(null)} className="underline">cancel</button>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
