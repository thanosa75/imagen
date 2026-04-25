const { spawn } = require('child_process');
const path = require('path');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('server', () => {
  test('module exports a server object when imported', () => {
    let server;
    jest.isolateModules(() => {
      jest.doMock('../../src/app', () => ({
        listen: jest.fn((port, cb) => {
          if (cb) cb();
          return { close: jest.fn((cb) => cb && cb()), on: jest.fn() };
        })
      }));
      server = require('../../src/server');
    });
    expect(server).toBeDefined();
    expect(typeof server.close).toBe('function');
  });

  test('starts server and logs on spawn with PORT=0', (done) => {
    const serverPath = path.join(__dirname, '../../src/server.js');
    const child = spawn('node', [serverPath], {
      env: { ...process.env, PORT: '0' },
      stdio: 'pipe'
    });

    let output = '';
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    child.stderr.on('data', (data) => {
      output += data.toString();
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, 3000);

    child.on('exit', () => {
      clearTimeout(timeout);
      expect(output).toContain('Server running on port');
      done();
    });
  }, 10000);
});
