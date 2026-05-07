import { useMemo, useState, useCallback } from 'react';
import { extractVariables } from '../../lib/template';

interface VariableManagerProps {
  template: string;
  requiredVariables: string[];
  defaultVariables: Record<string, string>;
  onChange: (required: string[], defaults: Record<string, string>) => void;
}

export default function VariableManager({
  template,
  requiredVariables,
  defaultVariables,
  onChange,
}: VariableManagerProps) {
  const [newVarName, setNewVarName] = useState('');

  const detectedVars = useMemo(() => extractVariables(template), [template]);

  const allVarNames = useMemo(() => {
    const set = new Set([...detectedVars, ...Object.keys(defaultVariables)]);
    return [...set].sort();
  }, [detectedVars, defaultVariables]);

  const handleToggleRequired = useCallback(
    (varName: string) => {
      const next = requiredVariables.includes(varName)
        ? requiredVariables.filter((v) => v !== varName)
        : [...requiredVariables, varName];
      onChange(next, defaultVariables);
    },
    [requiredVariables, defaultVariables, onChange],
  );

  const handleDefaultChange = useCallback(
    (varName: string, value: string) => {
      onChange(requiredVariables, { ...defaultVariables, [varName]: value });
    },
    [requiredVariables, defaultVariables, onChange],
  );

  const handleRemoveVar = useCallback(
    (varName: string) => {
      const nextDefaults = { ...defaultVariables };
      delete nextDefaults[varName];
      const nextRequired = requiredVariables.filter((v) => v !== varName);
      onChange(nextRequired, nextDefaults);
    },
    [defaultVariables, requiredVariables, onChange],
  );

  const handleAddVar = useCallback(() => {
    const name = newVarName.trim();
    if (!name || allVarNames.includes(name)) return;
    onChange(requiredVariables, { ...defaultVariables, [name]: '' });
    setNewVarName('');
  }, [newVarName, allVarNames, defaultVariables, requiredVariables, onChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Variables
        </label>
        <span className="text-[10px] text-slate-400">{allVarNames.length} variables</span>
      </div>

      {/* Detected variables */}
      {allVarNames.map((varName) => {
        const isDetected = detectedVars.includes(varName);
        const isRequired = requiredVariables.includes(varName);
        return (
          <div
            key={varName}
            className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700
                       bg-white dark:bg-slate-800 space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-medium text-slate-800 dark:text-slate-200">
                  {varName}
                </span>
                {!isDetected && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    Not in template
                  </span>
                )}
              </div>
              <button
                onClick={() => handleRemoveVar(varName)}
                className="text-slate-400 hover:text-red-500 transition-colors p-0.5"
                title="Remove variable"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={() => handleToggleRequired(varName)}
                  className="rounded border-slate-300 dark:border-slate-600 text-indigo-500
                             focus:ring-indigo-500/30"
                />
                Required
              </label>
              <input
                type="text"
                value={defaultVariables[varName] ?? ''}
                onChange={(e) => handleDefaultChange(varName, e.target.value)}
                placeholder="Default value..."
                className="flex-1 px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-600
                           bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300
                           placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              />
            </div>
          </div>
        );
      })}

      {/* Add variable */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newVarName}
          onChange={(e) => setNewVarName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddVar()}
          placeholder="New variable name..."
          className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600
                     bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300
                     placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
        />
        <button
          onClick={handleAddVar}
          disabled={!newVarName.trim()}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 text-white
                     hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          + Add
        </button>
      </div>
    </div>
  );
}
