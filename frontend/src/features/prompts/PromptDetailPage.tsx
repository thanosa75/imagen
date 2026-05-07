import { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { usePromptStore } from '../../stores/promptStore';

export default function PromptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedPromptId, selectPrompt } = usePromptStore();

  useEffect(() => {
    if (id) selectPrompt(id);
  }, [id, selectPrompt]);

  const handleDelete = async () => {
    if (!id) return;
    if (window.confirm(`Delete prompt "${id}"? This cannot be undone.`)) {
      try {
        await usePromptStore.getState().deletePrompt(id);
        navigate('/prompts');
      } catch { /* error in store */ }
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <Link
        to="/prompts"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700
                   dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Prompts
      </Link>

      <div className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {selectedPromptId || id || 'Unknown Prompt'}
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">{id}</p>
        </div>

        <div className="flex gap-2">
          <Link
            to={`/prompts/${id}/edit`}
            className="flex-1 py-2 text-center rounded-lg text-sm font-medium
                       bg-indigo-500 text-white hover:bg-indigo-400 transition-colors"
          >
            Edit
          </Link>
          <button
            onClick={handleDelete}
            className="flex-1 py-2 rounded-lg text-sm font-medium
                       border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400
                       hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
