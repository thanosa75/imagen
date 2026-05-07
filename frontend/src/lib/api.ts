// ── API Client ───────────────────────────────────────────────
import { ApiError } from './errors';
import type { Prompt, PromptListItem, PromptCreateDTO, PromptUpdateDTO } from '../types/prompt';
import type { Job, JobCreated, HealthResponse } from '../types/job';

type SettingsStore = {
  getState(): { apiBaseUrl: string; apiKey: string };
};

let _settingsStore: SettingsStore | null = null;

/** Must be called at app init so the API client can read settings */
export function setSettingsStoreRef(store: SettingsStore): void {
  _settingsStore = store;
}

function getBaseUrl(): string {
  const stored = _settingsStore?.getState().apiBaseUrl;
  // In production, treat the dev default (localhost:3000) as same-origin.
  // Otherwise the persisted store value overrides the sensible default.
  if (import.meta.env.PROD && (!stored || stored === 'http://localhost:3000')) {
    return '';
  }
  return stored ?? (import.meta.env.PROD ? '' : 'http://localhost:3000');
}

// In production, all API calls go through /api/ so nginx can distinguish
// SPA page routes (/jobs, /prompts) from API requests (/api/jobs, /api/prompts).
const API_PREFIX = import.meta.env.PROD ? '/api' : '';

function getApiKey(): string {
  return _settingsStore?.getState().apiKey ?? '';
}

function generateRequestId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function request(
  path: string,
  options: RequestInit & { noAuth?: boolean; isBlob?: boolean } = {},
): Promise<Response> {
  const { noAuth, isBlob, ...fetchOptions } = options;
  const url = `${getBaseUrl()}${API_PREFIX}${path}`;

  const headers: Record<string, string> = {
    'X-Request-ID': generateRequestId(),
    ...(fetchOptions.headers as Record<string, string> | undefined),
  };

  if (!noAuth) {
    const apiKey = getApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
  }

  // Don't set Content-Type for FormData (browser sets it with boundary)
  const finalOptions: RequestInit = {
    ...fetchOptions,
    headers,
  };

  const doFetch = (): Promise<Response> => fetch(url, finalOptions);

  try {
    const response = await doFetch();

    // Single retry on network errors, 503, or 429
    if (
      (response.status === 503 || response.status === 429) &&
      !('x-retried' in (finalOptions.headers ?? {}))
    ) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
      await new Promise((r) => setTimeout(r, delay));
      const retryOptions: RequestInit = {
        ...finalOptions,
        headers: { ...headers, 'x-retried': '1' },
      };
      return fetch(url, retryOptions);
    }

    return response;
  } catch (error) {
    // Network error — single retry
    if (!('x-retried' in (finalOptions.headers ?? {}))) {
      const retryOptions: RequestInit = {
        ...finalOptions,
        headers: { ...headers, 'x-retried': '1' },
      };
      return fetch(url, retryOptions);
    }
    throw error;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: unknown;
    try {
      // Read the body once — we don't need clone
      const text = await response.text();
      try { body = JSON.parse(text); } catch { body = text; }
    } catch {
      body = null;
    }
    throw await ApiError.fromResponse(response, body);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function handleBlobResponse(response: Response): Promise<Blob> {
  if (!response.ok) {
    let body: unknown;
    try {
      const text = await response.text();
      try { body = JSON.parse(text); } catch { body = text; }
    } catch {
      body = null;
    }
    throw await ApiError.fromResponse(response, body);
  }
  return response.blob();
}

// ── Public API ───────────────────────────────────────────────

const api = {
  /** GET /health — no auth required */
  async health(): Promise<HealthResponse> {
    const response = await request('/health', { noAuth: true });
    return handleResponse<HealthResponse>(response);
  },

  /** GET /prompts/show — list all prompts (summary) */
  async listPrompts(): Promise<PromptListItem[]> {
    const response = await request('/prompts/show');
    const data = await handleResponse<{ prompts: PromptListItem[] }>(response);
    return data.prompts;
  },

  /** GET /prompts/:id — get full prompt detail */
  async getPrompt(id: string): Promise<Prompt> {
    const response = await request(`/prompts/${encodeURIComponent(id)}`);
    return handleResponse<Prompt>(response);
  },

  /** POST /prompts — create a new prompt */
  async createPrompt(data: PromptCreateDTO): Promise<Prompt> {
    const response = await request('/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Prompt>(response);
  },

  /** PUT /prompts/:id — update an existing prompt */
  async updatePrompt(id: string, data: PromptUpdateDTO): Promise<Prompt> {
    const response = await request(`/prompts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Prompt>(response);
  },

  /** DELETE /prompts/:id — delete a prompt */
  async deletePrompt(id: string): Promise<void> {
    const response = await request(`/prompts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(response);
  },

  /** GET /prompts/:id/preview — preview resolved template */
  async previewPrompt(
    id: string,
    variables?: Record<string, string>,
  ): Promise<string> {
    const query = variables
      ? `?variables=${encodeURIComponent(JSON.stringify(variables))}`
      : '';
    const response = await request(
      `/prompts/${encodeURIComponent(id)}/preview${query}`,
    );
    const data = await handleResponse<{ resolvedTemplate: string }>(response);
    return data.resolvedTemplate;
  },

  /** POST /jobs — submit a new job (multipart/form-data) */
  async submitJob(formData: FormData): Promise<JobCreated> {
    const response = await request('/jobs', {
      method: 'POST',
      body: formData,
    });
    return handleResponse<JobCreated>(response);
  },

  /** GET /jobs/:id — get job status/details */
  async getJobStatus(id: string): Promise<Job> {
    const response = await request(`/jobs/${encodeURIComponent(id)}`);
    return handleResponse<Job>(response);
  },

  /** GET /jobs/:id/result-image — get result image blob */
  async getJobImage(id: string): Promise<Blob> {
    const response = await request(
      `/jobs/${encodeURIComponent(id)}/result-image`,
    );
    return handleBlobResponse(response);
  },
};

export default api;
export { ApiError };
