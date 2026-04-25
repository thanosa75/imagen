const request = require('supertest');
const fs = require('fs');
const path = require('path');

process.env.API_KEY = 'test-api-key';

// Mock Redis with multi/exec support
const mockRedisClient = {
  store: {},
  sets: {},
  multi: jest.fn(function() {
    const chain = {
      hSet: jest.fn().mockReturnThis(),
      sAdd: jest.fn().mockReturnThis(),
      zAdd: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    return chain;
  }),
  hGetAll: jest.fn(async (key) => mockRedisClient.store[key] || {}),
  hSet: jest.fn(async (key, value) => {
    if (!mockRedisClient.store[key]) mockRedisClient.store[key] = {};
    Object.assign(mockRedisClient.store[key], value);
    return 1;
  }),
  sAdd: jest.fn(async (key, value) => {
    if (!mockRedisClient.sets[key]) mockRedisClient.sets[key] = new Set();
    mockRedisClient.sets[key].add(value);
    return 1;
  }),
  sRem: jest.fn().mockResolvedValue(1),
  sMembers: jest.fn().mockResolvedValue([]),
  sMove: jest.fn().mockResolvedValue(1),
  lPush: jest.fn().mockResolvedValue(1),
  brPop: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(true),
};

jest.mock('../../src/config/redis', () => ({
  initRedis: jest.fn().mockResolvedValue(mockRedisClient),
  getRedisClient: jest.fn().mockReturnValue(mockRedisClient),
  closeRedis: jest.fn().mockResolvedValue(),
  isConnected: jest.fn().mockReturnValue(true),
}));

jest.mock('../../src/services/geminiService');
jest.mock('../../src/services/promptService');

const promptService = require('../../src/services/promptService');
const app = require('../../src/app');

describe('Job Controller Error Paths', () => {
  let testImagePath;

  beforeAll(() => {
    testImagePath = path.join(__dirname, '..', 'test-image-error.jpg');
    fs.writeFileSync(testImagePath, 'dummy image content');

    promptService.getPromptById.mockResolvedValue({
      id: 'test-prompt',
      name: 'Test',
      template: 'Test',
      requiredVariables: [],
      supportedOutcomes: ['text', 'image']
    });

    promptService.getPrompts.mockResolvedValue([]);
  });

  afterAll(() => {
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  beforeEach(() => {
    mockRedisClient.store = {};
    mockRedisClient.sets = {};
    jest.clearAllMocks();
  });

  test('POST /jobs without image returns 400', async () => {
    const res = await request(app)
      .post('/jobs')
      .set('x-api-key', process.env.API_KEY)
      .field('promptId', 'test-prompt')
      .field('expectedOutcome', 'text');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IMAGE');
  });

  test('GET /jobs/:id returns 404 for unknown job', async () => {
    const res = await request(app)
      .get('/jobs/00000000-0000-0000-0000-000000000000')
      .set('x-api-key', process.env.API_KEY);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
  });

  test('GET /jobs/:id/result-image returns 404 for unknown job', async () => {
    const res = await request(app)
      .get('/jobs/00000000-0000-0000-0000-000000000000/result-image')
      .set('x-api-key', process.env.API_KEY);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_NOT_FOUND');
  });

  test('POST /jobs with invalid promptId returns 400 before file cleanup', async () => {
    promptService.getPromptById.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/jobs')
      .set('x-api-key', process.env.API_KEY)
      .field('promptId', 'bad-prompt')
      .field('expectedOutcome', 'text')
      .attach('image', testImagePath);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PROMPT');
  });

  test('GET non-existent route returns 404', async () => {
    const res = await request(app)
      .get('/nonexistent')
      .set('x-api-key', process.env.API_KEY);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
