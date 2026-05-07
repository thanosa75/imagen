const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Set test env vars BEFORE importing any app modules
process.env.API_KEY = 'test-api-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';

// Mock Redis configuration BEFORE importing other modules
const mockRedisClient = {
  store: {}, // HASH storage: key -> object
  sets: {},  // SET storage: key -> Set
  lists: {}, // LIST storage: key -> Array
  zsets: {}, // ZSET storage: key -> Array of {score, value}

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

  hGetAll: jest.fn(async (key) => {
    return mockRedisClient.store[key] || {};
  }),

  sAdd: jest.fn(async (key, value) => {
    if (!mockRedisClient.sets[key]) mockRedisClient.sets[key] = new Set();
    mockRedisClient.sets[key].add(value);
    return 1;
  }),

  sRem: jest.fn(async (key, value) => {
    if (mockRedisClient.sets[key]) {
      mockRedisClient.sets[key].delete(value);
    }
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

  // Queue methods (lists)
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

  lLen: jest.fn(async (key) => {
    return mockRedisClient.lists[key]?.length || 0;
  }),

  lRange: jest.fn(async (key, start, end) => {
    return mockRedisClient.lists[key] || [];
  }),

  lRem: jest.fn(async (key, count, element) => {
    if (!mockRedisClient.lists[key]) return 0;
    const before = mockRedisClient.lists[key].length;
    mockRedisClient.lists[key] = mockRedisClient.lists[key].filter(i => i !== element);
    return before - mockRedisClient.lists[key].length;
  }),

  brPopLPush: jest.fn(async (source, dest, timeout) => {
    return null;
  }),

  expire: jest.fn().mockResolvedValue(true),

  del: jest.fn(async (key) => {
    delete mockRedisClient.store[key];
    return 1;
  }),

  exists: jest.fn(async (key) => {
    return mockRedisClient.store[key] ? 1 : 0;
  }),

  zRangeByScore: jest.fn(async (key, min, max) => {
    if (!mockRedisClient.zsets[key]) return [];
    return mockRedisClient.zsets[key]
      .filter(i => i.score >= min && i.score <= max)
      .map(i => i.value);
  }),
};

jest.mock('../src/config/redis', () => ({
  initRedis: jest.fn().mockResolvedValue(mockRedisClient),
  getRedisClient: jest.fn().mockReturnValue(mockRedisClient),
  closeRedis: jest.fn().mockResolvedValue(),
  isConnected: jest.fn().mockReturnValue(true)
}));

// Mock external services
jest.mock('../src/services/geminiService');
jest.mock('../src/services/promptService');

const geminiService = require('../src/services/geminiService');
const promptService = require('../src/services/promptService');
// Import app AFTER mocking
const app = require('../src/app');
const { processJob } = require('../src/workers/jobWorker');
const { getJobById } = require('../src/repositories/jobRepository');

describe('Job Flow Test', () => {
  let testImagePath;

  beforeAll(async () => {
    // Create a dummy test image
    testImagePath = path.join(__dirname, 'test-image-jobflow.jpg');
    fs.writeFileSync(testImagePath, 'dummy image content');

    // Setup mocks
    geminiService.validateImage.mockImplementation(() => {});
    geminiService.processImage.mockResolvedValue({
      success: true,
      outcome: 'text',
      result: {
        text: 'Mocked Gemini response'
      },
      metadata: {
        modelVersion: 'mock-model'
      }
    });

    promptService.getResolvedPrompt.mockResolvedValue({
      prompt: 'Resolved prompt text',
      metadata: {
        promptId: 'test-prompt',
        name: 'Test Prompt'
      }
    });

    promptService.getPromptById.mockResolvedValue({
      id: 'test-prompt',
      name: 'Test Prompt',
      template: 'Test template',
      requiredVariables: [],
      supportedOutcomes: ['text', 'image']
    });

    promptService.getPrompts.mockResolvedValue([
      {
        id: 'test-prompt',
        name: 'Test Prompt',
        description: 'A test prompt',
        requiredVariables: [],
        supportedOutcomes: ['text', 'image']
      }
    ]);
  });

  afterAll(async () => {
    // Cleanup test image
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  beforeEach(() => {
    // Clear mock stores between tests
    mockRedisClient.store = {};
    mockRedisClient.sets = {};
    mockRedisClient.lists = {};
    mockRedisClient.zsets = {};
    jest.clearAllMocks();
  });

  test('POST /jobs should create a job with imagePath and return 201', async () => {
    const response = await request(app)
      .post('/jobs')
      .set('x-api-key', process.env.API_KEY)
      .field('promptId', 'test-prompt')
      .field('expectedOutcome', 'text')
      .attach('image', testImagePath);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('jobId');
    expect(response.body).toHaveProperty('status', 'pending');

    const jobId = response.body.jobId;

    // Verify job in Redis has imagePath
    const jobData = await getJobById(jobId);
    expect(jobData).toBeTruthy();
    expect(jobData.imagePath).toBeTruthy();
    expect(jobData.imagePath).toContain('uploads/');

    // Verify the file exists on disk
    expect(fs.existsSync(jobData.imagePath)).toBe(true);

    // Cleanup uploaded file
    if (jobData.imagePath && fs.existsSync(jobData.imagePath)) {
      fs.unlinkSync(jobData.imagePath);
    }
  });

  test('Worker should process the job successfully', async () => {
    // First create a job to process
    const response = await request(app)
      .post('/jobs')
      .set('x-api-key', process.env.API_KEY)
      .field('promptId', 'test-prompt')
      .field('expectedOutcome', 'text')
      .attach('image', Buffer.from('dummy image content'), 'test-image-jobflow.jpg');

    expect(response.status).toBe(201);
    const jobId = response.body.jobId;

    // Process the job manually
    const result = await processJob(jobId);
    expect(result).toBe(true);

    // Verify job status and results
    const jobData = await getJobById(jobId);
    expect(jobData.status).toBe('completed');
    expect(jobData.resultText).toBe('Mocked Gemini response');

    // Cleanup the uploaded file
    if (jobData.imagePath && fs.existsSync(jobData.imagePath)) {
      fs.unlinkSync(jobData.imagePath);
    }
  });

  test('POST /jobs without image returns 400', async () => {
    const response = await request(app)
      .post('/jobs')
      .set('x-api-key', process.env.API_KEY)
      .field('promptId', 'test-prompt')
      .field('expectedOutcome', 'text');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MISSING_IMAGE');
  });

  test('POST /jobs with invalid promptId returns 400', async () => {
    promptService.getPromptById.mockResolvedValueOnce(null);

    const response = await request(app)
      .post('/jobs')
      .set('x-api-key', process.env.API_KEY)
      .field('promptId', 'nonexistent-prompt')
      .field('expectedOutcome', 'text')
      .attach('image', Buffer.from('dummy image content'), 'test-image-jobflow.jpg');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PROMPT');
  });

  test('GET /jobs/:id returns 404 for unknown job', async () => {
    const response = await request(app)
      .get('/jobs/00000000-0000-0000-0000-000000000000')
      .set('x-api-key', process.env.API_KEY);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('JOB_NOT_FOUND');
  });

  test('GET /prompts/show returns list of prompts', async () => {
    const response = await request(app)
      .get('/prompts/show')
      .set('x-api-key', process.env.API_KEY);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('prompts');
    expect(Array.isArray(response.body.prompts)).toBe(true);
  });

  test('Requests without API key return 401', async () => {
    const response = await request(app)
      .get('/jobs/123')
      .set('x-api-key', 'wrong-key');

    expect(response.status).toBe(401);
  });

  test('Health check returns 200 without API key', async () => {
    const response = await request(app)
      .get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status');
  });

  // Phase 4: Extended integration flows
  test('Worker processes image outcome job and serves result image', async () => {
    // Ensure results directory exists
    const resultsDir = path.join(process.cwd(), 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const imageBase64 = Buffer.from('generated-image-bytes').toString('base64');
    geminiService.processImage.mockResolvedValue({
      success: true,
      outcome: 'image',
      result: { image: imageBase64, mimeType: 'image/png' },
      metadata: { modelVersion: 'mock-model' }
    });

    const response = await request(app)
      .post('/jobs')
      .set('x-api-key', process.env.API_KEY)
      .field('promptId', 'test-prompt')
      .field('expectedOutcome', 'image')
      .attach('image', Buffer.from('dummy image content'), 'test-image-jobflow.jpg');

    expect(response.status).toBe(201);
    const jobId = response.body.jobId;

    // Process the job manually
    const result = await processJob(jobId);
    expect(result).toBe(true);

    // Verify job status
    const jobData = await getJobById(jobId);
    expect(jobData.status).toBe('completed');
    expect(jobData.resultImagePath).toBeTruthy();

    // GET result image
    const imgResponse = await request(app)
      .get(`/jobs/${jobId}/result-image`)
      .set('x-api-key', process.env.API_KEY);

    expect(imgResponse.status).toBe(200);
    expect(imgResponse.headers['content-type']).toBe('image/jpeg');
    expect(imgResponse.body).toBeInstanceOf(Buffer);

    // Cleanup
    if (jobData.imagePath && fs.existsSync(jobData.imagePath)) {
      fs.unlinkSync(jobData.imagePath);
    }
    if (jobData.resultImagePath && fs.existsSync(jobData.resultImagePath)) {
      fs.unlinkSync(jobData.resultImagePath);
    }
  });

  test('Job retries on retryable error then succeeds', async () => {
    const { RetryableGeminiError } = require('../src/errors/GeminiErrors');
    let callCount = 0;
    geminiService.processImage.mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.reject(new RetryableGeminiError('rate limit', 'RATE_LIMIT'));
      }
      return Promise.resolve({
        success: true,
        outcome: 'text',
        result: { text: 'Success after retries' },
        metadata: { modelVersion: 'mock-model' }
      });
    });

    const response = await request(app)
      .post('/jobs')
      .set('x-api-key', process.env.API_KEY)
      .field('promptId', 'test-prompt')
      .field('expectedOutcome', 'text')
      .attach('image', Buffer.from('dummy image content'), 'test-image-jobflow.jpg');

    expect(response.status).toBe(201);
    const jobId = response.body.jobId;

    // First attempt fails retryable -> requeued
    let result = await processJob(jobId);
    expect(result).toBe(false);

    let jobData = await getJobById(jobId);
    expect(jobData.status).toBe('pending'); // requeued

    // Second attempt fails retryable -> requeued
    result = await processJob(jobId);
    expect(result).toBe(false);

    jobData = await getJobById(jobId);
    expect(jobData.status).toBe('pending');

    // Third attempt succeeds
    result = await processJob(jobId);
    expect(result).toBe(true);

    jobData = await getJobById(jobId);
    expect(jobData.status).toBe('completed');
    expect(jobData.resultText).toBe('Success after retries');

    // Cleanup
    if (jobData.imagePath && fs.existsSync(jobData.imagePath)) {
      fs.unlinkSync(jobData.imagePath);
    }
  });

  test('Job fails on non-retryable error', async () => {
    const { FatalGeminiError } = require('../src/errors/GeminiErrors');
    geminiService.processImage.mockRejectedValue(
      new FatalGeminiError('bad request', 'BAD_REQUEST')
    );

    const response = await request(app)
      .post('/jobs')
      .set('x-api-key', process.env.API_KEY)
      .field('promptId', 'test-prompt')
      .field('expectedOutcome', 'text')
      .attach('image', Buffer.from('dummy image content'), 'test-image-jobflow.jpg');

    expect(response.status).toBe(201);
    const jobId = response.body.jobId;

    const result = await processJob(jobId);
    expect(result).toBe(false);

    const jobData = await getJobById(jobId);
    expect(jobData.status).toBe('failed');
    expect(jobData.errorMessage).toBe('bad request');
    expect(jobData.errorCode).toBe('BAD_REQUEST');

    // Verify GET returns error details
    const statusResponse = await request(app)
      .get(`/jobs/${jobId}`)
      .set('x-api-key', process.env.API_KEY);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.error).toEqual({
      message: 'bad request',
      code: 'BAD_REQUEST'
    });

    // Cleanup
    if (jobData.imagePath && fs.existsSync(jobData.imagePath)) {
      fs.unlinkSync(jobData.imagePath);
    }
  });
});
