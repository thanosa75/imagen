const authMiddleware = require('../../src/middleware/auth');

describe('authMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { path: '/jobs', headers: {} };
    res = {
      statusCode: null,
      jsonBody: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.jsonBody = body; return this; }
    };
    next = jest.fn();
  });

  test('allows health check without auth', () => {
    req.path = '/health';
    process.env.API_KEY = 'secret';
    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  test('returns 500 when API_KEY is not configured', () => {
    const originalKey = process.env.API_KEY;
    process.env.API_KEY = '';
    // Re-require to pick up new env value
    jest.resetModules();
    const auth = require('../../src/middleware/auth');
    auth(req, res, next);
    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.error.code).toBe('SERVER_CONFIG_ERROR');
    expect(next).not.toHaveBeenCalled();
    process.env.API_KEY = originalKey;
  });

  test('returns 401 when API key is missing', () => {
    process.env.API_KEY = 'secret';
    jest.resetModules();
    const auth = require('../../src/middleware/auth');
    auth(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody.error.code).toBe('UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when API key is wrong length', () => {
    process.env.API_KEY = 'secret';
    req.headers['x-api-key'] = 'wrong';
    jest.resetModules();
    const auth = require('../../src/middleware/auth');
    auth(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when API key is incorrect', () => {
    process.env.API_KEY = 'secret-key-123';
    req.headers['x-api-key'] = 'secret-key-999';
    jest.resetModules();
    const auth = require('../../src/middleware/auth');
    auth(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next when API key is correct', () => {
    process.env.API_KEY = 'correct-key';
    req.headers['x-api-key'] = 'correct-key';
    jest.resetModules();
    const auth = require('../../src/middleware/auth');
    auth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });
});
