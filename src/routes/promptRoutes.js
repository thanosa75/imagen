const express = require('express');
const jobController = require('../controllers/jobController');

const router = express.Router();

/**
 * @swagger
 * /prompts/show:
 *   get:
 *     summary: List all available prompts
 *     tags: [Prompts]
 *     responses:
 *       200:
 *         description: List of prompts
 */
router.get('/show', jobController.listPrompts);

module.exports = router;
