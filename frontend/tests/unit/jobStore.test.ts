import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useJobStore } from '../../src/stores/jobStore';
import api from '../../src/lib/api';

vi.mock('../../src/lib/api', () => ({
  default: {
    submitJob: vi.fn(),
    getJobStatus: vi.fn(),
    getJobImage: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  useJobStore.setState({
    activeJob: null,
    pollingIntervalId: null,
    currentPollIndex: 0,
    imageBlobUrl: null,
  });
});

describe('jobStore', () => {
  it('submitJob creates a job and returns jobId', async () => {
    const mockCreated = { jobId: 'job-123', status: 'pending', createdAt: new Date().toISOString() };
    vi.mocked(api.submitJob).mockResolvedValueOnce(mockCreated);

    const fd = new FormData();
    const jobId = await useJobStore.getState().submitJob(fd);

    expect(jobId).toBe('job-123');
    expect(useJobStore.getState().activeJob?.jobId).toBe('job-123');
    expect(useJobStore.getState().activeJob?.status).toBe('pending');
  });

  it('startPolling calls getJobStatus immediately', async () => {
    const mockJob = {
      jobId: 'job-123',
      status: 'processing' as const,
      promptId: 'test',
      expectedOutcome: 'text' as const,
      createdAt: '',
      updatedAt: '',
      completedAt: null,
    };

    vi.mocked(api.getJobStatus).mockResolvedValueOnce(mockJob);

    useJobStore.getState().startPolling('job-123');

    // Advance just enough for the immediate poll + one scheduling tick
    // (runAllTimersAsync would loop infinitely because scheduleNext
    //  always creates a new timeout for the next poll)
    await vi.advanceTimersByTimeAsync(0);

    expect(api.getJobStatus).toHaveBeenCalledWith('job-123');
    expect(useJobStore.getState().activeJob?.status).toBe('processing');
  });

  it('stopPolling clears interval', () => {
    useJobStore.setState({ pollingIntervalId: 42 as unknown as ReturnType<typeof setInterval> });
    useJobStore.getState().stopPolling();
    expect(useJobStore.getState().pollingIntervalId).toBeNull();
  });

  it('clearActiveJob stops polling and revokes blob URLs', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    useJobStore.setState({
      pollingIntervalId: 42 as unknown as ReturnType<typeof setInterval>,
      imageBlobUrl: 'blob:test',
      activeJob: { jobId: 'x', status: 'pending', promptId: '', expectedOutcome: 'text', createdAt: '', updatedAt: '', completedAt: null },
    });

    useJobStore.getState().clearActiveJob();
    expect(useJobStore.getState().activeJob).toBeNull();
    expect(useJobStore.getState().imageBlobUrl).toBeNull();
    expect(revokeSpy).toHaveBeenCalledWith('blob:test');
  });
});
