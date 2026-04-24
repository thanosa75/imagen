const promptService = require('../../src/services/promptService');

describe('promptService', () => {
  test('loadPrompts returns an object with a prompts array', async () => {
    const prompts = await promptService.loadPrompts();
    expect(prompts).toHaveProperty('prompts');
    expect(Array.isArray(prompts.prompts)).toBe(true);
  });

  test('getPromptById returns null for unknown id', async () => {
    const prompt = await promptService.getPromptById('does-not-exist');
    expect(prompt).toBeNull();
  });

  test('getPromptById returns a valid prompt', async () => {
    const prompts = await promptService.loadPrompts();
    if (prompts.prompts.length > 0) {
      const firstPrompt = prompts.prompts[0];
      const prompt = await promptService.getPromptById(firstPrompt.id);
      expect(prompt).toBeTruthy();
      expect(prompt.id).toBe(firstPrompt.id);
    }
  });

  test('resolveTemplate substitutes variables', () => {
    const template = 'Hello {{name}}, welcome to {{place}}';
    const result = promptService.resolveTemplate(template, { name: 'Alice', place: 'Wonderland' });
    expect(result).toBe('Hello Alice, welcome to Wonderland');
  });

  test('resolveTemplate uses default variables', () => {
    const template = 'Hello {{name}}, welcome to {{place}}';
    const result = promptService.resolveTemplate(template, { name: 'Alice' }, { place: 'Home' });
    expect(result).toBe('Hello Alice, welcome to Home');
  });

  test('validateVariables throws on missing required vars', () => {
    const prompt = { requiredVariables: ['color'] };
    expect(() => promptService.validateVariables(prompt, {})).toThrow('Missing required variables: color');
  });

  test('validateVariables passes when all required vars provided', () => {
    const prompt = { requiredVariables: ['color'] };
    expect(() => promptService.validateVariables(prompt, { color: 'red' })).not.toThrow();
  });

  test('validateOutcome throws on unsupported outcome', () => {
    const prompt = { id: 'test', supportedOutcomes: ['text'] };
    expect(() => promptService.validateOutcome(prompt, 'image')).toThrow("does not support outcome type 'image'");
  });

  test('getResolvedPrompt resolves template with validation', async () => {
    const prompts = await promptService.loadPrompts();
    if (prompts.prompts.length > 0) {
      const firstPrompt = prompts.prompts[0];
      const variables = {};
      if (firstPrompt.requiredVariables) {
        firstPrompt.requiredVariables.forEach(v => { variables[v] = 'test-value'; });
      }
      const result = await promptService.getResolvedPrompt(firstPrompt.id, variables, firstPrompt.supportedOutcomes[0]);
      expect(result).toHaveProperty('prompt');
      expect(result).toHaveProperty('metadata');
    }
  });
});
