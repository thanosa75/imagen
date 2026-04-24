// src/errors/GeminiErrors.js
class GeminiError extends Error {
  constructor(message, code, isRetryable = false) {
    super(message);
    this.name = 'GeminiError';
    this.code = code || 'GEMINI_ERROR';
    this.isRetryable = isRetryable;
    Error.captureStackTrace(this, this.constructor);
  }
}

class RetryableGeminiError extends GeminiError {
  constructor(message, code) {
    super(message, code, true);
    this.name = 'RetryableGeminiError';
  }
}

class FatalGeminiError extends GeminiError {
  constructor(message, code) {
    super(message, code, false);
    this.name = 'FatalGeminiError';
  }
}

module.exports = {
  GeminiError,
  RetryableGeminiError,
  FatalGeminiError
};
