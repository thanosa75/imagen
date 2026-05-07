import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import StatusBadge from '../../components/StatusBadge';
import api from '../../lib/api';
import type { Job } from '../../types/job';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pollActive, setPollActive] = useState(true);

  useEffect(() => {
    if (!id) return;

    let stop = false;

    const fetch = async () => {
      try {
        const data = await api.getJobStatus(id);
        if (stop) return;
        setJob(data);
        setLoading(false);

        if (data.status === 'completed' && data.expectedOutcome === 'image') {
          try {
            const blob = await api.getJobImage(id);
            if (stop) return;
            setImageUrl(URL.createObjectURL(blob));
          } catch { /* image load failed */ }
        }

        if (data.status === 'completed' || data.status === 'failed') {
          setPollActive(false);
        }
      } catch (err) {
        if (stop) return;
        setError(err instanceof Error ? err.message : 'Failed to load job');
        setLoading(false);
        setPollActive(false);
      }
    };

    fetch();

    // Poll if active
    if (pollActive) {
      const interval = setInterval(fetch, 2000);
      return () => {
        stop = true;
        clearInterval(interval);
      };
    }

    return () => { stop = true; };
  }, [id]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="animate-pulse h-8 w-48 rounded bg-slate-200 dark:bg-slate-700" />
        <div className="animate-pulse h-64 rounded-xl bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        <Link to="/jobs" className="text-xs text-indigo-500 underline mt-2 inline-block">
          Back to Jobs
        </Link>
      </div>
    );
  }

  if (!job) return null;

  const isText = job.expectedOutcome === 'text';

  return (
    <div className="space-y-4 pb-20">
      <Link
        to="/jobs"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700
                   dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Jobs
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <StatusBadge status={job.status} />
        <div>
          <p className="text-sm font-mono text-slate-500 dark:text-slate-400">{job.jobId.slice(0, 8)}...</p>
          <p className="text-xs text-slate-400">
            {job.promptId} · {job.expectedOutcome}
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {(['pending', 'processing', 'completed'] as const).map((s, i) => {
          const reached =
            s === 'completed' && job.status === 'completed'
              ? true
              : (s === 'pending' && (job.status !== 'pending')) ||
                  (s === 'processing' && (job.status === 'processing' || job.status === 'completed'));

          return (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px]
                  ${reached ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}
              >
                {reached ? '✓' : i + 1}
              </div>
              <span className={`text-xs ${reached ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>
                {s === 'pending' ? 'Queued' : s === 'processing' ? 'Processing' : 'Completed'}
              </span>
            </div>
          );
        })}
        {job.status === 'failed' && (
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-red-500 text-white">
              ✕
            </div>
            <span className="text-xs text-red-600 dark:text-red-400">Failed</span>
          </div>
        )}
      </div>

      {/* Result */}
      {job.status === 'completed' && (
        <div className="space-y-3">
          {isText && job.result?.text && (
            <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                            text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap max-h-80 overflow-y-auto">
              {job.result.text}
            </div>
          )}
          {!isText && imageUrl && (
            <div className="rounded-2xl overflow-hidden shadow-sm">
              <img src={imageUrl} alt="Generated" className="w-full h-auto" />
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {job.status === 'failed' && job.error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">{job.error.code}</p>
          <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">{job.error.message}</p>
        </div>
      )}

      {/* Metadata */}
      {job.metadata && (
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 text-xs">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span className="text-slate-400">Prompt:</span>
            <span className="text-slate-700 dark:text-slate-300 font-mono">{job.metadata.promptUsed}</span>
            <span className="text-slate-400">Model:</span>
            <span className="text-slate-700 dark:text-slate-300">{job.metadata.modelVersion}</span>
            <span className="text-slate-400">Time:</span>
            <span className="text-slate-700 dark:text-slate-300">
              {job.metadata.processingTime ? `${(job.metadata.processingTime / 1000).toFixed(1)}s` : 'N/A'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
