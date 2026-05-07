const promptService = require('../services/promptService');
const router = require('express').Router();

// Simple inline validation helpers
function validateCreatePrompt(req, res, next) {
  const { id, name, template, supportedOutcomes } = req.body;
  const details = [];

  if (!id || typeof id !== 'string' || !/^[a-z0-9]+([-_][a-z0-9]+)*$/.test(id)) {
    details.push({ path: 'id', message: 'ID must be lowercase letters, numbers, hyphens, or underscores' });
  }
  if (!name || typeof name !== 'string' || name.length < 3 || name.length > 100) {
    details.push({ path: 'name', message: 'Name is required (3-100 characters)' });
  }
  if (!template || typeof template !== 'string' || template.trim().length === 0) {
    details.push({ path: 'template', message: 'Template cannot be empty' });
  }
  if (!Array.isArray(supportedOutcomes) || supportedOutcomes.length === 0) {
    details.push({ path: 'supportedOutcomes', message: 'Select at least one outcome type' });
  }

  if (details.length > 0) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details },
    });
  }
  next();
}

// ── Routes ──────────────────────────────────────────────────

router.get('/show', async (req, res, next) => {
  try {
    const prompts = await promptService.getPrompts();
    const summary = prompts.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      supportedOutcomes: p.supportedOutcomes,
      requiredVariables: p.requiredVariables || [],
    }));
    res.json({ prompts: summary });
  } catch (err) { next(err); }
});

router.post('/', validateCreatePrompt, async (req, res, next) => {
  try {
    const prompt = await promptService.createPrompt(req.body);
    res.status(201).json(prompt);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const prompt = await promptService.getPromptById(req.params.id);
    if (!prompt) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: `Prompt '${req.params.id}' not found` },
      });
    }
    res.json(prompt);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const prompt = await promptService.updatePrompt(req.params.id, req.body);
    res.json(prompt);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await promptService.deletePrompt(req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.get('/:id/preview', async (req, res, next) => {
  try {
    let variables = {};
    if (req.query.variables) {
      try { variables = JSON.parse(req.query.variables); } catch { /* ignore */ }
    }
    const resolved = await promptService.previewPrompt(req.params.id, variables);
    res.json({ resolvedTemplate: resolved });
  } catch (err) { next(err); }
});

module.exports = router;
