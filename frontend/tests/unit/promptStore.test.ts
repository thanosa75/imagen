import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usePromptStore } from '../../src/stores/promptStore';
import api from '../../src/lib/api';

vi.mock('../../src/lib/api', () => ({
  default: {
    listPrompts: vi.fn(),
    getPrompt: vi.fn(),
    createPrompt: vi.fn(),
    updatePrompt: vi.fn(),
    deletePrompt: vi.fn(),
    previewPrompt: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  usePromptStore.setState({
    prompts: [],
    selectedPromptId: null,
    isLoading: false,
    error: null,
  });
});

describe('promptStore', () => {
  it('fetchPrompts loads prompts from API', async () => {
    const mockPrompts = [
      { id: 'test', name: 'Test', description: '', supportedOutcomes: ['text'], requiredVariables: [] },
    ];
    vi.mocked(api.listPrompts).mockResolvedValueOnce(mockPrompts);

    await usePromptStore.getState().fetchPrompts();

    expect(usePromptStore.getState().prompts).toEqual(mockPrompts);
    expect(usePromptStore.getState().isLoading).toBe(false);
  });

  it('fetchPrompts handles errors', async () => {
    vi.mocked(api.listPrompts).mockRejectedValueOnce(new Error('Network error'));

    await usePromptStore.getState().fetchPrompts();

    expect(usePromptStore.getState().error).toBe('Network error');
    expect(usePromptStore.getState().isLoading).toBe(false);
  });

  it('selectPrompt sets selectedPromptId', () => {
    usePromptStore.getState().selectPrompt('my-prompt');
    expect(usePromptStore.getState().selectedPromptId).toBe('my-prompt');
  });

  it('createPrompt adds prompt via API', async () => {
    const mockCreated = { id: 'new-prompt', name: 'New', template: 'test', supportedOutcomes: ['text'], requiredVariables: [], defaultVariables: {} };
    vi.mocked(api.createPrompt).mockResolvedValueOnce(mockCreated);

    const result = await usePromptStore.getState().createPrompt({ id: 'new-prompt', name: 'New', template: 'test', supportedOutcomes: ['text'] });
    expect(result.id).toBe('new-prompt');
  });

  it('deletePrompt removes prompt', async () => {
    vi.mocked(api.deletePrompt).mockResolvedValueOnce(undefined);
    usePromptStore.setState({
      prompts: [{ id: 'test', name: 'Test', description: '', supportedOutcomes: ['text'], requiredVariables: [] }],
    });

    await usePromptStore.getState().deletePrompt('test');
    expect(usePromptStore.getState().prompts).toHaveLength(0);
  });
});
