// ── Camera Store ─────────────────────────────────────────────
import { create } from 'zustand';

interface CameraState {
  stream: MediaStream | null;
  isReady: boolean;
  capturedBlob: Blob | null;
  facingMode: 'user' | 'environment';
  error: string | null;

  startCamera: () => Promise<void>;
  stopCamera: () => void;
  capture: (videoRef: HTMLVideoElement) => void;
  flipCamera: () => void;
  clearCapture: () => void;
}

export const useCameraStore = create<CameraState>()((set, get) => ({
  stream: null,
  isReady: false,
  capturedBlob: null,
  facingMode: 'environment',
  error: null,

  startCamera: async () => {
    const { stopCamera } = get();

    // Stop any existing stream
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: get().facingMode,
          width: { ideal: 1920 },
        },
      });

      set({
        stream,
        isReady: true,
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera access denied. Please grant camera permission.'
          : err instanceof DOMException && err.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : 'Failed to start camera.';

      set({
        stream: null,
        isReady: false,
        error: message,
      });
    }
  },

  stopCamera: () => {
    const { stream } = get();
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    set({ stream: null, isReady: false });
  },

  capture: (videoRef: HTMLVideoElement) => {
    if (!videoRef || videoRef.readyState < 2) {
      set({ error: 'Video not ready for capture.' });
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.videoWidth;
      canvas.height = videoRef.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        set({ error: 'Failed to create canvas context.' });
        return;
      }

      ctx.drawImage(videoRef, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            set({ capturedBlob: blob, error: null });
          } else {
            set({ error: 'Failed to capture image.' });
          }
        },
        'image/jpeg',
        0.92,
      );
    } catch {
      set({ error: 'Failed to capture image.' });
    }
  },

  flipCamera: () => {
    const { stopCamera, startCamera } = get();
    stopCamera();
    set((state) => ({
      facingMode: state.facingMode === 'user' ? 'environment' : 'user',
    }));
    // Restart camera with new facing mode
    startCamera();
  },

  clearCapture: () => {
    set({ capturedBlob: null, error: null });
  },
}));
