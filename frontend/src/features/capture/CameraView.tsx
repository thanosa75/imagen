import { useRef, useEffect } from 'react';

interface CameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isReady: boolean;
  capturedBlob: Blob | null;
  onFileSelect: (file: File) => void;
  onCapture: () => void;
  onRetake: () => void;
}

export default function CameraView({
  videoRef,
  isReady,
  capturedBlob,
  onFileSelect,
  onCapture,
  onRetake,
}: CameraViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // Update preview URL when captured blob changes
  useEffect(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (capturedBlob) {
      previewUrlRef.current = URL.createObjectURL(capturedBlob);
    }
  }, [capturedBlob]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };

  // Show captured preview
  if (capturedBlob && previewUrlRef.current) {
    return (
      <div className="relative w-full max-w-md mx-auto rounded-2xl overflow-hidden shadow-lg">
        <img
          src={previewUrlRef.current}
          alt="Captured"
          className="w-full h-auto object-cover"
        />
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
          <button
            onClick={onRetake}
            className="px-5 py-2.5 bg-slate-800/80 text-white rounded-full text-sm font-medium backdrop-blur-sm hover:bg-slate-700/80 transition-colors"
          >
            Retake
          </button>
          <button
            onClick={() => {}} // confirm is handled by CapturePage
            className="px-6 py-2.5 bg-emerald-500 text-white rounded-full text-sm font-medium shadow-lg hover:bg-emerald-400 transition-colors"
          >
            Use Photo ✓
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Video stream */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-900 shadow-lg aspect-[3/4]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Overlay guides */}
        {isReady && (
          <div className="absolute inset-0 border-2 border-white/20 rounded-2xl pointer-events-none">
            <div className="absolute inset-4 border border-dashed border-white/10 rounded-lg" />
          </div>
        )}

        {/* Camera not ready state */}
        {!isReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-800">
            <svg className="w-12 h-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
            <p className="text-slate-400 text-sm">Camera starting...</p>
          </div>
        )}
      </div>

      {/* Camera controls */}
      <div className="mt-4 flex items-center justify-center gap-4">
        {/* Capture button */}
        <button
          onClick={onCapture}
          disabled={!isReady}
          className="w-16 h-16 rounded-full border-4 border-white bg-white/10 flex items-center justify-center
                     hover:bg-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed
                     active:scale-95 shadow-lg"
        >
          <div className="w-12 h-12 rounded-full bg-white" />
        </button>
      </div>

      {/* File upload fallback */}
      <div className="mt-3 text-center">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          or choose from gallery
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}
