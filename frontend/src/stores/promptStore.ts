// ── Prompt Store ─────────────────────────────────────────────
import { create } from 'zustand';
import api from '../lib/api';
import type { Prompt, PromptListItem, PromptCreateDTO, PromptUpdateDTO } from '../types/prompt';

interface PromptState {
  prompts: PromptListItem[];
  selectedPromptId: string | null;
  isLoading: boolean;
  error: string | null;

  fetchPrompts: () => Promise<void>;
  selectPrompt: (id: string) => void;
  createPrompt: (data: PromptCreateDTO) => Promise<Prompt>;
  updatePrompt: (id: string, data: PromptUpdateDTO) => Promise<Prompt>;
  deletePrompt: (id: string) => Promise<void>;
}

export const usePromptStore = create<PromptState>()((set, get) => ({
  prompts: [],
  selectedPromptId: null,
  isLoading: false,
  error: null,

  fetchPrompts: async () => {
    set({ isLoading: true, error: null });
    try {
      const prompts = await api.listPrompts();
      set({ prompts, isLoading: false });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch prompts';
      set({ error: message, isLoading: false });
    }
  },

  selectPrompt: (id: string) => set({ selectedPromptId: id }),

  createPrompt: async (data: PromptCreateDTO): Promise<Prompt> => {
    set({ error: null });
    try {
      const prompt = await api.createPrompt(data);
      // Refresh the list
      get().fetchPrompts();
      return prompt;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create prompt';
      set({ error: message });
      throw err;
    }
  },

  updatePrompt: async (
    id: string,
    data: PromptUpdateDTO,
  ): Promise<Prompt> => {
    set({ error: null });
    try {
      const prompt = await api.updatePrompt(id, data);
      get().fetchPrompts();
      return prompt;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update prompt';
      set({ error: message });
      throw err;
    }
  },

  deletePrompt: async (id: string): Promise<void> => {
    set({ error: null });
    try {
      await api.deletePrompt(id);
      // Remove from local state immediately for responsiveness
      set((state) => ({
        prompts: state.prompts.filter((p) => p.id !== id),
        selectedPromptId:
          state.selectedPromptId === id ? null : state.selectedPromptId,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete prompt';
      set({ error: message });
      throw err;
    }
  },
}));
