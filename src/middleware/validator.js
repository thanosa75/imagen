/**
 * Middleware to validate request body against a Zod schema
 * @param {import('zod').ZodSchema} schema 
 */
const validate = (schema) => (req, res, next) => {
  try {
    // If it's a multipart form, req.body might need parsing if variables are stringified
    // But usually for POST /jobs we expect JSON or Multer handles the fields.
    // If multer is used, fields are in req.body.
    
    if (req.body.variables && typeof req.body.variables === 'string') {
      try {
        req.body.variables = JSON.parse(req.body.variables);
      } catch (e) {
        // Ignore, let zod handle validation
      }
    }

    schema.parse(req.body);
    next();
  } catch (error) {
    if (error.errors) {
      const details = error.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }));
      
      const valError = new Error('Validation failed');
      valError.statusCode = 400;
      valError.code = 'VALIDATION_ERROR';
      valError.details = details;
      return next(valError);
    }
    next(error);
  }
};

module.exports = { validate };
