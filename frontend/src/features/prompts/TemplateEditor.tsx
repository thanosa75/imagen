import { useMemo } from 'react';
import { extractVariables } from '../../lib/template';

interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function TemplateEditor({
  value,
  onChange,
  disabled = false,
}: TemplateEditorProps) {
  const variables = useMemo(() => extractVariables(value), [value]);

  const highlightedTemplate = useMemo(() => {
    if (!value) return '';
    return value.replace(
      /\{\{(\w+)\}\}/g,
      '<mark class="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded px-0.5">{{$1}}</mark>',
    );
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Template
        </label>
        <span className="text-[10px] text-slate-400">
          {variables.length} variable{variables.length !== 1 ? 's' : ''} detected
        </span>
      </div>

      {/* Editor */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Enter your prompt template with {{variables}}..."
        rows={6}
        className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600
                   bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono
                   placeholder:text-slate-400 dark:placeholder:text-slate-500
                   focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow
                   disabled:opacity-60 disabled:cursor-not-allowed resize-y"
      />

      {/* Detected variables badges */}
      {variables.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {variables.map((v) => (
            <span
              key={v}
              className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30
                         text-indigo-600 dark:text-indigo-400 font-mono"
            >
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}

      {/* Live preview */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Raw preview:
        </label>
        <p
          className="text-xs text-slate-600 dark:text-slate-400 p-2 rounded-md bg-slate-50 dark:bg-slate-800/50
                     border border-slate-100 dark:border-slate-700 min-h-[2rem] whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: highlightedTemplate || '<span class="text-slate-400 italic">Empty template</span>' }}
        />
      </div>
    </div>
  );
}
