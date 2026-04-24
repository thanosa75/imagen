const { RetryableGeminiError, FatalGeminiError } = require('../../src/errors/GeminiErrors');

// Mock the GoogleGenerativeAI module
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn()
    })
  }))
}));

// Must set API_KEY before requiring the service
process.env.GEMINI_API_KEY = 'test-key';

const geminiService = require('../../src/services/geminiService');

describe('geminiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('validateImage throws on non-buffer input', () => {
    expect(() => geminiService.validateImage('not-a-buffer', 'image/jpeg')).toThrow(FatalGeminiError);
  });

  test('validateImage throws on empty buffer', () => {
    expect(() => geminiService.validateImage(Buffer.alloc(0), 'image/jpeg')).toThrow(FatalGeminiError);
  });

  test('validateImage throws on unsupported mime type', () => {
    expect(() => geminiService.validateImage(Buffer.from('x'), 'image/tiff')).toThrow(FatalGeminiError);
  });

  test('validateImage passes on valid input', () => {
    expect(() => geminiService.validateImage(Buffer.from('valid image data'), 'image/jpeg')).not.toThrow();
  });

  test('getModelInfo returns apiConfigured boolean', () => {
    const info = geminiService.getModelInfo();
    expect(info).toHaveProperty('apiConfigured');
    expect(typeof info.apiConfigured).toBe('boolean');
    expect(info.apiConfigured).toBe(true);
  });

  test('prepareImagePart returns base64 encoded data', () => {
    const buffer = Buffer.from('test image');
    const part = geminiService.prepareImagePart(buffer, 'image/png');
    expect(part).toHaveProperty('inlineData');
    expect(part.inlineData.data).toBe(buffer.toString('base64'));
    expect(part.inlineData.mimeType).toBe('image/png');
  });

  test('processImage throws RetryableGeminiError on 429', async () => {
    const mockModel = {
      generateContent: jest.fn().mockRejectedValue({ status: 429, message: 'Rate limited' })
    };
    geminiService.genAI.getGenerativeModel.mockReturnValue(mockModel);

    await expect(geminiService.processImage(Buffer.from('x'), 'prompt', {}, 'text', 'image/jpeg'))
      .rejects.toBeInstanceOf(RetryableGeminiError);
  });

  test('processImage throws FatalGeminiError on 401', async () => {
    const mockModel = {
      generateContent: jest.fn().mockRejectedValue({ status: 401, message: 'Unauthorized' })
    };
    geminiService.genAI.getGenerativeModel.mockReturnValue(mockModel);

    await expect(geminiService.processImage(Buffer.from('x'), 'prompt', {}, 'text', 'image/jpeg'))
      .rejects.toBeInstanceOf(FatalGeminiError);
  });

  test('processImage throws FatalGeminiError on unknown error', async () => {
    const mockModel = {
      generateContent: jest.fn().mockRejectedValue({ status: 500, message: 'Internal error' })
    };
    geminiService.genAI.getGenerativeModel.mockReturnValue(mockModel);

    await expect(geminiService.processImage(Buffer.from('x'), 'prompt', {}, 'text', 'image/jpeg'))
      .rejects.toBeInstanceOf(FatalGeminiError);
  });

  test('processImage throws RetryableGeminiError on network error', async () => {
    const mockModel = {
      generateContent: jest.fn().mockRejectedValue(new Error('ECONNRESET'))
    };
    geminiService.genAI.getGenerativeModel.mockReturnValue(mockModel);

    await expect(geminiService.processImage(Buffer.from('x'), 'prompt', {}, 'text', 'image/jpeg'))
      .rejects.toBeInstanceOf(RetryableGeminiError);
  });

  test('_formatTextResponse returns correct structure', () => {
    const result = geminiService._formatTextResponse('hello', 'prompt', {});
    expect(result.success).toBe(true);
    expect(result.outcome).toBe('text');
    expect(result.result.text).toBe('hello');
  });
});
