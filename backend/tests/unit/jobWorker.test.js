jest.mock('../../src/config/redis', () => ({
  initRedis: jest.fn(),
  closeRedis: jest.fn(),
  getRedisClient: jest.fn(() => ({ hSet: jest.fn() })),
}));

jest.mock('../../src/services/queueService', () => ({
  dequeueJob: jest.fn(),
  enqueueJob: jest.fn(),
}));

jest.mock('../../src/repositories/jobRepository', () => ({
  getJobById: jest.fn(),
  updateJobStatus: jest.fn(),
  updateJobResults: jest.fn(),
  updateJobError: jest.fn(),
  cleanupGhostJobs: jest.fn(),
}));

jest.mock('../../src/services/geminiService', () => ({
  validateImage: jest.fn(),
  processImage: jest.fn(),
}));

jest.mock('../../src/services/promptService', () => ({
  getResolvedPrompt: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => {
  const childMock = () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() });
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(childMock),
  };
});

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
  }
}));

const { RetryableGeminiError, FatalGeminiError } = require('../../src/errors/GeminiErrors');

// Static module reference for tests that don't need fresh state
const jobWorker = require('../../src/workers/jobWorker');
const queueService = require('../../src/services/queueService');
const jobRepository = require('../../src/repositories/jobRepository');
const geminiService = require('../../src/services/geminiService');
const promptService = require('../../src/services/promptService');
const logger = require('../../src/utils/logger');
const fs = require('fs').promises;
const redisConfig = require('../../src/config/redis');

describe('jobWorker helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extFromMimeType', () => {
    test.each([
      ['image/png', '.png'],
      ['image/jpeg', '.jpg'],
      ['image/webp', '.webp'],
      ['image/gif', '.gif'],
      ['image/svg+xml', '.svg'],
      ['image/bmp', '.bmp'],
      ['image/tiff', '.tiff'],
    ])('returns correct extension for %s', (mime, ext) => {
      expect(jobWorker.extFromMimeType(mime)).toBe(ext);
    });

    test('throws on unsupported MIME type', () => {
      expect(() => jobWorker.extFromMimeType('application/pdf')).toThrow('Unsupported MIME type: application/pdf');
    });

    test('throws on null/undefined', () => {
      expect(() => jobWorker.extFromMimeType(null)).toThrow('Unsupported MIME type: null');
      expect(() => jobWorker.extFromMimeType(undefined)).toThrow('Unsupported MIME type: undefined');
    });

    test('is case-insensitive', () => {
      expect(jobWorker.extFromMimeType('IMAGE/PNG')).toBe('.png');
      expect(jobWorker.extFromMimeType('  image/png  ')).toBe('.png');
    });
  });

  describe('decodeBase64Image', () => {
    test('decodes valid base64 string', () => {
      const input = Buffer.from('hello world').toString('base64');
      const result = jobWorker.decodeBase64Image(input);
      expect(result.data).toEqual(Buffer.from('hello world'));
      expect(result.length).toBe(11);
    });

    test('throws on empty string', () => {
      expect(() => jobWorker.decodeBase64Image('')).toThrow('Input must be a non-empty string');
    });

    test('throws on null', () => {
      expect(() => jobWorker.decodeBase64Image(null)).toThrow('Input must be a non-empty string');
    });

    test('throws on non-string', () => {
      expect(() => jobWorker.decodeBase64Image(123)).toThrow('Input must be a non-empty string');
    });
  });

  describe('exponentialBackoff', () => {
    test('returns base * 2^failures + jitter', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      expect(jobWorker.exponentialBackoff(0)).toBe(1000);
      expect(jobWorker.exponentialBackoff(1)).toBe(2000);
      expect(jobWorker.exponentialBackoff(2)).toBe(4000);
      expect(jobWorker.exponentialBackoff(5)).toBe(32000);
      expect(jobWorker.exponentialBackoff(10)).toBe(60000); // capped
      Math.random.mockRestore();
    });

    test('adds jitter up to 999ms', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const result = jobWorker.exponentialBackoff(1);
      expect(result).toBe(2500); // 2000 + 500
      Math.random.mockRestore();
    });
  });
});

describe('jobWorker processJobWithGemini', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseJob = {
    jobId: 'j1',
    promptId: 'p1',
    expectedOutcome: 'text',
    imageMimeType: 'image/jpeg',
    imageData: Buffer.from('img').toString('base64'),
  };

  test('processes text outcome successfully', async () => {
    promptService.getResolvedPrompt.mockResolvedValue({ prompt: 'resolved prompt' });
    geminiService.processImage.mockResolvedValue({
      outcome: 'text',
      result: { text: 'result text', note: 'a note' },
      metadata: { modelVersion: 'v1' },
    });

    const result = await jobWorker.processJobWithGemini(baseJob, logger);

    expect(promptService.getResolvedPrompt).toHaveBeenCalledWith('p1', {}, 'text');
    expect(geminiService.validateImage).toHaveBeenCalled();
    expect(result.resultText).toBe('result text');
    expect(result.note).toBe('a note');
    expect(result.promptUsed).toBe('resolved prompt');
    expect(result.modelVersion).toBe('v1');
    expect(result.processingTime).toBeGreaterThanOrEqual(0);
  });

  test('processes image outcome and writes file', async () => {
    const imgJob = { ...baseJob, expectedOutcome: 'image' };
    const imageBase64 = Buffer.from('image-bytes').toString('base64');
    promptService.getResolvedPrompt.mockResolvedValue({ prompt: 'resolved' });
    geminiService.processImage.mockResolvedValue({
      outcome: 'image',
      result: { image: imageBase64, mimeType: 'image/png' },
      metadata: { modelVersion: 'v1' },
    });
    fs.writeFile.mockResolvedValue();

    const result = await jobWorker.processJobWithGemini(imgJob, logger);

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/results\/j1\.png$/),
      Buffer.from(imageBase64, 'base64')
    );
    expect(result.resultImagePath).toMatch(/results\/j1\.png$/);
  });

  test('reads image from path when imageData is absent', async () => {
    const pathJob = { ...baseJob, imageData: null, imagePath: '/tmp/test.jpg' };
    promptService.getResolvedPrompt.mockResolvedValue({ prompt: 'resolved' });
    fs.readFile.mockResolvedValue(Buffer.from('file-bytes'));
    geminiService.processImage.mockResolvedValue({
      outcome: 'text',
      result: { text: 'ok' },
      metadata: { modelVersion: 'v1' },
    });

    await jobWorker.processJobWithGemini(pathJob, logger);
    expect(fs.readFile).toHaveBeenCalledWith('/tmp/test.jpg');
    expect(geminiService.validateImage).toHaveBeenCalledWith(Buffer.from('file-bytes'), 'image/jpeg');
  });

  test('throws when no image data or path', async () => {
    const badJob = { ...baseJob, imageData: null, imagePath: null };
    promptService.getResolvedPrompt.mockResolvedValue({ prompt: 'resolved' });

    await expect(jobWorker.processJobWithGemini(badJob, logger)).rejects.toThrow('No image data or path found in job');
  });

  test('parses string variables as JSON', async () => {
    const varJob = { ...baseJob, variables: '{"key":"val"}' };
    promptService.getResolvedPrompt.mockResolvedValue({ prompt: 'resolved' });
    geminiService.processImage.mockResolvedValue({
      outcome: 'text',
      result: { text: 'ok' },
      metadata: { modelVersion: 'v1' },
    });

    await jobWorker.processJobWithGemini(varJob, logger);
    expect(promptService.getResolvedPrompt).toHaveBeenCalledWith('p1', { key: 'val' }, 'text');
  });
});

describe('jobWorker processJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jobWorker.isShuttingDown = false;
    jobWorker.currentJobId = null;
  });

  const pendingJob = {
    jobId: 'j1',
    status: 'pending',
    promptId: 'p1',
    expectedOutcome: 'text',
    imageData: Buffer.from('img').toString('base64'),
    imageMimeType: 'image/jpeg',
    retryCount: '0',
  };

  test('returns false when job not found', async () => {
    jobRepository.getJobById.mockResolvedValue(null);
    const result = await jobWorker.processJob('j1');
    expect(result).toBe(false);
    expect(jobRepository.updateJobStatus).not.toHaveBeenCalled();
  });

  test('returns false when job is not pending', async () => {
    jobRepository.getJobById.mockResolvedValue({ jobId: 'j1', status: 'completed' });
    const result = await jobWorker.processJob('j1');
    expect(result).toBe(false);
    expect(jobRepository.updateJobStatus).not.toHaveBeenCalled();
  });

  test('completes successfully for text outcome', async () => {
    jobRepository.getJobById.mockResolvedValue(pendingJob);
    promptService.getResolvedPrompt.mockResolvedValue({ prompt: 'resolved' });
    geminiService.processImage.mockResolvedValue({
      outcome: 'text',
      result: { text: 'ok' },
      metadata: { modelVersion: 'v1' },
    });

    const result = await jobWorker.processJob('j1');
    expect(result).toBe(true);
    expect(jobRepository.updateJobStatus).toHaveBeenCalledWith('j1', 'processing', 'pending');
    expect(jobRepository.updateJobResults).toHaveBeenCalledWith('j1', expect.objectContaining({ resultText: 'ok' }));
    expect(jobRepository.updateJobStatus).toHaveBeenCalledWith('j1', 'completed', 'processing');
  });

  test('requeues job when shutdown is requested mid-processing', async () => {
    jobRepository.getJobById.mockResolvedValue(pendingJob);
    promptService.getResolvedPrompt.mockResolvedValue({ prompt: 'resolved' });
    geminiService.processImage.mockImplementation(async () => {
      jobWorker.isShuttingDown = true;
      return {
        outcome: 'text',
        result: { text: 'ok' },
        metadata: { modelVersion: 'v1' },
      };
    });

    const result = await jobWorker.processJob('j1');
    expect(result).toBe(false);
    expect(jobRepository.updateJobStatus).toHaveBeenCalledWith('j1', 'pending', 'processing');
    expect(queueService.enqueueJob).toHaveBeenCalledWith('j1');
  });

  test('requeues on retryable error when retryCount < MAX_JOB_RETRIES', async () => {
    jobRepository.getJobById.mockResolvedValue(pendingJob);
    promptService.getResolvedPrompt.mockResolvedValue({ prompt: 'resolved' });
    geminiService.processImage.mockRejectedValue(new RetryableGeminiError('rate limit', 'RATE_LIMIT'));

    const mockClient = { hSet: jest.fn() };
    redisConfig.getRedisClient.mockReturnValue(mockClient);

    const result = await jobWorker.processJob('j1');
    expect(result).toBe(false);
    expect(jobRepository.updateJobStatus).toHaveBeenCalledWith('j1', 'pending', 'processing');
    expect(mockClient.hSet).toHaveBeenCalledWith('job:j1', {
      retryCount: '1',
      lastError: 'rate limit',
    });
    expect(queueService.enqueueJob).toHaveBeenCalledWith('j1');
  });

  test('marks failed when retryable error exceeds max retries', async () => {
    const maxRetriesJob = { ...pendingJob, retryCount: '3' };
    jobRepository.getJobById.mockResolvedValue(maxRetriesJob);
    promptService.getResolvedPrompt.mockResolvedValue({ prompt: 'resolved' });
    geminiService.processImage.mockRejectedValue(new RetryableGeminiError('rate limit', 'RATE_LIMIT'));

    const result = await jobWorker.processJob('j1');
    expect(result).toBe(false);
    expect(jobRepository.updateJobError).toHaveBeenCalledWith('j1', 'rate limit', 'RATE_LIMIT');
    expect(jobRepository.updateJobStatus).toHaveBeenCalledWith('j1', 'failed', 'processing');
    expect(queueService.enqueueJob).not.toHaveBeenCalled();
  });

  test('marks failed on non-retryable error', async () => {
    jobRepository.getJobById.mockResolvedValue(pendingJob);
    promptService.getResolvedPrompt.mockResolvedValue({ prompt: 'resolved' });
    geminiService.processImage.mockRejectedValue(new FatalGeminiError('bad request', 'BAD_REQUEST'));

    const result = await jobWorker.processJob('j1');
    expect(result).toBe(false);
    expect(jobRepository.updateJobError).toHaveBeenCalledWith('j1', 'bad request', 'BAD_REQUEST');
    expect(jobRepository.updateJobStatus).toHaveBeenCalledWith('j1', 'failed', 'processing');
    expect(queueService.enqueueJob).not.toHaveBeenCalled();
  });

  test('handles fatal outer error (getJobById throws)', async () => {
    jobRepository.getJobById.mockRejectedValue(new Error('DB crash'));
    const result = await jobWorker.processJob('j1');
    expect(result).toBe(false);
    expect(jobRepository.updateJobStatus).not.toHaveBeenCalled();
  });
});

describe('jobWorker startWorker and shutdown', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function requireFresh() {
    const worker = require('../../src/workers/jobWorker');
    const queueService = require('../../src/services/queueService');
    const jobRepository = require('../../src/repositories/jobRepository');
    const redisConfig = require('../../src/config/redis');
    const logger = require('../../src/utils/logger');
    return { worker, queueService, jobRepository, redisConfig, logger };
  }

  test('startWorker initializes redis and cleans ghost jobs', async () => {
    const { worker, queueService, jobRepository, redisConfig, logger } = requireFresh();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    queueService.dequeueJob.mockResolvedValue(null);

    const workerPromise = worker.startWorker();
    await new Promise(r => setTimeout(r, 50));
    await worker.shutdown();
    await workerPromise;

    expect(redisConfig.initRedis).toHaveBeenCalled();
    expect(jobRepository.cleanupGhostJobs).toHaveBeenCalled();
    expect(queueService.dequeueJob).toHaveBeenCalledWith(5);
    expect(redisConfig.closeRedis).toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  test('startWorker processes a job then shuts down', async () => {
    const { worker, queueService, jobRepository, redisConfig } = requireFresh();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    queueService.dequeueJob.mockResolvedValueOnce('job-1').mockResolvedValue(null);
    jobRepository.getJobById.mockResolvedValue({
      jobId: 'job-1',
      status: 'pending',
      promptId: 'p1',
      expectedOutcome: 'text',
      imageData: Buffer.from('img').toString('base64'),
      imageMimeType: 'image/jpeg',
      retryCount: '0',
    });

    const workerPromise = worker.startWorker();
    await new Promise(r => setTimeout(r, 100));
    await worker.shutdown();
    await workerPromise;

    expect(jobRepository.getJobById).toHaveBeenCalledWith('job-1');
    expect(jobRepository.updateJobStatus).toHaveBeenCalledWith('job-1', 'processing', 'pending');

    exitSpy.mockRestore();
  });

  test('startWorker error loop triggers backoff', async () => {
    const { worker, queueService, redisConfig, logger } = requireFresh();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    queueService.dequeueJob
      .mockRejectedValueOnce(new Error('Redis down'))
      .mockImplementation(() => new Promise(() => {})); // block forever after error

    const workerPromise = worker.startWorker();
    await new Promise(r => setTimeout(r, 50));

    expect(logger.error).toHaveBeenCalledWith('Error in worker loop:', expect.any(Error));
    expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/Backing off for/));

    await worker.shutdown();
    await workerPromise;
    exitSpy.mockRestore();
  });

  test('shutdown is idempotent', async () => {
    const { worker, redisConfig, logger } = requireFresh();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    await worker.shutdown();
    await worker.shutdown();

    expect(logger.warn).toHaveBeenCalledWith('Shutdown already in progress');
    expect(redisConfig.closeRedis).toHaveBeenCalledTimes(1);

    exitSpy.mockRestore();
  });

  test('shutdown waits for current job to finish', async () => {
    const { worker, redisConfig, logger } = requireFresh();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    worker.currentJobId = 'slow-job';
    setTimeout(() => { worker.currentJobId = null; }, 300);

    const shutdownPromise = worker.shutdown();
    await shutdownPromise;

    expect(logger.info).toHaveBeenCalledWith('Waiting for current job slow-job to finish...');
    expect(logger.info).toHaveBeenCalledWith('Current job finished successfully');
    expect(redisConfig.closeRedis).toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  test('shutdown forces shutdown when job exceeds timeout', async () => {
    const { worker, redisConfig, logger } = requireFresh();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    worker.currentJobId = 'stuck-job';
    // never clear currentJobId

    await worker.shutdown();

    expect(logger.warn).toHaveBeenCalledWith('Job stuck-job did not finish within timeout, forcing shutdown');
    expect(redisConfig.closeRedis).toHaveBeenCalled();

    exitSpy.mockRestore();
  }, 35000);

  test('shutdown handles error closing redis gracefully', async () => {
    const { worker, redisConfig, logger } = requireFresh();
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    redisConfig.closeRedis.mockRejectedValue(new Error('close failed'));

    await worker.shutdown();

    expect(logger.error).toHaveBeenCalledWith('Error closing Redis connection:', expect.any(Error));

    exitSpy.mockRestore();
  });
});
