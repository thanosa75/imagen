import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../../src/stores/settingsStore';

// Must be before module import — but since the store already loaded, 
// just ensure the state is clean

beforeEach(() => {
  // Reset store state directly
  useSettingsStore.setState({
    apiBaseUrl: 'http://localhost:3000',
    apiKey: '',
    theme: 'system',
  });
});

describe('settingsStore', () => {
  it('has default values', () => {
    const state = useSettingsStore.getState();
    expect(state.apiBaseUrl).toBe('http://localhost:3000');
    expect(state.apiKey).toBe('');
    expect(state.theme).toBe('system');
  });

  it('setApiBaseUrl updates the URL', () => {
    useSettingsStore.getState().setApiBaseUrl('https://api.example.com');
    expect(useSettingsStore.getState().apiBaseUrl).toBe('https://api.example.com');
  });

  it('setApiKey updates the key', () => {
    useSettingsStore.getState().setApiKey('my-secret');
    expect(useSettingsStore.getState().apiKey).toBe('my-secret');
  });

  it('setTheme changes theme', () => {
    useSettingsStore.getState().setTheme('dark');
    expect(useSettingsStore.getState().theme).toBe('dark');
  });
});
