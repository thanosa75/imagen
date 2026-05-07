import { z } from 'zod';

export const promptSchema = z.object({
  id: z
    .string()
    .min(1, 'ID is required')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ID must use lowercase letters, numbers, and hyphens (kebab-case)'),
  name: z.string().min(3, 'Name is required (3-100 characters)').max(100),
  description: z.string(),
  template: z.string().min(1, 'Template cannot be empty'),
  supportedOutcomes: z.array(z.enum(['text', 'image'])).min(1, 'Select at least one outcome type'),
  requiredVariables: z.array(z.string()),
  defaultVariables: z.record(z.string(), z.string()),
});

export type PromptFormValues = z.infer<typeof promptSchema>;
