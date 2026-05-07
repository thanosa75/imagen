import { useMemo } from 'react';

interface VariableEditorProps {
  template: string;
  requiredVariables: string[];
  defaultVariables: Record<string, string>;
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  disabled?: boolean;
}

export default function VariableEditor({
  template,
  requiredVariables,
  defaultVariables,
  values,
  onChange,
  disabled = false,
}: VariableEditorProps) {
  const detectedVars = useMemo(() => {
    const regex = /\{\{(\w+)\}\}/g;
    const vars = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(template)) !== null) {
      vars.add(match[1]);
    }
    return [...vars].sort();
  }, [template]);

  if (detectedVars.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400 italic">
        This prompt has no customizable variables.
      </p>
    );
  }

  const filledRequired = requiredVariables.filter(
    (v) => values[v]?.trim(),
  ).length;
  const totalRequired = requiredVariables.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Variables
        </label>
        {totalRequired > 0 && (
          <span
            className={`text-xs ${filledRequired === totalRequired
                ? 'text-emerald-500'
                : 'text-amber-500'
              }`}
          >
            {filledRequired} of {totalRequired} required
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {detectedVars.map((varName) => {
          const isRequired = requiredVariables.includes(varName);
          return (
            <div key={varName}>
              <label
                htmlFor={`var-${varName}`}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
              >
                {varName}
                {isRequired && (
                  <span className="text-[10px] text-red-500 font-bold">*</span>
                )}
              </label>
              <input
                id={`var-${varName}`}
                type="text"
                value={values[varName] ?? ''}
                onChange={(e) => onChange(varName, e.target.value)}
                placeholder={defaultVariables[varName] || `Enter ${varName}...`}
                disabled={disabled}
                className={`w-full px-3 py-1.5 text-sm rounded-lg border
                  bg-white dark:bg-slate-800 text-slate-900 dark:text-white
                  placeholder:text-slate-400 dark:placeholder:text-slate-500
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${isRequired && !values[varName]?.trim()
                    ? 'border-red-300 dark:border-red-700'
                    : 'border-slate-200 dark:border-slate-700'
                  }`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
