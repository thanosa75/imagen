import { useState, useEffect } from 'react';
import StatusBadge from '../../components/StatusBadge';

interface JobProgressProps {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  elapsedMs: number;
  errorMessage?: string | null;
}

const STATUS_MESSAGES: Record<string, string> = {
  pending: 'Job queued — waiting for a worker...',
  processing: 'Gemini is analyzing your image...',
  completed: 'Done!',
  failed: 'Job failed',
};

export default function JobProgress({
  status,
  elapsedMs,
  errorMessage,
}: JobProgressProps) {
  // For animation
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    if (status === 'completed' || status === 'failed') return;
    const id = setInterval(() => {
      setDotCount((n) => (n + 1) % 4);
    }, 500);
    return () => clearInterval(id);
  }, [status]);

  const seconds = Math.floor(elapsedMs / 1000);
  const elapsed = seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

  const isActive = status === 'pending' || status === 'processing';

  return (
    <div className="space-y-4">
      {/* Status line */}
      <div className="flex items-center gap-3">
        <StatusBadge status={status} />
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {STATUS_MESSAGES[status]}
          {isActive && (
            <span className="inline-block w-5">{'.'.repeat(dotCount)}</span>
          )}
        </span>
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="relative h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-1000
              ${status === 'pending'
                ? 'animate-pulse bg-amber-400 w-1/3'
                : 'bg-indigo-500 animate-gradient-x w-2/3'
              }`}
            style={
              status === 'processing'
                ? { backgroundImage: 'linear-gradient(90deg, #6366f1, #a855f7, #6366f1)', backgroundSize: '200% 100%' }
                : undefined
            }
          />
        </div>
      )}

      {/* Elapsed timer */}
      {isActive && (
        <p className="text-xs text-slate-400 tabular-nums">
          Elapsed: {elapsed}
        </p>
      )}

      {/* Error message */}
      {status === 'failed' && errorMessage && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-400">
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}
