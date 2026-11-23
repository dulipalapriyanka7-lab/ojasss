import type { VideoEdit } from './videoEdit';

export function exportVideoEdit(file: File, edit: VideoEdit, width: number, height: number, maxBytes: number, edge: number, signal: AbortSignal, onProgress: (progress: number) => void) {
  return new Promise<File>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Export cancelled', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('../workers/videoEdit.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Export cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = () => {
      cleanup();
      reject(new Error('The video editor could not start on this device.'));
    };
    worker.onmessage = ({ data }) => {
      if (typeof data.progress === 'number') {
        onProgress(data.progress);
        return;
      }
      cleanup();
      if (data.blob instanceof Blob) {
        resolve(new File([data.blob], `${file.name.replace(/\.[^.]+$/, '')}-edited.mp4`, { type: 'video/mp4' }));
      } else {
        reject(new Error(data.error || 'Video export failed.'));
      }
    };
    try {
      worker.postMessage({ file, edit, width, height, maxBytes, edge });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export function loadAudioPeaks(file: File, seconds: number, onPeaks: (peaks: number[] | null) => void) {
  const worker = new Worker(new URL('../workers/videoEdit.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => { worker.terminate(); onPeaks(data.peaks ?? null); };
  worker.onerror = () => { worker.terminate(); onPeaks(null); };
  worker.postMessage({ file, seconds, waveform: true });
  return () => worker.terminate();
}
