import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { usePromptStore } from '../../stores/promptStore';
import { promptSchema, type PromptFormValues } from './promptValidation';
import TemplateEditor from './TemplateEditor';
import VariableManager from './VariableManager';
import TemplatePreview from './TemplatePreview';
import api from '../../lib/api';
import type { Prompt } from '../../types/prompt';

export default function PromptFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { createPrompt, updatePrompt, error: storeError } = usePromptStore();
  const isEdit = Boolean(id);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PromptFormValues>({
    resolver: zodResolver(promptSchema),
    defaultValues: {
      id: '',
      name: '',
      description: '',
      template: '',
      supportedOutcomes: ['text'],
      requiredVariables: [],
      defaultVariables: {},
    },
  });

  const template = watch('template');
  const requiredVars = watch('requiredVariables');
  const defaultVars = watch('defaultVariables');
  const supportedOutcomes = watch('supportedOutcomes');

  // Load existing prompt in edit mode
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const prompt: Prompt = await api.getPrompt(id);
        reset({
          id: prompt.id,
          name: prompt.name,
          description: prompt.description || '',
          template: prompt.template,
          supportedOutcomes: prompt.supportedOutcomes,
          requiredVariables: prompt.requiredVariables || [],
          defaultVariables: prompt.defaultVariables || {},
        });
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'Failed to load prompt');
      }
    })();
  }, [id, reset]);

  const handleOutcomeToggle = useCallback(
    (outcome: 'text' | 'image') => {
      const current = [...supportedOutcomes];
      if (current.includes(outcome)) {
        if (current.length > 1) {
          setValue('supportedOutcomes', current.filter((o) => o !== outcome));
        }
      } else {
        setValue('supportedOutcomes', [...current, outcome]);
      }
    },
    [supportedOutcomes, setValue],
  );

  const handleVariablesChange = useCallback(
    (required: string[], defaults: Record<string, string>) => {
      setValue('requiredVariables', required);
      setValue('defaultVariables', defaults);
    },
    [setValue],
  );

  const onSubmit = async (data: PromptFormValues) => {
    setFormError(null);
    try {
      if (isEdit && id) {
        const { id: _, ...updateData } = data;
        await updatePrompt(id, updateData);
        navigate(`/prompts/${id}`);
      } else {
        await createPrompt(data);
        navigate('/prompts');
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save prompt');
    }
  };

  const displayError = formError || storeError;

  return (
    <div className="space-y-5 pb-20">
      {/* Back nav */}
      <Link
        to={isEdit ? `/prompts/${id}` : '/prompts'}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700
                   dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {isEdit ? 'Back to detail' : 'Back to prompts'}
      </Link>

      <h1 className="text-xl font-bold text-slate-900 dark:text-white">
        {isEdit ? 'Edit Prompt' : 'New Prompt'}
      </h1>

      {displayError && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {displayError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Basic fields */}
        <div className="space-y-3">
          {/* ID */}
          <div>
            <label htmlFor="id" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Prompt ID
            </label>
            <input
              id="id"
              {...register('id')}
              disabled={isEdit}
              placeholder="my-awesome-prompt"
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600
                         bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono
                         placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {errors.id && (
              <p className="mt-1 text-xs text-red-500">{errors.id.message}</p>
            )}
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Display Name
            </label>
            <input
              id="name"
              {...register('name')}
              placeholder="My Awesome Prompt"
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600
                         bg-white dark:bg-slate-800 text-slate-900 dark:text-white
                         placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Description
            </label>
            <input
              id="description"
              {...register('description')}
              placeholder="What this prompt does..."
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600
                         bg-white dark:bg-slate-800 text-slate-900 dark:text-white
                         placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          {/* Outcome selector */}
          <div>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Expected Outcomes
            </label>
            <div className="mt-1 flex gap-2">
              {(['text', 'image'] as const).map((outcome) => {
                const active = supportedOutcomes.includes(outcome);
                return (
                  <button
                    key={outcome}
                    type="button"
                    onClick={() => handleOutcomeToggle(outcome)}
                    className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all border-2
                      ${active
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300'
                      }`}
                  >
                    {outcome}
                  </button>
                );
              })}
            </div>
            {errors.supportedOutcomes && (
              <p className="mt-1 text-xs text-red-500">{errors.supportedOutcomes.message}</p>
            )}
          </div>
        </div>

        {/* Template */}
        <TemplateEditor
          value={template}
          onChange={(val) => setValue('template', val)}
        />
        {errors.template && (
          <p className="text-xs text-red-500">{errors.template.message}</p>
        )}

        {/* Variables */}
        <VariableManager
          template={template}
          requiredVariables={requiredVars}
          defaultVariables={defaultVars}
          onChange={handleVariablesChange}
        />

        {/* Live preview */}
        <TemplatePreview template={template} defaultVariables={defaultVars} />

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-all
                     bg-indigo-500 text-white hover:bg-indigo-400
                     disabled:opacity-50 disabled:cursor-not-allowed
                     active:scale-[0.98] shadow-sm"
        >
          {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Prompt'}
        </button>
      </form>
    </div>
  );
}
