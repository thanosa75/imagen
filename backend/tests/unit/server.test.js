const path = require('path');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../src/config/redis', () => ({
  initRedis: jest.fn().mockResolvedValue(undefined),
  getRedisClient: jest.fn(),
  closeRedis: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
}));

describe('server', () => {
  test('module loads without throwing', () => {
    // The module has an async IIFE — it should load cleanly
    // and set module.exports once Redis connects.
    jest.isolateModules(() => {
      jest.doMock('../../src/app', () => ({
        listen: jest.fn((port, cb) => {
          if (cb) cb();
          return { close: jest.fn(), on: jest.fn() };
        })
      }));
      expect(() => require('../../src/server')).not.toThrow();
    });
  });

  test('starts server and logs on spawn with PORT=0', (done) => {
    if (!process.env.CI && !process.env.REDIS_URL) {
      return done();
    }
    const serverPath = path.join(__dirname, '../../src/server.js');
    const { spawn } = require('child_process');

    const child = spawn('node', [serverPath], {
      env: { ...process.env, PORT: '0' },
      stdio: 'pipe'
    });

    let output = '';
    child.stdout.on('data', (data) => { output += data.toString(); });
    child.stderr.on('data', (data) => { output += data.toString(); });

    const timeout = setTimeout(() => child.kill('SIGTERM'), 3000);

    child.on('exit', () => {
      clearTimeout(timeout);
      expect(output).toContain('Server running on port');
      done();
    });
  }, 10000);
});
