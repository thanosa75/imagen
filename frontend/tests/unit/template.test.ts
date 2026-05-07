import { describe, it, expect } from 'vitest';
import { extractVariables, resolveTemplate } from '../../src/lib/template';

describe('extractVariables', () => {
  it('extracts simple variables', () => {
    expect(extractVariables('Hello {{name}}, how is {{day}}?')).toEqual(['day', 'name']);
  });

  it('returns empty array for template with no variables', () => {
    expect(extractVariables('no variables here')).toEqual([]);
  });

  it('deduplicates repeated variables', () => {
    expect(extractVariables('{{a}} {{a}} {{b}}')).toEqual(['a', 'b']);
  });

  it('handles empty string', () => {
    expect(extractVariables('')).toEqual([]);
  });

  it('handles only double braces without content', () => {
    // {{}} — the regex requires \w+ so empty braces don't match
    expect(extractVariables('{{}} text {{x}}')).toEqual(['x']);
  });

  it('handles underscores in variable names', () => {
    expect(extractVariables('{{my_var}} and {{another_one}}')).toEqual(['another_one', 'my_var']);
  });

  it('handles numbers in variable names', () => {
    expect(extractVariables('{{var1}} {{var2}}')).toEqual(['var1', 'var2']);
  });
});

describe('resolveTemplate', () => {
  it('resolves a single variable', () => {
    const result = resolveTemplate('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
  });

  it('resolves multiple variables', () => {
    const result = resolveTemplate('{{greeting}} {{name}}!', { greeting: 'Hi', name: 'Alice' });
    expect(result).toBe('Hi Alice!');
  });

  it('resolves repeated variables', () => {
    const result = resolveTemplate('{{x}}{{x}}{{x}}', { x: 'a' });
    expect(result).toBe('aaa');
  });

  it('leaves unresolved variables untouched', () => {
    const result = resolveTemplate('{{known}} {{unknown}}', { known: 'yes' });
    expect(result).toBe('yes {{unknown}}');
  });

  it('handles empty variables object', () => {
    const result = resolveTemplate('{{test}}', {});
    expect(result).toBe('{{test}}');
  });

  it('handles empty template', () => {
    const result = resolveTemplate('', { x: 'y' });
    expect(result).toBe('');
  });

  it('handles special replacement characters in values', () => {
    // Values like "$&" should not trigger special replacement patterns
    const result = resolveTemplate('cost: {{price}}', { price: '$5.00' });
    expect(result).toBe('cost: $5.00');
  });
});
