const mockClient = {
  lPush: jest.fn(),
  brPop: jest.fn(),
  rPop: jest.fn(),
  lLen: jest.fn(),
  lRange: jest.fn(),
  lRem: jest.fn(),
  del: jest.fn(),
  brPopLPush: jest.fn(),
};

jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn(() => mockClient),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const queueService = require('../../src/services/queueService');

describe('queueService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock implementations so rejected values do not leak across tests
    mockClient.lPush.mockResolvedValue(1);
    mockClient.brPop.mockResolvedValue(null);
    mockClient.rPop.mockResolvedValue(null);
    mockClient.lLen.mockResolvedValue(0);
    mockClient.lRange.mockResolvedValue([]);
    mockClient.lRem.mockResolvedValue(0);
    mockClient.del.mockResolvedValue(1);
    mockClient.brPopLPush.mockResolvedValue(null);
  });

  describe('enqueueJob', () => {
    test('adds job to queue and returns length', async () => {
      mockClient.lPush.mockResolvedValue(3);
      const result = await queueService.enqueueJob('job-1');
      expect(mockClient.lPush).toHaveBeenCalledWith('queue:jobs', 'job-1');
      expect(result).toBe(3);
    });

    test('throws and logs on redis error', async () => {
      const err = new Error('Redis down');
      mockClient.lPush.mockRejectedValue(err);
      await expect(queueService.enqueueJob('job-1')).rejects.toThrow('Redis down');
    });
  });

  describe('dequeueJob', () => {
    test('returns job id when available', async () => {
      mockClient.brPop.mockResolvedValue({ key: 'queue:jobs', element: 'job-1' });
      const result = await queueService.dequeueJob(5);
      expect(mockClient.brPop).toHaveBeenCalledWith('queue:jobs', 5);
      expect(result).toBe('job-1');
    });

    test('returns null on timeout', async () => {
      mockClient.brPop.mockResolvedValue(null);
      const result = await queueService.dequeueJob(1);
      expect(result).toBeNull();
    });

    test('throws and logs on redis error', async () => {
      mockClient.brPop.mockRejectedValue(new Error('fail'));
      await expect(queueService.dequeueJob()).rejects.toThrow('fail');
    });
  });

  describe('dequeueJobNonBlocking', () => {
    test('returns job id when available', async () => {
      mockClient.rPop.mockResolvedValue('job-2');
      const result = await queueService.dequeueJobNonBlocking();
      expect(mockClient.rPop).toHaveBeenCalledWith('queue:jobs');
      expect(result).toBe('job-2');
    });

    test('returns null when queue is empty', async () => {
      mockClient.rPop.mockResolvedValue(null);
      const result = await queueService.dequeueJobNonBlocking();
      expect(result).toBeNull();
    });

    test('throws and logs on redis error', async () => {
      mockClient.rPop.mockRejectedValue(new Error('fail'));
      await expect(queueService.dequeueJobNonBlocking()).rejects.toThrow('fail');
    });
  });

  describe('getQueueLength', () => {
    test('returns queue length', async () => {
      mockClient.lLen.mockResolvedValue(5);
      const result = await queueService.getQueueLength();
      expect(mockClient.lLen).toHaveBeenCalledWith('queue:jobs');
      expect(result).toBe(5);
    });

    test('throws and logs on redis error', async () => {
      mockClient.lLen.mockRejectedValue(new Error('fail'));
      await expect(queueService.getQueueLength()).rejects.toThrow('fail');
    });
  });

  describe('peekQueue', () => {
    test('returns jobs in range', async () => {
      mockClient.lRange.mockResolvedValue(['job-a', 'job-b']);
      const result = await queueService.peekQueue(0, -1);
      expect(mockClient.lRange).toHaveBeenCalledWith('queue:jobs', 0, -1);
      expect(result).toEqual(['job-a', 'job-b']);
    });

    test('throws and logs on redis error', async () => {
      mockClient.lRange.mockRejectedValue(new Error('fail'));
      await expect(queueService.peekQueue()).rejects.toThrow('fail');
    });
  });

  describe('removeFromQueue', () => {
    test('removes job and returns count', async () => {
      mockClient.lRem.mockResolvedValue(1);
      const result = await queueService.removeFromQueue('job-x');
      expect(mockClient.lRem).toHaveBeenCalledWith('queue:jobs', 0, 'job-x');
      expect(result).toBe(1);
    });

    test('returns zero when job not found', async () => {
      mockClient.lRem.mockResolvedValue(0);
      const result = await queueService.removeFromQueue('job-x');
      expect(result).toBe(0);
    });

    test('throws and logs on redis error', async () => {
      mockClient.lRem.mockRejectedValue(new Error('fail'));
      await expect(queueService.removeFromQueue('job-x')).rejects.toThrow('fail');
    });
  });

  describe('clearQueue', () => {
    test('returns true when queue deleted', async () => {
      mockClient.del.mockResolvedValue(1);
      const result = await queueService.clearQueue();
      expect(mockClient.del).toHaveBeenCalledWith('queue:jobs');
      expect(result).toBe(true);
    });

    test('returns false when queue did not exist', async () => {
      mockClient.del.mockResolvedValue(0);
      const result = await queueService.clearQueue();
      expect(result).toBe(false);
    });

    test('throws and logs on redis error', async () => {
      mockClient.del.mockRejectedValue(new Error('fail'));
      await expect(queueService.clearQueue()).rejects.toThrow('fail');
    });
  });

  describe('moveToProcessing', () => {
    test('pushes job to processing queue', async () => {
      mockClient.lPush.mockResolvedValue(1);
      await queueService.moveToProcessing('job-1');
      expect(mockClient.lPush).toHaveBeenCalledWith('queue:processing', 'job-1');
    });

    test('throws and logs on redis error', async () => {
      mockClient.lPush.mockRejectedValue(new Error('fail'));
      await expect(queueService.moveToProcessing('job-1')).rejects.toThrow('fail');
    });
  });

  describe('removeFromProcessing', () => {
    test('removes job and returns count', async () => {
      mockClient.lRem.mockResolvedValue(1);
      const result = await queueService.removeFromProcessing('job-1');
      expect(mockClient.lRem).toHaveBeenCalledWith('queue:processing', 0, 'job-1');
      expect(result).toBe(1);
    });

    test('returns zero when job not found', async () => {
      mockClient.lRem.mockResolvedValue(0);
      const result = await queueService.removeFromProcessing('job-1');
      expect(result).toBe(0);
    });

    test('throws and logs on redis error', async () => {
      mockClient.lRem.mockRejectedValue(new Error('fail'));
      await expect(queueService.removeFromProcessing('job-1')).rejects.toThrow('fail');
    });
  });

  describe('getProcessingJobs', () => {
    test('returns processing jobs', async () => {
      mockClient.lRange.mockResolvedValue(['job-p1']);
      const result = await queueService.getProcessingJobs();
      expect(mockClient.lRange).toHaveBeenCalledWith('queue:processing', 0, -1);
      expect(result).toEqual(['job-p1']);
    });

    test('throws and logs on redis error', async () => {
      mockClient.lRange.mockRejectedValue(new Error('fail'));
      await expect(queueService.getProcessingJobs()).rejects.toThrow('fail');
    });
  });

  describe('dequeueToProcessing', () => {
    test('atomically moves job using brPopLPush', async () => {
      mockClient.brPopLPush.mockResolvedValue('job-1');
      const result = await queueService.dequeueToProcessing(0);
      expect(mockClient.brPopLPush).toHaveBeenCalledWith('queue:jobs', 'queue:processing', 0);
      expect(result).toBe('job-1');
    });

    test('returns null on timeout', async () => {
      mockClient.brPopLPush.mockResolvedValue(null);
      const result = await queueService.dequeueToProcessing(1);
      expect(result).toBeNull();
    });

    test('falls back to dequeue+move when brPopLPush is unavailable', async () => {
      mockClient.brPopLPush.mockRejectedValue(new Error('unknown command'));
      mockClient.brPop.mockResolvedValue({ key: 'queue:jobs', element: 'job-2' });
      mockClient.lPush.mockResolvedValue(1);

      const result = await queueService.dequeueToProcessing(0);
      expect(result).toBe('job-2');
      expect(mockClient.brPop).toHaveBeenCalledWith('queue:jobs', 0);
      expect(mockClient.lPush).toHaveBeenCalledWith('queue:processing', 'job-2');
    });

    test('fallback returns null when queue is empty', async () => {
      mockClient.brPopLPush.mockRejectedValue(new Error('unknown command'));
      mockClient.brPop.mockResolvedValue(null);

      const result = await queueService.dequeueToProcessing(0);
      expect(result).toBeNull();
      expect(mockClient.lPush).not.toHaveBeenCalled();
    });
  });

  describe('getQueueStats', () => {
    test('returns pending, processing and total counts', async () => {
      mockClient.lLen.mockResolvedValue(3);
      mockClient.lRange.mockResolvedValue(['j1', 'j2']);
      const result = await queueService.getQueueStats();
      expect(result).toEqual({ pending: 3, processing: 2, total: 5 });
    });

    test('throws when underlying call fails', async () => {
      mockClient.lLen.mockRejectedValue(new Error('fail'));
      await expect(queueService.getQueueStats()).rejects.toThrow('fail');
    });
  });
});
