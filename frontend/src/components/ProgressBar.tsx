interface ProgressBarProps {
  /** Whether the bar should show an animated/pulsing state (e.g., when pending) */
  animated?: boolean;
  /** Optional percentage (0-100). If omitted, shows indeterminate animation. */
  percent?: number;
}

export default function ProgressBar({
  animated = false,
  percent,
}: ProgressBarProps) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <div
        className={`h-2 rounded-full bg-indigo-600 transition-all duration-500 dark:bg-indigo-400 ${
          animated ? 'animate-pulse' : ''
        } ${percent === undefined ? 'w-1/2 animate-[indeterminate_1.5s_ease-in-out_infinite]' : ''}`}
        style={
          percent !== undefined
            ? { width: `${Math.min(100, Math.max(0, percent))}%` }
            : undefined
        }
      />
    </div>
  );
}
