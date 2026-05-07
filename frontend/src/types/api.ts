// ── API Error Types ───────────────────────────────────────────

/** Shape of the error envelope from the API */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: Array<{ path: string; message: string }> | null;
    timestamp: string;
    requestId: string;
  };
}
