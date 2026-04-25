const request = require('supertest');
const fs = require('fs');
const path = require('path');

process.env.API_KEY='***';
process.env.GEMINI_API_KEY='***';

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
    return {
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
  sRem: jest.fn().mockResolvedValue(1),
  sMembers: jest.fn().mockResolvedValue([]),
  sMove: jest.fn().mockResolvedValue(1),
  lPush: jest.fn(async (key, value) => {
    if (!mockRedisClient.lists[key]) mockRedisClient.lists[key] = [];
    mockRedisClient.lists[key].unshift(value);
    return mockRedisClient.lists[key].length;
  }),
  brPop: jest.fn().mockResolvedValue(null),
  rPop: jest.fn().mockResolvedValue(null),
  lLen: jest.fn().mockResolvedValue(0),
  lRange: jest.fn().mockResolvedValue([]),
  lRem: jest.fn().mockResolvedValue(0),
  brPopLPush: jest.fn().mockResolvedValue(null),
  expire: jest.fn().mockResolvedValue(true),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  zRangeByScore: jest.fn().mockResolvedValue([]),
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

describe('Routes Tests', () => {
  beforeAll(() => {
    promptService.getPromptById.mockResolvedValue({
      id: 'test-prompt',
      name: 'Test',
      template: 'Test',
      requiredVariables: [],
      supportedOutcomes: ['text', 'image']
    });

    promptService.getPrompts.mockResolvedValue([
      {
        id: 'p1',
        name: 'Prompt 1',
        description: 'Desc 1',
        requiredVariables: [],
        supportedOutcomes: ['text']
      }
    ]);
  });

  beforeEach(() => {
    mockRedisClient.store = {};
    mockRedisClient.sets = {};
    mockRedisClient.lists = {};
    mockRedisClient.zsets = {};
    jest.clearAllMocks();
  });

  describe('jobRoutes', () => {
    test('POST /jobs rejects invalid file type with multer error (line 42)', async () => {
      const txtPath = path.join(__dirname, '..', 'invalid-file.txt');
      fs.writeFileSync(txtPath, 'not an image');

      const res = await request(app)
        .post('/jobs')
        .set('x-api-key', process.env.API_KEY)
        .field('promptId', 'test-prompt')
        .field('expectedOutcome', 'text')
        .attach('image', txtPath);

      fs.unlinkSync(txtPath);

      // Multer fileFilter error propagates to centralized errorHandler
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });

  });

  describe('promptRoutes', () => {
    test('GET /prompts/show returns mapped prompts', async () => {
      const res = await request(app)
        .get('/prompts/show')
        .set('x-api-key', process.env.API_KEY);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('prompts');
      expect(Array.isArray(res.body.prompts)).toBe(true);
      expect(res.body.prompts).toHaveLength(1);
      expect(res.body.prompts[0]).toMatchObject({
        id: 'p1',
        name: 'Prompt 1',
        description: 'Desc 1',
        requiredVariables: [],
        supportedOutcomes: ['text']
      });
    });
  });
});
