// ── Prompt Types ──────────────────────────────────────────────

export interface Prompt {
  id: string;
  name: string;
  description: string;
  template: string;
  supportedOutcomes: OutcomeType[];
  requiredVariables: string[];
  defaultVariables: Record<string, string>;
}

export type OutcomeType = 'text' | 'image';

/** Summary shape returned by GET /prompts/show */
export interface PromptListItem {
  id: string;
  name: string;
  description: string;
  requiredVariables: string[];
  supportedOutcomes: OutcomeType[];
}

/** DTO for creating a new prompt (POST /prompts) */
export interface PromptCreateDTO {
  id: string;
  name: string;
  description: string;
  template: string;
  supportedOutcomes: OutcomeType[];
  requiredVariables: string[];
  defaultVariables: Record<string, string>;
}

/** DTO for updating a prompt (PUT /prompts/:id) — id omitted (from URL) */
export interface PromptUpdateDTO {
  name: string;
  description: string;
  template: string;
  supportedOutcomes: OutcomeType[];
  requiredVariables: string[];
  defaultVariables: Record<string, string>;
}
