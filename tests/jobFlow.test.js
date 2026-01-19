const request = require('supertest');
const fs = require('fs');
const path = require('path');

// Mock Redis configuration BEFORE importing other modules
const mockRedisClient = {
  store: {}, // HASH storage: key -> object
  sets: {},  // SET storage: key -> Set
  
  connect: jest.fn().mockResolvedValue(),
  on: jest.fn(),
  quit: jest.fn().mockResolvedValue(),
  isOpen: true,

  hSet: jest.fn(async (key, value) => {
    if (!mockRedisClient.store[key]) mockRedisClient.store[key] = {};
    Object.assign(mockRedisClient.store[key], value);
    return Object.keys(value).length;
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

  // Queue methods (lists)
  lPush: jest.fn(async (key, value) => {
    return 1; // Return queue length
  }),

  brPop: jest.fn(async (key, timeout) => {
    return null; // Simulate empty or timeout
  }),

  rPop: jest.fn(async (key) => {
    return null;
  }),

  lLen: jest.fn(async (key) => {
    return 0;
  }),

  lRange: jest.fn(async (key, start, end) => {
    return [];
  }),

  lRem: jest.fn(async (key, count, element) => {
    return 0;
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

  // For job status updates (sMove is used)
  sMove: jest.fn(async (source, destination, member) => {
    if (mockRedisClient.sets[source]) mockRedisClient.sets[source].delete(member);
    if (!mockRedisClient.sets[destination]) mockRedisClient.sets[destination] = new Set();
    mockRedisClient.sets[destination].add(member);
    return 1;
  })
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
    testImagePath = path.join(__dirname, 'test-image.jpg');
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
  });

  afterAll(async () => {
    // Cleanup test image
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  });

  // Reset redis mock store between tests if needed, or just let it accumulate
  beforeEach(() => {
    // Optional: Clear store
    // mockRedisClient.store = {};
    // mockRedisClient.sets = {};
  });

  test('POST /jobs should create a job with imagePath and return 201', async () => {
    const response = await request(app)
      .post('/jobs')
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
    
    // Cleanup uploaded file will happen in next test or manual cleanup
    if (jobData.imagePath && fs.existsSync(jobData.imagePath)) {
        // Don't delete yet, needed for next test? 
        // Actually, integration tests usually run independently, 
        // but here we are simulating flow. 
        // We can let the worker test create its own job.
        fs.unlinkSync(jobData.imagePath);
    }
  });

  test('Worker should process the job successfully', async () => {
    // First create a job to process
    const response = await request(app)
      .post('/jobs')
      .field('promptId', 'test-prompt')
      .field('expectedOutcome', 'text')
      .attach('image', testImagePath);
      
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
});
