// ── Job Store ────────────────────────────────────────────────
import { create } from 'zustand';
import api from '../lib/api';
import type { Job } from '../types/job';

/** Polling intervals (exponential backoff): 2s, 3s, 5s, 8s, 10s max */
const POLL_INTERVALS = [2000, 3000, 5000, 8000, 10000];

interface JobState {
  activeJob: Job | null;
  pollingIntervalId: ReturnType<typeof setInterval> | null;
  currentPollIndex: number;
  imageBlobUrl: string | null;

  submitJob: (formData: FormData) => Promise<string>;
  startPolling: (jobId: string) => void;
  stopPolling: () => void;
  fetchJobStatus: (jobId: string) => Promise<Job>;
  clearActiveJob: () => void;
}

export const useJobStore = create<JobState>()((set, get) => ({
  activeJob: null,
  pollingIntervalId: null,
  currentPollIndex: 0,
  imageBlobUrl: null,

  submitJob: async (formData: FormData): Promise<string> => {
    const created = await api.submitJob(formData);
    set({
      activeJob: {
        jobId: created.jobId,
        status: created.status,
        promptId: '',
        expectedOutcome: 'text',
        createdAt: created.createdAt,
        updatedAt: created.createdAt,
        completedAt: null,
      },
      currentPollIndex: 0,
    });

    // Persist job ID so the Jobs tab can show history
    try {
      const stored = JSON.parse(localStorage.getItem('imagen_recent_jobs') || '[]');
      stored.unshift(created.jobId);
      // Keep last 50
      localStorage.setItem('imagen_recent_jobs', JSON.stringify(stored.slice(0, 50)));
    } catch { /* localStorage unavailable */ }

    return created.jobId;
  },

  startPolling: (jobId: string) => {
    const { pollingIntervalId, currentPollIndex } = get();

    // Clear any existing polling
    if (pollingIntervalId !== null) {
      clearInterval(pollingIntervalId);
    }

    const poll = async () => {
      try {
        const job = await api.getJobStatus(jobId);
        set({ activeJob: job });

        // If we got an image result, fetch it
        if (
          job.status === 'completed' &&
          job.expectedOutcome === 'image'
        ) {
          try {
            const blob = await api.getJobImage(jobId);
            // Revoke previous blob URL if any
            const prevUrl = get().imageBlobUrl;
            if (prevUrl) {
              URL.revokeObjectURL(prevUrl);
            }
            const url = URL.createObjectURL(blob);
            set({ imageBlobUrl: url });
          } catch {
            // Image fetch failed — status already set
          }
        }

        // Stop polling when terminal state reached
        if (job.status === 'completed' || job.status === 'failed') {
          get().stopPolling();
        }
      } catch {
        // Keep polling on transient errors
      }
    };

    // Run first poll immediately
    poll();

    // Schedule subsequent polls with exponential backoff
    let index = currentPollIndex;
    const scheduleNext = () => {
      const interval = POLL_INTERVALS[Math.min(index, POLL_INTERVALS.length - 1)];
      const id = setTimeout(() => {
        // Bail if polling was explicitly stopped while waiting
        if (get().pollingIntervalId === null) return;
        poll();
        index++;
        set({ currentPollIndex: index });
        scheduleNext();
      }, interval);
      set({ pollingIntervalId: id });
    };

    scheduleNext();
  },

  stopPolling: () => {
    const id = get().pollingIntervalId;
    if (id !== null) {
      clearTimeout(id);
      set({ pollingIntervalId: null, currentPollIndex: 0 });
    }
  },

  fetchJobStatus: async (jobId: string): Promise<Job> => {
    const job = await api.getJobStatus(jobId);
    set({ activeJob: job });
    return job;
  },

  clearActiveJob: () => {
    get().stopPolling();
    const url = get().imageBlobUrl;
    if (url) {
      URL.revokeObjectURL(url);
    }
    set({
      activeJob: null,
      imageBlobUrl: null,
      currentPollIndex: 0,
    });
  },
}));
