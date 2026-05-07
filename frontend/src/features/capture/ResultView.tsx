import { useState } from 'react';
import type { Job } from '../../types/job';

interface ResultViewProps {
  job: Job | null;
  imageBlobUrl: string | null;
}

export default function ResultView({ job, imageBlobUrl }: ResultViewProps) {
  const [copied, setCopied] = useState(false);

  if (!job || job.status !== 'completed') return null;

  const isText = job.expectedOutcome === 'text';
  const resultText = isText ? job.result?.text : null;
  const metadata = job.metadata;

  const handleCopy = async () => {
    if (resultText) {
      try {
        await navigator.clipboard.writeText(resultText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback for browsers without clipboard API
        const ta = document.createElement('textarea');
        ta.value = resultText;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleDownloadText = () => {
    if (!resultText) return;
    const blob = new Blob([resultText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `imagen-result-${job.jobId.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShareOrDownloadImage = async () => {
    if (!imageBlobUrl) return;
    try {
      const response = await fetch(imageBlobUrl);
      const blob = await response.blob();
      const file = new File([blob], `imagen-${job.jobId.slice(0, 8)}.jpg`, {
        type: 'image/jpeg',
      });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        // Desktop fallback — force download
        const a = document.createElement('a');
        a.href = imageBlobUrl;
        a.download = `imagen-${job.jobId.slice(0, 8)}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      // Fallback download
      const a = document.createElement('a');
      a.href = imageBlobUrl;
      a.download = `imagen-${job.jobId.slice(0, 8)}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="space-y-4">
      {/* Text result */}
      {isText && resultText && (
        <>
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                          max-h-96 overflow-y-auto text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
            {resultText}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 py-2.5 rounded-lg font-medium text-sm transition-all
                         bg-indigo-500 text-white hover:bg-indigo-400 active:scale-[0.98] shadow-sm"
            >
              {copied ? 'Copied! ✓' : 'Copy to Clipboard'}
            </button>
            <button
              onClick={handleDownloadText}
              className="flex-1 py-2.5 rounded-lg font-medium text-sm transition-all
                         bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200
                         hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-[0.98]"
            >
              Download .txt
            </button>
          </div>
        </>
      )}

      {/* Image result */}
      {!isText && imageBlobUrl && (
        <>
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <img
              src={imageBlobUrl}
              alt="Generated result"
              className="w-full h-auto"
            />
          </div>
          <button
            onClick={handleShareOrDownloadImage}
            className="w-full py-3 rounded-lg font-medium text-sm transition-all
                       bg-indigo-500 text-white hover:bg-indigo-400 active:scale-[0.98] shadow-sm"
          >
            Save to Photos / Download
          </button>
        </>
      )}

      {/* Metadata */}
      {metadata && (
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
            Details
          </h4>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-slate-400 dark:text-slate-500">Prompt</dt>
            <dd className="text-slate-700 dark:text-slate-300 font-mono">
              {metadata.promptUsed}
            </dd>
            <dt className="text-slate-400 dark:text-slate-500">Model</dt>
            <dd className="text-slate-700 dark:text-slate-300">
              {metadata.modelVersion}
            </dd>
            <dt className="text-slate-400 dark:text-slate-500">Time</dt>
            <dd className="text-slate-700 dark:text-slate-300">
              {metadata.processingTime
                ? `${(metadata.processingTime / 1000).toFixed(1)}s`
                : 'N/A'}
            </dd>
          </dl>
        </div>
      )}
    </div>
  );
}
