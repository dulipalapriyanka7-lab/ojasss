// Upload pipeline: storage upload with progress (XHR), then server-side verification +
// post creation in the create-post edge function.
import { AVATAR_BUCKET, env, MEDIA_BUCKET } from '@/lib/env';
import { EXT, type SniffedMime } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import {storageUploadUrl} from '@/lib/storageUploadUrl';
import { ApiError, friendly, invoke, kindForStatus } from './client';
import type { Category, PostKind } from './types';

export interface UploadHandle {
  promise: Promise<string>;
  abort: () => void;
}

/** Upload a blob to `<uid>/<random>.<ext>`. Filenames never come from the user. */
export function uploadObject(
  blob: Blob, mime: SniffedMime | 'image/gif', userId: string, onProgress?: (fraction: number) => void, bucket = MEDIA_BUCKET,
): UploadHandle {
  const path = `${userId}/${crypto.randomUUID()}.${mime==='image/gif'?'gif':EXT[mime]}`;
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new ApiError('session_expired', 'SESSION_EXPIRED', friendly('session_expired'), 401);
    await new Promise<void>((resolve, reject) => {
      xhr.open('POST', storageUploadUrl(env.supabaseUrl,bucket,path,env.mysql));
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', env.supabaseAnonKey);
      xhr.setRequestHeader('Content-Type', mime);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('cache-control', 'max-age=31536000');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        const status = xhr.status === 413 ? 422 : xhr.status;
        const kind = kindForStatus(status);
        let detail:string|undefined;try{const response=JSON.parse(xhr.responseText);const message=response.error?.message??response.message;if(typeof message==='string'&&message.length<500)detail=message;}catch{/* A hosting error may return HTML. */}
        reject(new ApiError(kind, xhr.status === 413 ? 'FILE_TOO_LARGE' : 'UPLOAD_FAILED',
          xhr.status === 413 ? 'This file is larger than the upload limit.' : detail??(xhr.status===404?'The media upload service could not be reached. Refresh and try again.':friendly(kind)), status));
      };
      xhr.onerror = () => reject(new ApiError(navigator.onLine ? 'unavailable' : 'network', 'NETWORK', friendly(navigator.onLine ? 'unavailable' : 'network')));
      xhr.onabort = () => reject(new ApiError('bad_request', 'ABORTED', 'Upload cancelled.'));
      xhr.send(blob);
    });
    onProgress?.(1);
    return path;
  })();
  return { promise, abort: () => xhr.abort() };
}

export const uploadAvatar = (blob: Blob, mime: SniffedMime, userId: string) =>
  uploadObject(blob, mime, userId, undefined, AVATAR_BUCKET);

export interface CreatePostRequest {
  profileStatus?: boolean;
  kind: PostKind;
  hashtags?:string[]; visibility?:'public'|'followers'|'private'; audioTitle?:string|null;
  repost?:{sourceUrl:string;rightsConfirmed:boolean}|null;
  contentOrigin: 'copy_paste' | 'new_content' | null;
  mediaPath: string;
  thumbnailPath: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  caption: string;
  category: Category;
  language: string;
  country: string;
  location: string | null;
  city?: string | null;
  cta: { type: string; url: string; label: string | null } | null;
  series?: {
    title:string; genre:string; episodeTitle?:string; episodeNumber:number; episodeTotal:number|null;
    access:'free'|'interest'|'premium'; interestGoal?:number; applyAccessToExisting?:boolean; applyThrough?:number|null;
  } | null;
  complaint: {
    subcategory: string;
    description: string;
    location: string;
    legalAssistanceRequested: boolean;
    forwardRequested: boolean;
    authorityId: string | null;
    acceptedDisclaimer: boolean;
  } | null;
}

export const createPost = (req: CreatePostRequest) =>
  invoke<{ id: string; status: 'published' | 'pending_review' }>('create-post', req);
