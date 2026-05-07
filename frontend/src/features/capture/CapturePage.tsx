import { useState, useEffect, useCallback, useRef } from 'react';
import { usePromptStore } from '../../stores/promptStore';
import { useJobStore } from '../../stores/jobStore';
import { useCamera } from './useCamera';
import CameraView from './CameraView';
import PromptSelector from './PromptSelector';
import VariableEditor from './VariableEditor';
import JobProgress from './JobProgress';
import ResultView from './ResultView';

type CaptureStep =
  | 'prompt_select'
  | 'variable_edit'
  | 'camera_capture'
  | 'submitting'
  | 'polling'
  | 'completed'
  | 'failed';

export default function CapturePage() {
  const { prompts, selectedPromptId, isLoading, error: promptError, fetchPrompts, selectPrompt } = usePromptStore();
  const { activeJob, imageBlobUrl, submitJob, startPolling, stopPolling, clearActiveJob } = useJobStore();
  const {
    isReady: cameraReady,
    error: cameraError,
    capturedBlob,
    videoRef,
    startCamera,
    stopCamera,
    capture: doCapture,
    flipCamera,
    clearCapture,
  } = useCamera({ maxDimension: 1920 });

  const [step, setStep] = useState<CaptureStep>('prompt_select');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedBlob, setSubmittedBlob] = useState<Blob | null>(null);
  const pollStartRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch prompts on mount
  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopPolling();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stopCamera, stopPolling]);

  // Timer during polling
  useEffect(() => {
    if (step === 'polling') {
      pollStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - pollStartRef.current);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step]);

  // Detect job completion via store
  useEffect(() => {
    if (activeJob) {
      if (activeJob.status === 'completed') setStep('completed');
      else if (activeJob.status === 'failed') setStep('failed');
      else if (activeJob.status === 'pending' || activeJob.status === 'processing') {
        if (step !== 'polling') setStep('polling');
      }
    }
  }, [activeJob, step]);

  // Navigate to job detail on completion (results are ephemeral)
  const selectedPrompt = prompts.find((p) => p.id === selectedPromptId);

  // Get full prompt data for variable editor
  const promptTemplate = selectedPrompt
    ? ((selectedPrompt as unknown as Record<string, unknown>)?.template as string || '')
    : '';
  const promptRequiredVars = (selectedPrompt as unknown as Record<string, unknown>)?.requiredVariables as string[] ?? [];
  const promptDefaults = (selectedPrompt as unknown as Record<string, unknown>)?.defaultVariables as Record<string, string> ?? {};

  const handleSelectPrompt = useCallback(
    (id: string) => {
      selectPrompt(id);
      setVariables({});
      setStep('variable_edit');
    },
    [selectPrompt],
  );

  const handleVariablesChange = useCallback(
    (name: string, value: string) => {
      setVariables((prev) => ({ ...prev, [name]: value }));
    },
    [],
  );

  const allRequiredFilled = promptRequiredVars.every(
    (v) => variables[v]?.trim(),
  );

  const handleReadyVariables = useCallback(() => {
    setStep('camera_capture');
    startCamera();
  }, [startCamera]);

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    clearCapture();
    setStep('submitting');
  }, [clearCapture]);

  const handleCapture = useCallback(() => {
    doCapture();
  }, [doCapture]);

  const handleRetake = useCallback(() => {
    clearCapture();
  }, [clearCapture]);

  const handleUsePhoto = useCallback(() => {
    if (capturedBlob) {
      stopCamera(); // kill the stream so the green light turns off
      setSubmittedBlob(capturedBlob);
      setStep('submitting');
    }
  }, [capturedBlob, stopCamera]);

  // Submit job when we have an image (from camera or file)
  useEffect(() => {
    if (step !== 'submitting') return;

    const submit = async () => {
      try {
        setSubmitError(null);
        setElapsedMs(0);

        const formData = new FormData();

        // Use captured blob or selected file
        if (submittedBlob) {
          formData.append('image', submittedBlob, 'capture.jpg');
        } else if (selectedFile) {
          formData.append('image', selectedFile);
        } else {
          setSubmitError('No image provided.');
          setStep('camera_capture');
          return;
        }

        if (!selectedPromptId) {
          setSubmitError('Please select a prompt first.');
          setStep('prompt_select');
          return;
        }

        formData.append('promptId', selectedPromptId);
        formData.append('expectedOutcome', selectedPrompt?.supportedOutcomes[0] || 'text');
        formData.append('variables', JSON.stringify(variables));

        const jobId = await submitJob(formData);
        setStep('polling');
        startPolling(jobId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to submit job';
        setSubmitError(msg);
        setStep('failed');
      }
    };

    submit();
  }, [step, selectedFile, submittedBlob, selectedPromptId, selectedPrompt, variables, submitJob, startPolling]);

  const handleCancel = useCallback(() => {
    stopPolling();
    clearActiveJob();
    setStep('prompt_select');
    setVariables({});
    setSelectedFile(null);
    setSubmittedBlob(null);
  }, [stopPolling, clearActiveJob]);

  const handleRetry = useCallback(() => {
    clearActiveJob();
    setSubmitError(null);
    setStep('camera_capture');
    clearCapture();
  }, [clearActiveJob, clearCapture]);

  const handleNewJob = useCallback(() => {
    clearActiveJob();
    setStep('prompt_select');
    setVariables({});
    setSelectedFile(null);
    setSubmittedBlob(null);
  }, [clearActiveJob]);

  return (
    <div className="flex flex-col gap-5 pb-24 px-2">
      {/* Step indicator */}
      <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-400 mt-2" aria-label="Progress">
        {(['prompt_select', 'variable_edit', 'camera_capture', 'submitting', 'polling', 'completed'] as const).map(
          (s, i) => {
            const isDone = (
              (s === 'prompt_select' && step !== 'prompt_select') ||
              (s === 'variable_edit' && step !== 'prompt_select' && step !== 'variable_edit') ||
              (s === 'camera_capture' && ['submitting','polling','completed'].includes(step)) ||
              (s === 'submitting' && ['polling','completed'].includes(step)) ||
              (s === 'polling' && step === 'completed')
            );
            const isCurrent = step === s;
            return (
              <span key={s} className="flex items-center gap-1">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                    ${isDone
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-indigo-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    }`}
                >
                  {isDone ? '✓' : i + 1}
                </span>
                {i < 5 && <span className="w-3 h-px bg-slate-300 dark:bg-slate-600" />}
              </span>
            );
          },
        )}
      </nav>

      {/* Prompt Select */}
      {(step === 'prompt_select' || step === 'variable_edit') && (
        <>
          <PromptSelector
            prompts={prompts}
            selectedPromptId={selectedPromptId}
            isLoading={isLoading}
            error={promptError}
            onSelect={handleSelectPrompt}
            onRefresh={fetchPrompts}
          />

          {step === 'variable_edit' && selectedPrompt && (
            <div className="space-y-3">
              <VariableEditor
                template={promptTemplate}
                requiredVariables={promptRequiredVars}
                defaultVariables={promptDefaults}
                values={variables}
                onChange={handleVariablesChange}
              />
              <button
                onClick={handleReadyVariables}
                disabled={!allRequiredFilled}
                className="w-full py-3 rounded-lg font-semibold text-sm transition-all
                           bg-indigo-500 text-white hover:bg-indigo-400
                           disabled:opacity-40 disabled:cursor-not-allowed
                           active:scale-[0.98] shadow-sm"
              >
                {allRequiredFilled ? 'Ready — Open Camera' : 'Fill required variables'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Camera */}
      {step === 'camera_capture' && (
        <>
          {cameraError && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
              {cameraError}
            </div>
          )}
          <CameraView
            videoRef={videoRef}
            isReady={cameraReady}
            capturedBlob={capturedBlob}
            onFileSelect={handleFileSelect}
            onCapture={handleCapture}
            onRetake={handleRetake}
          />
          {capturedBlob && (
            <button
              onClick={handleUsePhoto}
              className="w-full max-w-md mx-auto py-3 rounded-lg font-semibold text-sm transition-all
                         bg-emerald-500 text-white hover:bg-emerald-400 active:scale-[0.98] shadow-sm"
            >
              Use This Photo →
            </button>
          )}
          {cameraReady && (
            <button
              onClick={flipCamera}
              className="w-full max-w-md mx-auto py-2 rounded-lg text-sm text-slate-500 dark:text-slate-400
                         hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              Flip Camera
            </button>
          )}
        </>
      )}

      {/* Submitting / Polling / Completed / Failed */}
      {(step === 'submitting' || step === 'polling' || step === 'completed' || step === 'failed') && (
        <div className="space-y-4 max-w-md mx-auto w-full">
          {/* Show captured image in polling/completed */}
          {(submittedBlob || selectedFile) && step !== 'failed' && (
            <div className="rounded-xl overflow-hidden shadow-sm max-h-48">
              <img
                src={
                  submittedBlob
                    ? URL.createObjectURL(submittedBlob)
                    : selectedFile
                      ? URL.createObjectURL(selectedFile)
                      : ''
                }
                alt="Submitted"
                className="w-full h-48 object-cover"
              />
            </div>
          )}

          {/* Submitting state */}
          {step === 'submitting' && (
            <div className="text-center py-4">
              <div className="animate-spin w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Uploading image...</p>
            </div>
          )}

          {/* Polling */}
          {step === 'polling' && activeJob && (
            <JobProgress
              status={activeJob.status}
              elapsedMs={elapsedMs}
              errorMessage={activeJob.error?.message}
            />
          )}

          {/* Completed */}
          {step === 'completed' && (
            <>
              <div className="text-center py-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="text-lg">🎉</span> Done!
                </span>
              </div>
              <ResultView job={activeJob} imageBlobUrl={imageBlobUrl} />
            </>
          )}

          {/* Failed */}
          {step === 'failed' && (
            <>
              <JobProgress
                status="failed"
                elapsedMs={elapsedMs}
                errorMessage={
                  submitError ||
                  activeJob?.error?.message ||
                  'An unknown error occurred'
                }
              />
              <div className="flex gap-2">
                <button
                  onClick={handleRetry}
                  className="flex-1 py-2.5 rounded-lg font-medium text-sm
                             bg-indigo-500 text-white hover:bg-indigo-400 active:scale-[0.98]"
                >
                  Retry
                </button>
                <button
                  onClick={handleNewJob}
                  className="flex-1 py-2.5 rounded-lg font-medium text-sm
                             bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200
                             hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-[0.98]"
                >
                  New Job
                </button>
              </div>
            </>
          )}

          {/* Cancel during polling */}
          {(step === 'polling') && (
            <button
              onClick={handleCancel}
              className="w-full py-2 rounded-lg text-sm text-slate-400 hover:text-red-500 transition-colors"
            >
              Cancel
            </button>
          )}

          {/* New Job after completion */}
          {step === 'completed' && (
            <button
              onClick={handleNewJob}
              className="w-full py-2.5 rounded-lg font-medium text-sm
                         bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200
                         hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-[0.98]"
            >
              Start New Job
            </button>
          )}
        </div>
      )}
    </div>
  );
}
