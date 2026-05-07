// ── ApiError ──────────────────────────────────────────────────

export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly requestId: string;
  readonly details: Array<{ path: string; message: string }> | null;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    requestId: string,
    details: Array<{ path: string; message: string }> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.details = details;
  }

  /** Construct an ApiError from a fetch Response and its parsed JSON body */
  static async fromResponse(
    response: Response,
    data: unknown,
  ): Promise<ApiError> {
    const requestId =
      response.headers.get('X-Request-ID') ?? 'unknown';

    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      data.error !== null &&
      typeof data.error === 'object' &&
      'code' in data.error &&
      'message' in data.error
    ) {
      const err = data.error as {
        code: string;
        message: string;
        details?: Array<{ path: string; message: string }> | null;
        requestId?: string;
      };
      return new ApiError(
        err.code,
        err.message,
        response.status,
        err.requestId ?? requestId,
        err.details ?? null,
      );
    }

    // Fallback: body couldn't be parsed as our error envelope
    return new ApiError(
      'UNKNOWN_ERROR',
      `Unexpected ${response.status} response`,
      response.status,
      requestId,
      null,
    );
  }
}
