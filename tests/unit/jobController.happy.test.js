const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const { EventEmitter } = require('events');

process.env.API_KEY='***';
process.env.GEMINI_API_KEY='***';

// Mock Redis with full in-memory simulation
const mockRedisClient = {
  store: {},
  sets: {},
  lists: {},
  zsets: {},
  connect: jest.fn().mockResolvedValue(),
  on: jest.fn(),
  quit: jest.fn().mockResolvedValue(),
  isOpen: true,

  multi: jest.fn(function() {
    const commands = [];
    const chain = {
      hSet: jest.fn(function(...args) { commands.push(['hSet', ...args]); return this; }),
      sAdd: jest.fn(function(...args) { commands.push(['sAdd', ...args]); return this; }),
      sRem: jest.fn(function(...args) { commands.push(['sRem', ...args]); return this; }),
      sMove: jest.fn(function(...args) { commands.push(['sMove', ...args]); return this; }),
      zAdd: jest.fn(function(...args) { commands.push(['zAdd', ...args]); return this; }),
      zRem: jest.fn(function(...args) { commands.push(['zRem', ...args]); return this; }),
      zRangeByScore: jest.fn(function(...args) { commands.push(['zRangeByScore', ...args]); return this; }),
      expire: jest.fn(function(...args) { commands.push(['expire', ...args]); return this; }),
      del: jest.fn(function(...args) { commands.push(['del', ...args]); return this; }),
      exec: jest.fn(async () => {
        for (const cmd of commands) {
          const [name, ...args] = cmd;
          if (name === 'hSet') {
            const [key, value] = args;
            if (!mockRedisClient.store[key]) mockRedisClient.store[key] = {};
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              Object.assign(mockRedisClient.store[key], value);
            } else {
              mockRedisClient.store[key][value] = args[2];
            }
          } else if (name === 'sAdd') {
            const [key, member] = args;
            if (!mockRedisClient.sets[key]) mockRedisClient.sets[key] = new Set();
            mockRedisClient.sets[key].add(member);
          } else if (name === 'sRem') {
            const [key, member] = args;
            if (mockRedisClient.sets[key]) mockRedisClient.sets[key].delete(member);
          } else if (name === 'sMove') {
            const [source, dest, member] = args;
            if (mockRedisClient.sets[source]) mockRedisClient.sets[source].delete(member);
            if (!mockRedisClient.sets[dest]) mockRedisClient.sets[dest] = new Set();
            mockRedisClient.sets[dest].add(member);
          } else if (name === 'zAdd') {
            const [key, item] = args;
            if (!mockRedisClient.zsets[key]) mockRedisClient.zsets[key] = [];
            mockRedisClient.zsets[key].push(item);
          } else if (name === 'zRem') {
            const [key, member] = args;
            if (mockRedisClient.zsets[key]) {
              mockRedisClient.zsets[key] = mockRedisClient.zsets[key].filter(i => i.value !== member);
            }
          } else if (name === 'del') {
            const [key] = args;
            delete mockRedisClient.store[key];
          }
        }
        return [];
      }),
    };
    return chain;
  }),

  hSet: jest.fn(async (key, value) => {
    if (!mockRedisClient.store[key]) mockRedisClient.store[key] = {};
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(mockRedisClient.store[key], value);
    } else {
      mockRedisClient.store[key][value] = arguments[2];
    }
    return 1;
  }),

  hGetAll: jest.fn(async (key) => mockRedisClient.store[key] || {}),

  sAdd: jest.fn(async (key, value) => {
    if (!mockRedisClient.sets[key]) mockRedisClient.sets[key] = new Set();
    mockRedisClient.sets[key].add(value);
    return 1;
  }),

  sRem: jest.fn(async (key, value) => {
    if (mockRedisClient.sets[key]) mockRedisClient.sets[key].delete(value);
    return 1;
  }),

  sMembers: jest.fn(async (key) => {
    if (!mockRedisClient.sets[key]) return [];
    return Array.from(mockRedisClient.sets[key]);
  }),

  sMove: jest.fn(async (source, destination, member) => {
    if (mockRedisClient.sets[source]) mockRedisClient.sets[source].delete(member);
    if (!mockRedisClient.sets[destination]) mockRedisClient.sets[destination] = new Set();
    mockRedisClient.sets[destination].add(member);
    return 1;
  }),

  lPush: jest.fn(async (key, value) => {
    if (!mockRedisClient.lists[key]) mockRedisClient.lists[key] = [];
    mockRedisClient.lists[key].unshift(value);
    return mockRedisClient.lists[key].length;
  }),

  brPop: jest.fn(async (key, timeout) => {
    if (!mockRedisClient.lists[key] || mockRedisClient.lists[key].length === 0) return null;
    const value = mockRedisClient.lists[key].pop();
    return { key, element: value };
  }),

  rPop: jest.fn(async (key) => {
    if (!mockRedisClient.lists[key] || mockRedisClient.lists[key].length === 0) return null;
    return mockRedisClient.lists[key].pop();
  }),

  lLen: jest.fn(async (key) => mockRedisClient.lists[key]?.length || 0),

  lRange: jest.fn(async (key, start, end) => mockRedisClient.lists[key] || []),

  lRem: jest.fn(async (key, count, element) => {
    if (!mockRedisClient.lists[key]) return 0;
    const before = mockRedisClient.lists[key].length;
    mockRedisClient.lists[key] = mockRedisClient.lists[key].filter(i => i !== element);
    return before - mockRedisClient.lists[key].length;
  }),

  brPopLPush: jest.fn(async () => null),

  expire: jest.fn().mockResolvedValue(true),

  del: jest.fn(async (key) => {
    delete mockRedisClient.store[key];
    return 1;
  }),

  exists: jest.fn(async (key) => (mockRedisClient.store[key] ? 1 : 0)),

  zRangeByScore: jest.fn(async (key, min, max) => {
    if (!mockRedisClient.zsets[key]) return [];
    return mockRedisClient.zsets[key]
      .filter(i => i.score >= min && i.score <= max)
      .map(i => i.value);
  }),
};

jest.mock('../../src/config/redis', () => ({
  initRedis: jest.fn().mockResolvedValue(mockRedisClient),
  getRedisClient: jest.fn().mockReturnValue(mockRedisClient),
  closeRedis: jest.fn().mockResolvedValue(),
  isConnected: jest.fn().mockReturnValue(true)
}));

jest.mock('../../src/services/geminiService');
jest.mock('../../src/services/promptService');

const promptService = require('../../src/services/promptService');
const app = require('../../src/app');
const { getJobById } = require('../../src/repositories/jobRepository');

describe('Job Controller Happy Paths', () => {
  let testImagePath;
  let resultImagePath;

  beforeAll(() => {
    testImagePath = path.join(__dirname, '..', 'test-image-happy.jpg');
    fs.writeFileSync(testImagePath, 'dummy image content');

    resultImagePath = path.join(__dirname, '..', 'result-image.jpg');
    fs.writeFileSync(resultImagePath, 'result image content');

    promptService.getPromptById.mockResolvedValue({
      id: 'test-prompt',
      name: 'Test',
      template: 'Test',
      requiredVariables: [],
      supportedOutcomes: ['text', 'image']
    });

    promptService.getPrompts.mockResolvedValue([
      {
        id: 'prompt-1',
        name: 'Prompt One',
        description: 'First prompt',
        requiredVariables: ['var1'],
        supportedOutcomes: ['text', 'image']
      },
      {
        id: 'prompt-2',
        name: 'Prompt Two',
        description: 'Second prompt',
        requiredVariables: [],
        supportedOutcomes: ['text']
      }
    ]);
  });

  afterAll(() => {
    if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);
    if (fs.existsSync(resultImagePath)) fs.unlinkSync(resultImagePath);
  });

  beforeEach(() => {
    mockRedisClient.store = {};
    mockRedisClient.sets = {};
    mockRedisClient.lists = {};
    mockRedisClient.zsets = {};
    jest.clearAllMocks();
  });

  test('POST /jobs with image file returns 201 and creates job', async () => {
    const res = await request(app)
      .post('/jobs')
      .set('x-api-key', process.env.API_KEY)
      .field('promptId', 'test-prompt')
      .field('expectedOutcome', 'image')
      .attach('image', testImagePath);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('jobId');
    expect(res.body.status).toBe('pending');
    expect(res.body).toHaveProperty('createdAt');

    const jobId = res.body.jobId;
    const job = await getJobById(jobId);
    expect(job).toBeTruthy();
    expect(job.promptId).toBe('test-prompt');
    expect(job.expectedOutcome).toBe('image');
    expect(job.status).toBe('pending');

    // Verify queue has the job
    expect(mockRedisClient.lists['queue:jobs']).toContain(jobId);

    // Cleanup uploaded file
    if (job.imagePath && fs.existsSync(job.imagePath)) {
      fs.unlinkSync(job.imagePath);
    }
  });

  test('GET /jobs/:id returns status with metadata fields', async () => {
    const jobId = 'test-job-with-metadata';
    mockRedisClient.store[`job:${jobId}`] = {
      jobId,
      status: 'completed',
      promptId: 'test-prompt',
      expectedOutcome: 'text',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      resultText: 'Mocked result',
      processingTime: '1234',
      promptUsed: 'resolved prompt text',
      modelVersion: 'gemini-1.5'
    };

    const res = await request(app)
      .get(`/jobs/${jobId}`)
      .set('x-api-key', process.env.API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(jobId);
    expect(res.body.status).toBe('completed');
    expect(res.body.metadata).toEqual({
      processingTime: 1234,
      promptUsed: 'resolved prompt text',
      modelVersion: 'gemini-1.5'
    });
    expect(res.body.result).toEqual({ text: 'Mocked result' });
  });

  test('GET /jobs/:id returns failed job with error details', async () => {
    const jobId = 'test-failed-job';
    mockRedisClient.store[`job:${jobId}`] = {
      jobId,
      status: 'failed',
      promptId: 'test-prompt',
      expectedOutcome: 'text',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      errorMessage: 'Something went wrong',
      errorCode: 'PROCESSING_ERROR'
    };

    const res = await request(app)
      .get(`/jobs/${jobId}`)
      .set('x-api-key', process.env.API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toEqual({
      message: 'Something went wrong',
      code: 'PROCESSING_ERROR'
    });
  });

  test('GET /jobs/:id/result-image streams image for completed job', async () => {
    const jobId = 'test-image-job';
    mockRedisClient.store[`job:${jobId}`] = {
      jobId,
      status: 'completed',
      promptId: 'test-prompt',
      expectedOutcome: 'image',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      resultImagePath,
      imageMimeType: 'image/jpeg'
    };

    const res = await request(app)
      .get(`/jobs/${jobId}/result-image`)
      .set('x-api-key', process.env.API_KEY);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.toString()).toBe('result image content');
  });

  test('GET /jobs/:id/result-image returns 400 when expectedOutcome is not image', async () => {
    const jobId = 'test-text-job';
    mockRedisClient.store[`job:${jobId}`] = {
      jobId,
      status: 'completed',
      promptId: 'test-prompt',
      expectedOutcome: 'text',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    const res = await request(app)
      .get(`/jobs/${jobId}/result-image`)
      .set('x-api-key', process.env.API_KEY);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_OUTCOME_TYPE');
  });

  test('GET /jobs/:id/result-image returns 409 when job is processing', async () => {
    const jobId = 'test-processing-job';
    mockRedisClient.store[`job:${jobId}`] = {
      jobId,
      status: 'processing',
      promptId: 'test-prompt',
      expectedOutcome: 'image',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await request(app)
      .get(`/jobs/${jobId}/result-image`)
      .set('x-api-key', process.env.API_KEY);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('JOB_NOT_COMPLETED');
  });

  test('GET /jobs/:id/result-image returns 404 when job failed', async () => {
    const jobId = 'test-failed-image-job';
    mockRedisClient.store[`job:${jobId}`] = {
      jobId,
      status: 'failed',
      promptId: 'test-prompt',
      expectedOutcome: 'image',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      errorMessage: 'Processing failed',
      errorCode: 'PROCESSING_ERROR'
    };

    const res = await request(app)
      .get(`/jobs/${jobId}/result-image`)
      .set('x-api-key', process.env.API_KEY);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('JOB_FAILED');
  });

  test('GET /jobs/:id/result-image returns 404 when result image is missing', async () => {
    const jobId = 'test-missing-image-job';
    mockRedisClient.store[`job:${jobId}`] = {
      jobId,
      status: 'completed',
      promptId: 'test-prompt',
      expectedOutcome: 'image',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      resultImagePath: '/nonexistent/path/result.jpg',
      imageMimeType: 'image/jpeg'
    };

    const res = await request(app)
      .get(`/jobs/${jobId}/result-image`)
      .set('x-api-key', process.env.API_KEY);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('IMAGE_NOT_FOUND');
  });

  test('GET /jobs/:id/result-image handles stream error', async () => {
    const jobId = 'test-stream-error-job';
    mockRedisClient.store[`job:${jobId}`] = {
      jobId,
      status: 'completed',
      promptId: 'test-prompt',
      expectedOutcome: 'image',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      resultImagePath,
      imageMimeType: 'image/jpeg'
    };

    const streamSpy = jest.spyOn(fs, 'createReadStream').mockImplementation(() => {
      const stream = new EventEmitter();
      stream.pipe = (dest) => {
        stream.on('data', chunk => dest.write(chunk));
        stream.on('end', () => dest.end());
        return dest;
      };
      stream.destroy = jest.fn();
      process.nextTick(() => stream.emit('error', new Error('Stream read error')));
      return stream;
    });

    const res = await request(app)
      .get(`/jobs/${jobId}/result-image`)
      .set('x-api-key', process.env.API_KEY);

    streamSpy.mockRestore();

    expect(res.status).toBe(500);
  });

  test('GET /prompts/show returns mapped prompt list', async () => {
    const res = await request(app)
      .get('/prompts/show')
      .set('x-api-key', process.env.API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.prompts).toHaveLength(2);
    expect(res.body.prompts[0]).toEqual({
      id: 'prompt-1',
      name: 'Prompt One',
      description: 'First prompt',
      requiredVariables: ['var1'],
      supportedOutcomes: ['text', 'image']
    });
    expect(res.body.prompts[1]).toEqual({
      id: 'prompt-2',
      name: 'Prompt Two',
      description: 'Second prompt',
      requiredVariables: [],
      supportedOutcomes: ['text']
    });
  });
});
