jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClientInstance)
}));

let logger;
let mockRedisClientInstance;
let redisModule;
let originalSetTimeout;

describe('redis', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_DB;

    mockRedisClientInstance = {
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      isOpen: true,
      isReady: true,
      on: jest.fn((event, handler) => {
        mockRedisClientInstance._handlers = mockRedisClientInstance._handlers || {};
        if (!mockRedisClientInstance._handlers[event]) {
          mockRedisClientInstance._handlers[event] = [];
        }
        mockRedisClientInstance._handlers[event].push(handler);
      }),
      emit: jest.fn((event, ...args) => {
        if (mockRedisClientInstance._handlers && mockRedisClientInstance._handlers[event]) {
          mockRedisClientInstance._handlers[event].forEach(h => h(...args));
        }
      })
    };

    redisModule = require('../../src/config/redis');
    logger = require('../../src/utils/logger');
    originalSetTimeout = global.setTimeout;
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
  });

  describe('getRedisConfig via initRedis', () => {
    test('parses REDIS_URL with password and db number', async () => {
      process.env.REDIS_URL = 'redis://:mypass@redis-host:6380/3';
      jest.resetModules();
      logger = require('../../src/utils/logger');
      const redis = require('redis');
      const { initRedis } = require('../../src/config/redis');
      await initRedis();
      const config = redis.createClient.mock.calls[0][0];
      expect(config.socket.host).toBe('redis-host');
      expect(config.socket.port).toBe(6380);
      expect(config.password).toBe('mypass');
      expect(config.database).toBe(3);
      expect(typeof config.socket.reconnectStrategy).toBe('function');
    });

    test('parses REDIS_URL without password or db', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      jest.resetModules();
      logger = require('../../src/utils/logger');
      const redis = require('redis');
      const { initRedis } = require('../../src/config/redis');
      await initRedis();
      const config = redis.createClient.mock.calls[0][0];
      expect(config.socket.host).toBe('localhost');
      expect(config.socket.port).toBe(6379);
      expect(config.password).toBeUndefined();
      expect(config.database).toBeUndefined();
    });

    test('falls back to REDIS_HOST and REDIS_PORT when REDIS_URL is invalid', async () => {
      process.env.REDIS_URL = 'not-a-valid-url';
      process.env.REDIS_HOST = 'fallback-host';
      process.env.REDIS_PORT = '7000';
      jest.resetModules();
      logger = require('../../src/utils/logger');
      const redis = require('redis');
      const { initRedis } = require('../../src/config/redis');
      await initRedis();
      const config = redis.createClient.mock.calls[0][0];
      expect(config.socket.host).toBe('fallback-host');
      expect(config.socket.port).toBe(7000);
    });

    test('falls back to defaults when no env vars set', async () => {
      jest.resetModules();
      logger = require('../../src/utils/logger');
      const redis = require('redis');
      const { initRedis } = require('../../src/config/redis');
      await initRedis();
      const config = redis.createClient.mock.calls[0][0];
      expect(config.socket.host).toBe('localhost');
      expect(config.socket.port).toBe(6379);
      expect(config.database).toBe(0);
      expect(config.password).toBeUndefined();
    });

    test('includes REDIS_PASSWORD in fallback config', async () => {
      process.env.REDIS_PASSWORD = 'secret';
      jest.resetModules();
      logger = require('../../src/utils/logger');
      const redis = require('redis');
      const { initRedis } = require('../../src/config/redis');
      await initRedis();
      const config = redis.createClient.mock.calls[0][0];
      expect(config.password).toBe('secret');
    });

    test('reconnection strategy returns delay for retries <= 10', async () => {
      jest.resetModules();
      logger = require('../../src/utils/logger');
      const redis = require('redis');
      const { initRedis } = require('../../src/config/redis');
      await initRedis();
      const config = redis.createClient.mock.calls[0][0];
      const delay = config.socket.reconnectStrategy(5);
      expect(typeof delay).toBe('number');
      expect(delay).toBe(500);
    });

    test('reconnection strategy returns Error for retries > 10', async () => {
      jest.resetModules();
      logger = require('../../src/utils/logger');
      const redis = require('redis');
      const { initRedis } = require('../../src/config/redis');
      await initRedis();
      const config = redis.createClient.mock.calls[0][0];
      const result = config.socket.reconnectStrategy(11);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('Redis reconnection limit exceeded');
    });

    test('reconnection strategy logs warning for retries <= 10 with REDIS_URL', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      jest.resetModules();
      logger = require('../../src/utils/logger');
      const redis = require('redis');
      const { initRedis } = require('../../src/config/redis');
      await initRedis();
      const config = redis.createClient.mock.calls[0][0];
      config.socket.reconnectStrategy(3);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Redis reconnecting'));
    });

    test('reconnection strategy logs error for retries > 10 with REDIS_URL', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      jest.resetModules();
      logger = require('../../src/utils/logger');
      const redis = require('redis');
      const { initRedis } = require('../../src/config/redis');
      await initRedis();
      const config = redis.createClient.mock.calls[0][0];
      const result = config.socket.reconnectStrategy(11);
      expect(result).toBeInstanceOf(Error);
      expect(logger.error).toHaveBeenCalledWith('Redis reconnection failed after 10 attempts');
    });
  });

  describe('initRedis', () => {
    test('returns existing client if already initialized', async () => {
      await redisModule.initRedis();
      const clientAgain = await redisModule.initRedis();
      expect(clientAgain).toBe(redisModule.getRedisClient());
    });

    test('connects successfully on first try', async () => {
      const client = await redisModule.initRedis();
      expect(mockRedisClientInstance.connect).toHaveBeenCalled();
      expect(client).toBe(mockRedisClientInstance);
    });

    test('retries on failure then succeeds', async () => {
      mockRedisClientInstance.connect
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(undefined);

      global.setTimeout = jest.fn((cb) => {
        if (typeof cb === 'function') cb();
      });

      const client = await redisModule.initRedis();
      expect(mockRedisClientInstance.connect).toHaveBeenCalledTimes(3);
      expect(client).toBe(mockRedisClientInstance);
    });

    test('throws after max retries', async () => {
      mockRedisClientInstance.connect.mockRejectedValue(new Error('Connection refused'));

      global.setTimeout = jest.fn((cb) => {
        if (typeof cb === 'function') cb();
      });

      await expect(redisModule.initRedis()).rejects.toThrow('Connection refused');
      expect(mockRedisClientInstance.connect).toHaveBeenCalledTimes(10);
    });
  });

  describe('getRedisClient', () => {
    test('auto-initializes when uninitialized', () => {
      const client = redisModule.getRedisClient();
      expect(client).toBe(mockRedisClientInstance);
    });
  });

  describe('closeRedis', () => {
    test('closes and nulls client', async () => {
      await redisModule.initRedis();
      expect(redisModule.isConnected()).toBeTruthy();
      await redisModule.closeRedis();
      expect(mockRedisClientInstance.quit).toHaveBeenCalled();
      expect(redisModule.isConnected()).toBeFalsy();
    });

    test('does nothing when client is null', async () => {
      await redisModule.closeRedis();
      expect(mockRedisClientInstance.quit).not.toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    test('returns true when client is open', async () => {
      await redisModule.initRedis();
      expect(redisModule.isConnected()).toBe(true);
    });

    test('returns falsy when client is null', () => {
      expect(redisModule.isConnected()).toBeFalsy();
    });

    test('returns false when client is not open', async () => {
      await redisModule.initRedis();
      mockRedisClientInstance.isOpen = false;
      expect(redisModule.isConnected()).toBe(false);
    });
  });

  describe('redis client event handlers', () => {
    test('registers and handles error event', async () => {
      await redisModule.initRedis();
      expect(mockRedisClientInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      mockRedisClientInstance.emit('error', new Error('test error'));
      expect(logger.error).toHaveBeenCalledWith('Redis client error:', expect.any(Error));
    });

    test('registers and handles connect event', async () => {
      await redisModule.initRedis();
      expect(mockRedisClientInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
      mockRedisClientInstance.emit('connect');
      expect(logger.info).toHaveBeenCalledWith('Redis client connecting...');
    });

    test('registers and handles ready event', async () => {
      await redisModule.initRedis();
      expect(mockRedisClientInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
      mockRedisClientInstance.emit('ready');
      expect(logger.info).toHaveBeenCalledWith('Redis client ready');
    });

    test('registers and handles reconnecting event', async () => {
      await redisModule.initRedis();
      expect(mockRedisClientInstance.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      mockRedisClientInstance.emit('reconnecting');
      expect(logger.warn).toHaveBeenCalledWith('Redis client reconnecting...');
    });

    test('registers and handles end event', async () => {
      await redisModule.initRedis();
      expect(mockRedisClientInstance.on).toHaveBeenCalledWith('end', expect.any(Function));
      mockRedisClientInstance.emit('end');
      expect(logger.info).toHaveBeenCalledWith('Redis client connection closed');
    });
  });
});
