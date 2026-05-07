import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../../components/StatusBadge';
import api from '../../lib/api';
import type { Job } from '../../types/job';

export default function JobsPage() {
  // Query for recent jobs by ID. Since there's no list endpoint, we store recent IDs in localStorage.
  const [recentJobIds, setRecentJobIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('imagen_recent_jobs') || '[]');
    } catch {
      return [];
    }
  });
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const fetchJobs = useCallback(async () => {
    if (recentJobIds.length === 0) return;
    setLoading(true);
    setError(null);
    const results: Record<string, Job> = {};
    for (const jobId of recentJobIds.slice(0, 20)) {
      try {
        const job = await api.getJobStatus(jobId);
        results[jobId] = job;
      } catch {
        // Job may have expired — skip
      }
    }
    setJobs(results);
    setLoading(false);
  }, [recentJobIds]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const jobList = Object.values(jobs).filter((j) =>
    filter === 'all' ? true : j.status === filter,
  );

  const clearHistory = () => {
    localStorage.removeItem('imagen_recent_jobs');
    setRecentJobIds([]);
    setJobs({});
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Jobs</h1>
        {recentJobIds.length > 0 && (
          <button
            onClick={clearHistory}
            className="text-xs text-slate-400 hover:text-red-500 transition-colors"
          >
            Clear history
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
        {(['all', 'pending', 'processing', 'completed', 'failed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all
              ${filter === f
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
              }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && <div className="animate-pulse h-16 rounded-xl bg-slate-200 dark:bg-slate-700" />}

      {/* Empty */}
      {!loading && jobList.length === 0 && (
        <p className="text-center text-sm text-slate-400 py-8">
          {recentJobIds.length === 0
            ? 'No jobs yet. Submit a job from the Capture tab!'
            : 'No jobs match this filter.'}
        </p>
      )}

      {/* Job list */}
      <div className="space-y-2">
        {jobList.map((job) => (
          <Link
            key={job.jobId}
            to={`/jobs/${job.jobId}`}
            className="block p-3 rounded-xl border border-slate-200 dark:border-slate-700
                       bg-white dark:bg-slate-800 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StatusBadge status={job.status} />
                  <span className="text-xs font-mono text-slate-400 truncate">
                    {job.jobId.slice(0, 8)}...
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {job.promptId} · {job.expectedOutcome}
                </p>
              </div>
              <span className="text-[10px] text-slate-400 tabular-nums">
                {new Date(job.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
