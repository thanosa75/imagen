const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jobController = require('../controllers/jobController');
const { validateJobSubmission } = require('../middleware/validator');

const router = express.Router();

// Use shared Docker volume at /usr/src/app/uploads in production.
// Falls back to process.cwd()/uploads for local dev.
// Both API and worker containers mount the 'uploads' named volume at this path.
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Strip originalname to avoid path traversal or probe attacks (HIGH-2)
    const safeExt = path.extname(file.originalname).toLowerCase();
    cb(null, `img-${uniqueSuffix}${safeExt}`);
  }
});

const upload = multer({
  storage,
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
 * /jobs/{id}/result-image:
 *   get:
 *     summary: Get image result binary
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
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
 */
router.get('/:id/result-image', jobController.getJobImage);

/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     summary: Get job status and results
 *     tags: [Jobs]
 */
router.get('/:id', jobController.getJobStatus);

/**
 * @swagger
 * /jobs:
 *   post:
 *     summary: Submit a new image processing job
 *     tags: [Jobs]
 */
router.post(
  '/',
  upload.single('image'),
  validateJobSubmission,
  jobController.submitJob
);

module.exports = router;
