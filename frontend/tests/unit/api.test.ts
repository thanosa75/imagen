import { describe, it, expect, vi, beforeEach } from 'vitest';
import api, { setSettingsStoreRef } from '../../src/lib/api';
import { ApiError } from '../../src/lib/errors';

// Mock settings store
const mockSettingsStore = {
  getState: vi.fn().mockReturnValue({
    apiBaseUrl: 'http://localhost:3000',
    apiKey: 'test-api-key',
  }),
};

beforeEach(() => {
  vi.resetAllMocks();
  setSettingsStoreRef(mockSettingsStore as never);
  mockSettingsStore.getState.mockReturnValue({
    apiBaseUrl: 'http://localhost:3000',
    apiKey: 'test-api-key',
  });
});

describe('api client', () => {
  it('health — returns health response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'ok', redis: 'connected', timestamp: '...', app: 'imagen' }),
    });

    const result = await api.health();
    expect(result.status).toBe('ok');
    expect(result.redis).toBe('connected');
  });

  it('listPrompts — returns list of prompts', async () => {
    const mockPrompts = [{ id: 'test', name: 'Test', description: '', supportedOutcomes: ['text'], requiredVariables: [] }];
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ prompts: mockPrompts }),
    });

    const result = await api.listPrompts();
    expect(result).toEqual(mockPrompts);
  });

  it('getJobStatus — returns job data', async () => {
    const mockJob = { jobId: '123', status: 'completed', promptId: 'test', expectedOutcome: 'text', createdAt: '...', updatedAt: '...', completedAt: '...' };
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockJob),
    });

    const result = await api.getJobStatus('123');
    expect(result.jobId).toBe('123');
  });

  it('submitJob — returns created job', async () => {
    const mockCreated = { jobId: '456', status: 'pending', createdAt: '...' };
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(mockCreated),
    });

    const fd = new FormData();
    fd.append('image', new Blob(), 'test.jpg');
    const result = await api.submitJob(fd);
    expect(result.jobId).toBe('456');
  });

  it('handles 401 error with proper ApiError', async () => {
    const errorBody = JSON.stringify({
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key', details: null, timestamp: '...', requestId: '...' },
    });
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: new Map([['X-Request-ID', 'req-123']]),
      text: () => Promise.resolve(errorBody),
    });

    await expect(api.getJobStatus('123')).rejects.toBeInstanceOf(ApiError);
  });

  it('handles network error with retry', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'ok', redis: 'connected', timestamp: '...', app: 'imagen' }),
      });

    const result = await api.health();
    expect(result.status).toBe('ok');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('getJobImage — returns a blob', async () => {
    const mockBlob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(mockBlob),
    });

    const result = await api.getJobImage('123');
    expect(result).toBeInstanceOf(Blob);
  });

  it('createPrompt — returns created prompt', async () => {
    const mockPrompt = { id: 'new-prompt', name: 'New', template: 'test', supportedOutcomes: ['text'] };
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve(mockPrompt),
    });

    const result = await api.createPrompt({ id: 'new-prompt', name: 'New', template: 'test', supportedOutcomes: ['text'] });
    expect(result.id).toBe('new-prompt');
  });

  it('deletePrompt — returns void on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    await expect(api.deletePrompt('test')).resolves.toBeUndefined();
  });
});

describe('ApiError', () => {
  it('constructs from error response', async () => {
    const response = new Response(
      JSON.stringify({ error: { code: 'TEST_ERROR', message: 'test message' } }),
      { status: 400 },
    );
    const body = { error: { code: 'TEST_ERROR', message: 'test message' } };

    const error = await ApiError.fromResponse(response, body);
    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('test message');
    expect(error.statusCode).toBe(400);
  });

  it('handles non-JSON error responses', async () => {
    const response = new Response('plain text error', { status: 500 });
    const error = await ApiError.fromResponse(response, 'plain text error');
    expect(error.statusCode).toBe(500);
    expect(error.message).toContain('500');
  });
});
