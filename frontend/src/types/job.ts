// ── Job Types ─────────────────────────────────────────────────

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  jobId: string;
  status: JobStatus;
  promptId: string;
  expectedOutcome: 'text' | 'image';
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  result?: {
    text?: string;
  };
  metadata?: {
    processingTime?: number;
    promptUsed?: string;
    modelVersion?: string;
  };
  error?: {
    message: string;
    code: string;
  };
}

/** Shape returned by POST /jobs on success */
export interface JobCreated {
  jobId: string;
  status: JobStatus;
  createdAt: string;
}

/** Shape returned by GET /health */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  redis: 'connected' | 'disconnected';
  timestamp: string;
  app: string;
}
