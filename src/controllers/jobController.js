const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const jobRepository = require('../repositories/jobRepository');
const promptService = require('../services/promptService');
const { enqueueJob } = require('../services/queueService');

// Validation schema for job submission
const jobSubmissionSchema = z.object({
  promptId: z.string().min(1, 'promptId is required'),
  variables: z.record(z.any()).optional().default({}),
  expectedOutcome: z.enum(['text', 'image'], {
    errorMap: () => ({ message: "expectedOutcome must be 'text' or 'image'" })
  })
});

/**
 * Handle POST /jobs - Submit a new image processing job
 */
const submitJob = async (req, res, next) => {
  try {
    // 1. Validate basic fields with Zod
    // Note: If using multipart/form-data, Multer populates req.body
    const validatedData = jobSubmissionSchema.parse(req.body);

    // 2. Check for image
    if (!req.file) {
      const error = new Error('Image file is required');
      error.statusCode = 400;
      error.code = 'MISSING_IMAGE';
      throw error;
    }

    const jobId = uuidv4();
    
    // 3. Create job in Redis
    const jobData = {
      jobId,
      promptId: validatedData.promptId,
      expectedOutcome: validatedData.expectedOutcome,
      variables: validatedData.variables,
      imageMimeType: req.file.mimetype,
      // We could store the path to the original image if needed for processing
      imagePath: req.file.path
    };

    const createdJob = await jobRepository.createJob(jobData);

    // 4. Enqueue the job for processing
    await enqueueJob(jobId);

    // 5. Return response
    req.log.info(`Job created successfully`, { jobId: createdJob.jobId });
    res.status(201).json({
      jobId: createdJob.jobId,
      status: createdJob.status,
      createdAt: createdJob.createdAt
    });

  } catch (error) {
    // If validation fails or something else goes wrong, and we uploaded a file, clean it up
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
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

    // Format response based on design.md
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
 * Handle GET /jobs/:id/image - Get image result
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
      const error = new Error(job.status === 'failed' ? 'Job failed, no image available' : 'Job not yet completed');
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

    // Determine mime type from extension or stored mime type
    const mimeType = job.imageMimeType || 'image/jpeg';
    
    req.log.info(`Serving result image for job ${id}`);
    res.setHeader('Content-Type', mimeType);
    const fileStream = fs.createReadStream(job.resultImagePath);
    fileStream.pipe(res);

  } catch (error) {
    next(error);
  }
};

/**
 * Handle GET /prompts - List all available prompts
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
  listPrompts,
  jobSubmissionSchema // Exported for validator middleware if used separately
};
