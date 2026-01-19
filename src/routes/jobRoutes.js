const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jobController = require('../controllers/jobController');
const { validate } = require('../middleware/validator');

const router = express.Router();

// Configure multer for image uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10) * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and WEBP are allowed.'), false);
    }
  }
});

/**
 * @swagger
 * /prompts/show:
 *   get:
 *     summary: List all available prompts
 *     tags: [Prompts]
 *     responses:
 *       200:
 *         description: List of prompts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   text:
 *                     type: string
 */
router.get(
  '/show',
  jobController.listPrompts
);

/**
 * @swagger
 * /jobs:
 *   post:
 *     summary: Submit a new image processing job
 *     tags: [Jobs]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *               - promptId
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file to process
 *               promptId:
 *                 type: string
 *                 description: ID of the prompt to use
 *               expectedOutcome:
 *                 type: string
 *                 description: Expected result description
 *               variables:
 *                 type: string
 *                 description: JSON string of variables
 *     responses:
 *       200:
 *         description: Job created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Job'
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/',
  upload.single('image'),
  validate(jobController.jobSubmissionSchema),
  jobController.submitJob
);

/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     summary: Get job status and results
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Job details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Job'
 *       404:
 *         description: Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', jobController.getJobStatus);

/**
 * @swagger
 * /jobs/{id}/image:
 *   get:
 *     summary: Get image result binary
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Job ID
 *     responses:
 *       200:
 *         description: Image file
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Image or Job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id/image', jobController.getJobImage);

module.exports = router;
