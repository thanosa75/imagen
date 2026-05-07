// Set test env vars BEFORE importing any app modules
process.env.API_KEY = 'test-api-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';

// Mock Redis — from existing test convention
jest.mock('../src/config/redis', () => ({
  getRedisClient: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
}));

const request = require('supertest');
const app = require('../src/app');
const promptService = require('../src/services/promptService');

describe('Prompt CRUD API', () => {
  const testPrompt = {
    id: 'test-crud-prompt',
    name: 'Test CRUD Prompt',
    description: 'A prompt created by integration test',
    template: 'Analyze {{aspect}} in this image. Focus on {{detail}}.',
    supportedOutcomes: ['text'],
    requiredVariables: ['aspect'],
    defaultVariables: { aspect: 'colors', detail: 'main subject' },
  };

  afterAll(async () => {
    try {
      await promptService.deletePrompt('test-crud-prompt');
      await promptService.deletePrompt('test-updated-prompt');
    } catch { /* ignore */ }
  });

  it('GET /prompts/show — returns list of prompts', async () => {
    const res = await request(app)
      .get('/prompts/show')
      .set('x-api-key', 'test-api-key');

    expect(res.status).toBe(200);
    expect(res.body.prompts).toBeDefined();
    expect(Array.isArray(res.body.prompts)).toBe(true);
    if (res.body.prompts.length > 0) {
      expect(res.body.prompts[0].template).toBeUndefined();
    }
  });

  it('POST /prompts — creates a new prompt', async () => {
    const res = await request(app)
      .post('/prompts')
      .set('x-api-key', 'test-api-key')
      .send(testPrompt);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('test-crud-prompt');
    expect(res.body.template).toBe(testPrompt.template);
  });

  it('POST /prompts — rejects duplicate id', async () => {
    const res = await request(app)
      .post('/prompts')
      .set('x-api-key', 'test-api-key')
      .send(testPrompt);

    expect(res.status).toBe(409);
  });

  it('GET /prompts/:id — returns full prompt', async () => {
    const res = await request(app)
      .get('/prompts/test-crud-prompt')
      .set('x-api-key', 'test-api-key');

    expect(res.status).toBe(200);
    expect(res.body.template).toBe(testPrompt.template);
    expect(res.body.defaultVariables).toEqual(testPrompt.defaultVariables);
  });

  it('GET /prompts/:id/preview — resolves template with defaults', async () => {
    const res = await request(app)
      .get('/prompts/test-crud-prompt/preview')
      .set('x-api-key', 'test-api-key');

    expect(res.status).toBe(200);
    expect(res.body.resolvedTemplate).toContain('Analyze colors');
    expect(res.body.resolvedTemplate).toContain('Focus on main subject');
  });

  it('GET /prompts/:id/preview — overrides defaults with query variables', async () => {
    const res = await request(app)
      .get('/prompts/test-crud-prompt/preview?variables={"aspect":"shapes"}')
      .set('x-api-key', 'test-api-key');

    expect(res.status).toBe(200);
    expect(res.body.resolvedTemplate).toContain('Analyze shapes');
  });

  it('PUT /prompts/:id — updates the prompt', async () => {
    const res = await request(app)
      .put('/prompts/test-crud-prompt')
      .set('x-api-key', 'test-api-key')
      .send({ ...testPrompt, name: 'Updated Prompt', id: 'test-crud-prompt' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Prompt');
  });

  it('DELETE /prompts/:id — deletes the prompt', async () => {
    const res = await request(app)
      .delete('/prompts/test-crud-prompt')
      .set('x-api-key', 'test-api-key');

    expect(res.status).toBe(204);
  });

  it('DELETE /prompts/:id — is idempotent', async () => {
    const res = await request(app)
      .delete('/prompts/test-crud-prompt')
      .set('x-api-key', 'test-api-key');

    expect(res.status).toBe(204);
  });

  it('GET /prompts/:id — returns 404 for deleted prompt', async () => {
    const res = await request(app)
      .get('/prompts/test-crud-prompt')
      .set('x-api-key', 'test-api-key');

    expect(res.status).toBe(404);
  });

  it('POST /prompts — validates kebab-case id', async () => {
    const res = await request(app)
      .post('/prompts')
      .set('x-api-key', 'test-api-key')
      .send({ ...testPrompt, id: 'Bad ID!' });

    expect(res.status).toBe(400);
  });

  it('POST /prompts — validates required fields', async () => {
    const res = await request(app)
      .post('/prompts')
      .set('x-api-key', 'test-api-key')
      .send({ id: 'bare-min' });

    expect(res.status).toBe(400);
  });
});