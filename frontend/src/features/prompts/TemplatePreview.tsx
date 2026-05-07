import { useMemo } from 'react';
import { resolveTemplate } from '../../lib/template';

interface TemplatePreviewProps {
  template: string;
  defaultVariables: Record<string, string>;
}

export default function TemplatePreview({
  template,
  defaultVariables,
}: TemplatePreviewProps) {
  const resolved = useMemo(
    () => resolveTemplate(template, defaultVariables),
    [template, defaultVariables],
  );

  if (!template.trim()) {
    return (
      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
        <p className="text-xs text-slate-400 italic">Enter a template above to see the preview.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
        Preview (with defaults):
      </label>
      <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
        <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
          {resolved}
        </p>
      </div>
      <button
        onClick={() => navigator.clipboard.writeText(resolved)}
        className="text-xs text-indigo-500 hover:text-indigo-400 transition-colors"
      >
        Copy resolved text
      </button>
    </div>
  );
}
