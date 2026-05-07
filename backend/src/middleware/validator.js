/**
 * Middleware to validate request body for the POST /jobs endpoint
 */
const validateJobSubmission = (req, res, next) => {
  try {
    // If it's a multipart form, req.body might need parsing if variables are stringified
    if (req.body.variables && typeof req.body.variables === 'string') {
      try {
        req.body.variables = JSON.parse(req.body.variables);
      } catch (e) {
        // If it's not valid JSON, we'll let the manual validation catch it if needed,
        // or just keep it as is. For now we match existing behavior.
      }
    }

    const details = [];

    // 1. promptId: non-empty string (required)
    if (!req.body.promptId || typeof req.body.promptId !== 'string' || req.body.promptId.trim() === '') {
      details.push({
        path: 'promptId',
        message: 'promptId is required'
      });
    }

    // 2. expectedOutcome: enum of 'text' or 'image' (required)
    const allowedOutcomes = ['text', 'image'];
    if (!req.body.expectedOutcome || !allowedOutcomes.includes(req.body.expectedOutcome)) {
      details.push({
        path: 'expectedOutcome',
        message: "expectedOutcome must be 'text' or 'image'"
      });
    }

    // 3. variables: optional object, defaults to {} (optional)
    if (req.body.variables !== undefined) {
      if (typeof req.body.variables !== 'object' || req.body.variables === null || Array.isArray(req.body.variables)) {
        details.push({
          path: 'variables',
          message: 'variables must be an object'
        });
      }
    } else {
      req.body.variables = {};
    }

    if (details.length > 0) {
      const valError = new Error('Validation failed');
      valError.statusCode = 400;
      valError.code = 'VALIDATION_ERROR';
      valError.details = details;
      return next(valError);
    }

    next();
  } catch (error) {
    // Generic error
    next(error);
  }
};

module.exports = { validateJobSubmission };
