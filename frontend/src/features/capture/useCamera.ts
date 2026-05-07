// ── Camera Hook ──────────────────────────────────────────────
import { useState, useCallback, useRef } from 'react';

interface UseCameraOptions {
  maxDimension?: number;
}

interface UseCameraReturn {
  stream: MediaStream | null;
  isReady: boolean;
  error: string | null;
  facingMode: 'user' | 'environment';
  capturedBlob: Blob | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  capture: () => void;
  flipCamera: () => void;
  clearCapture: () => void;
}

export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
  const { maxDimension = 1920 } = options;
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    stopTracks();

    try {
      const ms = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: false,
      });

      streamRef.current = ms;
      setStream(ms);

      if (videoRef.current) {
        videoRef.current.srcObject = ms;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsReady(true);
        };
      }
    } catch (err: unknown) {
      const msg =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera access denied. Please enable camera permissions.'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : `Camera error: ${err instanceof Error ? err.message : 'unknown'}`;
      setError(msg);
      setIsReady(false);
    }
  }, [facingMode, stopTracks]);

  const stopCamera = useCallback(() => {
    stopTracks();
    setStream(null);
    setCapturedBlob(null);
  }, [stopTracks]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !isReady) return;

    const canvas = document.createElement('canvas');
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Downscale to maxDimension on longest edge
    let w = vw;
    let h = vh;
    if (Math.max(w, h) > maxDimension) {
      const ratio = maxDimension / Math.max(w, h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(
      (blob) => {
        if (blob) setCapturedBlob(blob);
      },
      'image/jpeg',
      0.9,
    );
  }, [isReady, maxDimension]);

  const flipCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    // restart camera with new facing mode
    stopTracks();
    setTimeout(() => {
      startCamera();
    }, 100);
  }, [startCamera, stopTracks]);

  const clearCapture = useCallback(() => {
    setCapturedBlob(null);
  }, []);

  return {
    stream,
    isReady,
    error,
    facingMode,
    capturedBlob,
    videoRef,
    startCamera,
    stopCamera,
    capture,
    flipCamera,
    clearCapture,
  };
}
