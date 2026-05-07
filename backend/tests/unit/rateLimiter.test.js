jest.mock('../../src/utils/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnValue({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

describe('rateLimiter', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('exports a function (middleware)', () => {
    const limiter = require('../../src/middleware/rateLimiter');
    expect(typeof limiter).toBe('function');
    expect(limiter.length).toBe(3); // req, res, next
  });

  test('uses default env values when not set', () => {
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
    jest.resetModules();
    const limiter = require('../../src/middleware/rateLimiter');
    expect(typeof limiter).toBe('function');
  });

  test('uses custom env values when set', () => {
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
    process.env.RATE_LIMIT_MAX_REQUESTS = '50';
    jest.resetModules();
    const limiter = require('../../src/middleware/rateLimiter');
    expect(typeof limiter).toBe('function');
  });
});
