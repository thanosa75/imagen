const { validateJobSubmission } = require('../../src/middleware/validator');

describe('validateJobSubmission', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {} };
    res = {};
    next = jest.fn();
  });

  test('calls next() for valid body', () => {
    req.body = {
      promptId: 'test-prompt',
      expectedOutcome: 'text',
      variables: { key: 'value' }
    };
    validateJobSubmission(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body.variables).toEqual({ key: 'value' });
  });

  test('defaults variables to {} when undefined', () => {
    req.body = {
      promptId: 'test-prompt',
      expectedOutcome: 'image'
    };
    validateJobSubmission(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body.variables).toEqual({});
  });

  test('parses variables string as JSON', () => {
    req.body = {
      promptId: 'test-prompt',
      expectedOutcome: 'text',
      variables: '{"key":"value"}'
    };
    validateJobSubmission(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body.variables).toEqual({ key: 'value' });
  });

  test('keeps variables as string and rejects when JSON.parse fails', () => {
    req.body = {
      promptId: 'test-prompt',
      expectedOutcome: 'text',
      variables: 'not-json'
    };
    validateJobSubmission(req, res, next);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'variables', message: 'variables must be an object' })
      ])
    );
  });

  test('rejects variables as array', () => {
    req.body = {
      promptId: 'test-prompt',
      expectedOutcome: 'text',
      variables: ['a', 'b']
    };
    validateJobSubmission(req, res, next);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'variables', message: 'variables must be an object' })
      ])
    );
  });

  test('rejects missing promptId', () => {
    req.body = {
      expectedOutcome: 'text'
    };
    validateJobSubmission(req, res, next);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'promptId', message: 'promptId is required' })
      ])
    );
  });

  test('rejects empty string promptId', () => {
    req.body = {
      promptId: '   ',
      expectedOutcome: 'text'
    };
    validateJobSubmission(req, res, next);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'promptId', message: 'promptId is required' })
      ])
    );
  });

  test('rejects missing expectedOutcome', () => {
    req.body = {
      promptId: 'test-prompt'
    };
    validateJobSubmission(req, res, next);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'expectedOutcome', message: "expectedOutcome must be 'text' or 'image'" })
      ])
    );
  });

  test('rejects invalid expectedOutcome', () => {
    req.body = {
      promptId: 'test-prompt',
      expectedOutcome: 'video'
    };
    validateJobSubmission(req, res, next);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'expectedOutcome', message: "expectedOutcome must be 'text' or 'image'" })
      ])
    );
  });

  test('catches generic error and calls next(error)', () => {
    req.body = {
      get promptId() { throw new Error('boom'); }
    };
    validateJobSubmission(req, res, next);
    const error = next.mock.calls[0][0];
    expect(error).toBeDefined();
    expect(error.message).toBe('boom');
  });
});
