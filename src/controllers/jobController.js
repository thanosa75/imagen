const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const jobRepository = require('../repositories/jobRepository');
const promptService = require('../services/promptService');
const { enqueueJob } = require('../services/queueService');
const logger = require('../utils/logger');

/**
 * Handle POST /jobs - Submit a new image processing job
 */
const submitJob = async (req, res, next) => {
  let createdJob = null;

  try {
    if (!req.file) {
      const error = new Error('Image file is required');
      error.statusCode = 400;
      error.code = 'MISSING_IMAGE';
      throw error;
    }

    // Validate promptId exists BEFORE creating any persistent state (bonus from MED-5)
    const prompt = await promptService.getPromptById(req.body.promptId);
    if (!prompt) {
      const error = new Error(`Prompt '${req.body.promptId}' not found`);
      error.statusCode = 400;
      error.code = 'INVALID_PROMPT';
      throw error;
    }

    const jobId = uuidv4();

    const jobData = {
      jobId,
      promptId: req.body.promptId,
      expectedOutcome: req.body.expectedOutcome,
      variables: req.body.variables,
      imageMimeType: req.file.mimetype,
      imagePath: req.file.path
    };

    createdJob = await jobRepository.createJob(jobData);

    // Enqueue after record is durable
    await enqueueJob(jobId);

    req.log.info('Job created successfully', { jobId: createdJob.jobId });
    res.status(201).json({
      jobId: createdJob.jobId,
      status: createdJob.status,
      createdAt: createdJob.createdAt
    });

  } catch (error) {
    // CRIT-5 fix: clean up BOTH file and stale job record
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    }
    if (createdJob && createdJob.jobId) {
      try {
        await jobRepository.deleteJob(createdJob.jobId);
        logger.info(`Rolled back stale job record ${createdJob.jobId}`);
      } catch (cleanupErr) {
        logger.error(`Failed to clean up stale job ${createdJob.jobId}:`, cleanupErr);
      }
    }
    next(error);
  }
};

/**
 * Handle GET /jobs/:id - Get job status and results
 */
const getJobStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await jobRepository.getJobById(id);

    if (!job) {
      const error = new Error('Job not found');
      error.statusCode = 404;
      error.code = 'JOB_NOT_FOUND';
      throw error;
    }

    const response = {
      jobId: job.jobId,
      status: job.status,
      promptId: job.promptId,
      expectedOutcome: job.expectedOutcome,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt || null,
    };

    req.log.debug(`Retrieved status for job ${id}: ${job.status}`);

    if (job.status === 'completed' && job.expectedOutcome === 'text') {
      response.result = { text: job.resultText };
    }

    if (job.status === 'failed') {
      response.error = {
        message: job.errorMessage,
        code: job.errorCode
      };
    }

    if (job.processingTime || job.promptUsed || job.modelVersion) {
      response.metadata = {
        processingTime: job.processingTime ? parseInt(job.processingTime, 10) : undefined,
        promptUsed: job.promptUsed,
        modelVersion: job.modelVersion
      };
    }

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
};

/**
 * Handle GET /jobs/:id/result-image - Get image result
 */
const getJobImage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const job = await jobRepository.getJobById(id);

    if (!job) {
      const error = new Error('Job not found');
      error.statusCode = 404;
      error.code = 'JOB_NOT_FOUND';
      throw error;
    }

    if (job.expectedOutcome !== 'image') {
      const error = new Error('Job outcome type is not image');
      error.statusCode = 400;
      error.code = 'INVALID_OUTCOME_TYPE';
      throw error;
    }

    if (job.status !== 'completed') {
      const status = job.status === 'failed' ? 404 : 409;
      const error = new Error(
        job.status === 'failed' ? 'Job failed, no image available' : 'Job not yet completed'
      );
      error.statusCode = status;
      error.code = job.status === 'failed' ? 'JOB_FAILED' : 'JOB_NOT_COMPLETED';
      throw error;
    }

    if (!job.resultImagePath || !fs.existsSync(job.resultImagePath)) {
      const error = new Error('Image result not found on server');
      error.statusCode = 404;
      error.code = 'IMAGE_NOT_FOUND';
      throw error;
    }

    const mimeType = job.imageMimeType || 'image/jpeg';

    req.log.info(`Serving result image for job ${id}`);
    res.setHeader('Content-Type', mimeType);

    // HIGH-4 fix: attach error handler to stream
    const fileStream = fs.createReadStream(job.resultImagePath);
    fileStream.on('error', (err) => {
      logger.error(`Stream error serving image for job ${id}:`, err);
      // If headers not sent, respond with error; otherwise just destroy stream
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'STREAM_ERROR', message: 'Failed to stream image' } });
      }
      fileStream.destroy();
    });

    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
};

/**
 * Handle GET /prompts/show - List all available prompts
 */
const listPrompts = async (req, res, next) => {
  try {
    const prompts = await promptService.getPrompts();
    res.status(200).json({
      prompts: prompts.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        requiredVariables: p.requiredVariables || [],
        supportedOutcomes: p.supportedOutcomes || []
      }))
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitJob,
  getJobStatus,
  getJobImage,
  listPrompts
};
