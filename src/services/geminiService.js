const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');
const { RetryableGeminiError, FatalGeminiError } = require('../errors/GeminiErrors');

class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.modelName = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
    this.imageModelName = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';

    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }

  prepareImagePart(imageBuffer, mimeType) {
    return {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: mimeType
      }
    };
  }

  static get OUTCOMES() {
    return { TEXT: 'text', IMAGE: 'image' };
  }

  async processImage(imageBuffer, promptTemplate, variables = {}, expectedOutcome = 'text', mimeType = 'image/jpeg') {
    const normalizedOutcome = expectedOutcome.toLowerCase().trim();
    const modelName = normalizedOutcome === GeminiService.OUTCOMES.IMAGE
      ? this.imageModelName
      : this.modelName;

    const model = this.genAI.getGenerativeModel({ model: modelName });
    logger.info(`Processing job with model ${modelName}`);

    const parts = [{ text: promptTemplate }];
    if (imageBuffer) {
      parts.push(this.prepareImagePart(imageBuffer, mimeType));
    }

    try {
      const result = await model.generateContent(parts);
      const response = await result.response;

      switch (normalizedOutcome) {
        case GeminiService.OUTCOMES.TEXT:
          return this._formatTextResponse(response.text(), promptTemplate, variables);
        case GeminiService.OUTCOMES.IMAGE:
          return this._formatImageResponse(response, promptTemplate, variables);
        default:
          throw new FatalGeminiError(`Unsupported expected outcome: ${expectedOutcome}`, 'UNSUPPORTED_OUTCOME');
      }
    } catch (error) {
      logger.error('Gemini API error:', error);

      // Classify errors for the worker (HIGH-5)
      const statusCode = error.status || (error.response && error.response.status);
      const message = error.message || 'Gemini API failure';

      if (statusCode === 429 || statusCode === 503 || statusCode === 502) {
        throw new RetryableGeminiError(message, `GEMINI_${statusCode}`);
      }
      if (statusCode === 401 || statusCode === 403) {
        throw new FatalGeminiError(message, `GEMINI_${statusCode}`);
      }
      if (message.includes('ECONNRESET') || message.includes('ETIMEDOUT') || message.includes('fetch failed')) {
        throw new RetryableGeminiError(message, 'GEMINI_NETWORK');
      }

      // Default unknown errors are treated as fatal to avoid infinite retries
      throw new FatalGeminiError(message, 'GEMINI_UNKNOWN');
    }
  }

  _formatTextResponse(text, promptTemplate, variables) {
    return {
      success: true,
      outcome: GeminiService.OUTCOMES.TEXT,
      result: { text },
      metadata: {
        modelVersion: this.modelName,
        promptUsed: promptTemplate,
        variables
      }
    };
  }

  _formatImageResponse(response, promptTemplate, variables) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData);

    if (!imagePart) {
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        throw new FatalGeminiError(`Gemini returned text instead of image: ${text}`, 'GEMINI_TEXT_FALLBACK');
      }
      throw new FatalGeminiError('No image generated in response', 'GEMINI_NO_IMAGE');
    }

    return {
      success: true,
      outcome: GeminiService.OUTCOMES.IMAGE,
      result: {
        image: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType
      },
      metadata: {
        modelVersion: this.imageModelName,
        promptUsed: promptTemplate,
        variables
      }
    };
  }

  validateImage(imageBuffer, mimeType) {
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new FatalGeminiError('Image must be a Buffer', 'INVALID_IMAGE');
    }
    if (imageBuffer.length === 0) {
      throw new FatalGeminiError('Image buffer is empty', 'INVALID_IMAGE');
    }
    const supportedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!supportedMimeTypes.includes(mimeType)) {
      throw new FatalGeminiError(
        `Unsupported MIME type: ${mimeType}. Supported: ${supportedMimeTypes.join(', ')}`,
        'INVALID_MIME_TYPE'
      );
    }
  }

  getModelInfo() {
    return {
      modelName: this.modelName,
      apiConfigured: !!this.apiKey
    };
  }
}

module.exports = new GeminiService();
