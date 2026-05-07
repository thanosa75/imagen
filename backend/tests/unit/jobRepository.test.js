const jobRepository = require('../../src/repositories/jobRepository');

// Mock Redis client with MULTI/EXEC support
const mockStore = {};
const mockSets = {};
const mockZSets = {};

const mockMulti = {
  hSet: jest.fn().mockReturnThis(),
  sAdd: jest.fn().mockReturnThis(),
  sRem: jest.fn().mockReturnThis(),
  sMove: jest.fn().mockReturnThis(),
  zAdd: jest.fn().mockReturnThis(),
  zRem: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  del: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedisClient = {
  multi: jest.fn(() => mockMulti),
  hSet: jest.fn(async (key, value) => {
    if (!mockStore[key]) mockStore[key] = {};
    Object.assign(mockStore[key], value);
    return 1;
  }),
  hGetAll: jest.fn(async (key) => mockStore[key] || {}),
  sAdd: jest.fn(async (key, value) => {
    if (!mockSets[key]) mockSets[key] = new Set();
    mockSets[key].add(value);
    return 1;
  }),
  sRem: jest.fn(async (key, value) => {
    if (mockSets[key]) mockSets[key].delete(value);
    return 1;
  }),
  sMembers: jest.fn(async (key) => {
    if (!mockSets[key]) return [];
    return Array.from(mockSets[key]);
  }),
  sMove: jest.fn(async (src, dest, member) => {
    if (mockSets[src]) mockSets[src].delete(member);
    if (!mockSets[dest]) mockSets[dest] = new Set();
    mockSets[dest].add(member);
    return 1;
  }),
  del: jest.fn(async (key) => {
    delete mockStore[key];
    return 1;
  }),
  exists: jest.fn(async (key) => (mockStore[key] ? 1 : 0)),
  zRangeByScore: jest.fn(async (key, min, max) => {
    if (!mockZSets[key]) return [];
    return mockZSets[key].filter(i => i.score >= min && i.score <= max).map(i => i.value);
  }),
};

jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn(() => mockRedisClient),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('jobRepository', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
    Object.keys(mockSets).forEach(k => delete mockSets[k]);
    Object.keys(mockZSets).forEach(k => delete mockZSets[k]);
    jest.clearAllMocks();
  });

  test('createJob uses multi/exec for atomic transaction', async () => {
    const jobData = {
      jobId: 'test-job-1',
      promptId: 'prompt-1',
      expectedOutcome: 'text',
      imageMimeType: 'image/jpeg',
      imagePath: '/tmp/test.jpg'
    };

    const result = await jobRepository.createJob(jobData);
    expect(result).toHaveProperty('jobId', 'test-job-1');
    expect(result).toHaveProperty('status', 'pending');
    expect(mockRedisClient.multi).toHaveBeenCalled();
    expect(mockMulti.exec).toHaveBeenCalled();
  });

  test('getJobById returns null for unknown job', async () => {
    const job = await jobRepository.getJobById('unknown');
    expect(job).toBeNull();
  });

  test('getJobById returns parsed job data', async () => {
    mockStore['job:test-job-2'] = {
      jobId: 'test-job-2',
      status: 'completed',
      variables: JSON.stringify({ color: 'red' }),
      processingTime: '1500'
    };

    const job = await jobRepository.getJobById('test-job-2');
    expect(job).toBeTruthy();
    expect(job.status).toBe('completed');
    expect(job.variables).toEqual({ color: 'red' });
    expect(job.processingTime).toBe(1500);
  });

  test('updateJobStatus uses multi/exec', async () => {
    mockStore['job:test-job-3'] = { jobId: 'test-job-3', status: 'pending' };
    mockSets['jobs:status:pending'] = new Set(['test-job-3']);

    await jobRepository.updateJobStatus('test-job-3', 'processing', 'pending');
    expect(mockRedisClient.multi).toHaveBeenCalled();
    expect(mockMulti.exec).toHaveBeenCalled();
  });

  test('deleteJob removes job from all indexes', async () => {
    mockStore['job:test-job-4'] = { jobId: 'test-job-4', status: 'pending' };
    mockSets['jobs:status:pending'] = new Set(['test-job-4']);

    const result = await jobRepository.deleteJob('test-job-4');
    expect(result).toBe(true);
    expect(mockRedisClient.multi).toHaveBeenCalled();
    expect(mockMulti.exec).toHaveBeenCalled();
  });

  test('deleteJob returns false for non-existent job', async () => {
    const result = await jobRepository.deleteJob('non-existent');
    expect(result).toBe(false);
  });

  test('jobExists returns true for existing job', async () => {
    mockStore['job:test-job-5'] = { jobId: 'test-job-5' };
    const exists = await jobRepository.jobExists('test-job-5');
    expect(exists).toBe(true);
  });

  test('jobExists returns false for missing job', async () => {
    const exists = await jobRepository.jobExists('missing');
    expect(exists).toBe(false);
  });

  test('cleanupGhostJobs removes stale entries', async () => {
    mockZSets['jobs:index'] = [
      { score: Date.now() - 100000000, value: 'old-job-1' },
      { score: Date.now(), value: 'new-job-1' }
    ];
    mockStore['job:new-job-1'] = { jobId: 'new-job-1' };
    // old-job-1 does not exist in store -> ghost

    await jobRepository.cleanupGhostJobs(1);
    expect(mockRedisClient.multi).toHaveBeenCalled();
  });
});
