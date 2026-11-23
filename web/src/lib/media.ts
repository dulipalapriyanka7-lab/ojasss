// Client-side media helpers: public URLs, type sniffing, video metadata, thumbnails and
// image compression. The server re-verifies everything (create-post edge function).
import { env, AVATAR_BUCKET, MEDIA_BUCKET } from './env';

export function mediaUrl(path: string | null | undefined, bucket: string = MEDIA_BUCKET): string | null {
  if (!path) return null;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${env.supabaseUrl}/storage/v1/object/public/${bucket}/${encoded}`;
}

export const avatarUrl = (path: string | null | undefined) => mediaUrl(path, AVATAR_BUCKET);

export type SniffedMime = 'video/mp4' | 'video/quicktime' | 'video/webm' | 'image/jpeg' | 'image/png' | 'image/webp';

/** Same rules as the server (supabase/functions/_shared/media.ts). */
export function sniffBytes(b: Uint8Array): SniffedMime | null {
  if (b.length < 12) return null;
  const s = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'image/png';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'image/webp';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  if (s(4, 4) === 'ftyp') {
    const brand = s(8, 4);
    if (brand === 'qt  ') return 'video/quicktime';
    if (['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'MSNV', '3gp4', '3gp5', '3g2a'].includes(brand)) {
      return 'video/mp4';
    }
  }
  return null;
}

export async function sniffFile(file: Blob): Promise<SniffedMime | null> {
  return sniffBytes(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
}

export const EXT: Record<SniffedMime, string> = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

export const isVideoMime = (m: string) => m.startsWith('video/');

export interface VideoMeta {
  width: number;
  height: number;
  durationMs: number;
  thumbnail: Blob;
}

/** Reads dimensions/duration and captures a poster frame (~10% in, max 1s). */
export function inspectVideo(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This video could not be read. Try an MP4 (H.264) file.'));
    };
    v.onerror = fail;
    v.onloadedmetadata = () => {
      if (!v.videoWidth || !v.videoHeight || !Number.isFinite(v.duration)) return fail();
      v.currentTime = Math.min(1, v.duration * 0.1);
    };
    v.onseeked = () => {
      const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) return fail();
        resolve({ width: v.videoWidth, height: v.videoHeight, durationMs: Math.round(v.duration * 1000), thumbnail: blob });
      }, 'image/jpeg', 0.82);
    };
  });
}

/**
 * Re-encodes images above a size/dimension budget. Re-encoding also strips EXIF metadata
 * (including GPS location), which protects creators' privacy.
 */
export async function compressImage(file: File, maxEdge = 2160, quality = 0.86): Promise<{ blob: Blob; width: number; height: number; mime: SniffedMime }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality));
  if (blob && blob.type === 'image/webp') return { blob, width, height, mime: 'image/webp' };
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!jpeg) throw new Error('This image could not be processed.');
  return { blob: jpeg, width, height, mime: 'image/jpeg' };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
