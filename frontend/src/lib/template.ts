// ── Template Variable Utilities ──────────────────────────────

/**
 * Extract all unique {{variableName}} tokens from a template string.
 * Returns them sorted alphabetically.
 *
 * @example
 *   extractVariables('Hello {{name}}, welcome to {{place}}!')
 *   // => ['name', 'place']
 *
 * @example
 *   extractVariables('no variables here')
 *   // => []
 *
 * @example
 *   extractVariables('{{a}} {{a}} {{b}}')
 *   // => ['a', 'b']
 */
export function extractVariables(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    vars.add(match[1]);
  }
  return [...vars].sort();
}

/**
 * Resolve a template by replacing all {{variableName}} placeholders
 * with their corresponding values from the variables map.
 * Unmatched placeholders are left as-is.
 *
 * @example
 *   resolveTemplate('Hello {{name}}!', { name: 'World' })
 *   // => 'Hello World!'
 */
export function resolveTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  let resolved = template;
  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replaceAll(`{{${key}}}`, value);
  }
  return resolved;
}
