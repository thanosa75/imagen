const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

/**
 * Service for interacting with Google Gemini API
 */
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

  /**
   * Convert image buffer to Gemini-compatible format
   * @param {Buffer} imageBuffer - The image buffer
   * @param {string} mimeType - The MIME type of the image
   * @returns {Object} Gemini image part
   */
  prepareImagePart(imageBuffer, mimeType) {
    return {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: mimeType
      }
    };
  }

  /**
   * Process an image with Gemini API
   * @param {Buffer} imageBuffer - The image buffer
   * @param {string} promptTemplate - The resolved prompt text
   * @param {Object} variables - Variables used in the prompt (for metadata)
   * @param {string} expectedOutcome - Expected outcome type ('text' or 'image')
   * @param {string} mimeType - The MIME type of the image (default: 'image/jpeg')
   * @returns {Promise<Object>} Processing result
   */
  static get OUTCOMES() {
    return {
      TEXT: 'text',
      IMAGE: 'image'
    };
  }

  async processImage(imageBuffer, promptTemplate, variables = {}, expectedOutcome = 'text', mimeType = 'image/jpeg') {
    try {
      const normalizedOutcome = expectedOutcome.toLowerCase().trim();
      
      const modelName = normalizedOutcome === GeminiService.OUTCOMES.IMAGE
        ? this.imageModelName
        : this.modelName;

      const model = this.genAI.getGenerativeModel({ model: modelName });

      logger.info(`this job uses ${modelName}`);

      // Create the prompt parts array
      const parts = [{ text: promptTemplate }];

      // Prepare and add the image part if buffer is provided
      if (imageBuffer) {
        const imagePart = this.prepareImagePart(imageBuffer, mimeType);
        parts.push(imagePart);
      }

      // Generate content
      const result = await model.generateContent(parts);
      const response = await result.response;

      switch (normalizedOutcome) {
        case GeminiService.OUTCOMES.TEXT:
          const text = response.text();
          return this._formatTextResponse(text, promptTemplate, variables);
        
        case GeminiService.OUTCOMES.IMAGE:
          return this._formatImageResponse(response, promptTemplate, variables);
          
        default:
          throw new Error(`Unsupported expected outcome: ${expectedOutcome}`);
      }
    } catch (error) {
      // Handle Gemini API errors
      return {
        success: false,
        error: {
          message: error.message || 'Failed to process image with Gemini',
          code: error.code || 'GEMINI_ERROR',
          details: error.details || {}
        }
      };
    }
  }

  /**
   * Format text response
   * @private
   * @param {string} text - The generated text
   * @param {string} promptTemplate - The prompt used
   * @param {Object} variables - The variables used
   * @returns {Object} Formatted response
   */
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

  /**
   * Format image response
   * @private
   * @param {Object} response - The Gemini response object
   * @param {string} promptTemplate - The prompt used
   * @param {Object} variables - The variables used
   * @returns {Object} Formatted response
   */
  _formatImageResponse(response, promptTemplate, variables) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find(p => p.inlineData);

    if (!imagePart) {
      // Fallback if no image found but text exists
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
         throw new Error(`Gemini returned text instead of image: ${text}`);
      }
      throw new Error('No image generated in response');
    }

    return {
      success: true,
      outcome: GeminiService.OUTCOMES.IMAGE,
      result: {
        image: imagePart.inlineData.data, // Base64 string
        mimeType: imagePart.inlineData.mimeType
      },
      metadata: {
        modelVersion: this.imageModelName,
        promptUsed: promptTemplate,
        variables
      }
    };
  }

  /**
   * Process image with streaming (for future enhancement)
   * @param {Buffer} imageBuffer - The image buffer
   * @param {string} promptTemplate - The resolved prompt text
   * @param {string} mimeType - The MIME type of the image
   * @returns {Promise<AsyncGenerator>} Streaming response
   */
  async processImageStream(imageBuffer, promptTemplate, mimeType = 'image/jpeg') {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });
    
    const imagePart = this.prepareImagePart(imageBuffer, mimeType);
    const parts = [
      { text: promptTemplate },
      imagePart
    ];

    const result = await model.generateContentStream(parts);
    return result.stream;
  }

  /**
   * Validate image buffer and MIME type
   * @param {Buffer} imageBuffer - The image buffer
   * @param {string} mimeType - The MIME type
   * @throws {Error} If validation fails
   */
  validateImage(imageBuffer, mimeType) {
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new Error('Image must be a Buffer');
    }

    if (imageBuffer.length === 0) {
      throw new Error('Image buffer is empty');
    }

    const supportedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
    ];

    if (!supportedMimeTypes.includes(mimeType)) {
      throw new Error(
        `Unsupported MIME type: ${mimeType}. Supported types: ${supportedMimeTypes.join(', ')}`
      );
    }
  }

  /**
   * Get model information
   * @returns {Object} Model information
   */
  getModelInfo() {
    return {
      modelName: this.modelName,
      apiConfigured: !!this.apiKey
    };
  }

  /**
   * Test API connection
   * @returns {Promise<boolean>} True if connection is successful
   */
  async testConnection() {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      // Simple test with text-only prompt
      const result = await model.generateContent('Hello');
      const response = await result.response;
      response.text(); // This will throw if there's an issue
      return true;
    } catch (error) {
      console.error('Gemini API connection test failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new GeminiService();
