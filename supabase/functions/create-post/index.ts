// POST /functions/v1/create-post
// Verifies uploaded media by magic bytes and size, then creates the post via a
// service-only database function. Clients cannot create posts any other way.
import { adminClient, env, requestUser } from '../_shared/clients.ts';
import { allowedOrigins, corsHeaders, errorResponse, fromRpcError, json, readJson } from '../_shared/http.ts';
import { maxBytes, sniffMedia, validateCreatePost } from '../_shared/media.ts';

const BUCKET = 'media';

async function headBytes(signedUrl: string): Promise<{ bytes: Uint8Array; size: number } | null> {
  const res = await fetch(signedUrl, { headers: { Range: 'bytes=0-63' } });
  if (!res.ok && res.status !== 206) return null;
  const bytes = new Uint8Array(await res.arrayBuffer()).subarray(0, 64);
  const range = res.headers.get('content-range'); // bytes 0-63/123456
  const size = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length') ?? bytes.length);
  return { bytes, size };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'), allowedOrigins(env));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST.', cors);

  const user = await requestUser(req);
  if (!user) return errorResponse(401, 'AUTH_REQUIRED', 'Please sign in to continue.', cors);

  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return errorResponse(400, 'BAD_REQUEST', 'Invalid request body.', cors);
  }
  const parsed = validateCreatePost(body, user.id);
  if (!parsed.ok) return errorResponse(422, 'VALIDATION_FAILED', 'Please check the highlighted fields.', cors, parsed.errors);
  const input = parsed.value;

  const admin = adminClient();
  const { data: settings } = await admin.rpc('public_settings');
  const toRemove = [input.mediaPath, ...(input.thumbnailPath ? [input.thumbnailPath] : [])];
  const reject = async (code: string, message: string) => {
    await admin.storage.from(BUCKET).remove(toRemove);
    return errorResponse(422, code, message, cors);
  };

  // Verify the main media object.
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(input.mediaPath, 60);
  const head = signed ? await headBytes(signed.signedUrl) : null;
  if (!head) return errorResponse(422, 'MEDIA_NOT_FOUND', 'Upload the media file first.', cors);
  const sniffed = sniffMedia(head.bytes);
  if (!sniffed || sniffed.kind !== input.kind) {
    return reject('UNSUPPORTED_MEDIA', input.kind === 'video'
      ? 'Upload an MP4, MOV or WebM video.' : 'Upload a JPG, PNG or WebP image.');
  }
  if (head.size > maxBytes(input.kind, settings ?? {})) {
    return reject('FILE_TOO_LARGE', 'This file is larger than the upload limit.');
  }
  const maxSeconds = Number((settings ?? {})['uploads.max_video_seconds'] ?? 180);
  if (input.kind === 'video' && input.durationMs !== null && input.durationMs > maxSeconds * 1000) {
    return reject('VIDEO_TOO_LONG', `Videos can be at most ${maxSeconds} seconds.`);
  }

  // Thumbnails must be real images.
  if (input.thumbnailPath) {
    const { data: tSigned } = await admin.storage.from(BUCKET).createSignedUrl(input.thumbnailPath, 60);
    const tHead = tSigned ? await headBytes(tSigned.signedUrl) : null;
    const tSniff = tHead ? sniffMedia(tHead.bytes) : null;
    if (!tHead || !tSniff || tSniff.kind !== 'poster' || tHead.size > 5 * 1024 * 1024) {
      return reject('INVALID_THUMBNAIL', 'The video thumbnail could not be processed.');
    }
  }

  const { data: postId, error } = await admin.rpc('internal_create_post', {
    p_user_id: user.id,
    p: {
      kind: input.kind,
      media_path: input.mediaPath,
      thumbnail_path: input.kind === 'poster' ? input.mediaPath : input.thumbnailPath,
      mime_type: sniffed.mime,
      size_bytes: head.size,
      width: input.width,
      height: input.height,
      duration_ms: input.kind === 'video' ? input.durationMs : null,
      caption: input.caption,
      category: input.category,
      language: input.language,
      location: input.location,
      cta_type: input.cta?.type ?? null,
      cta_url: input.cta?.url ?? null,
      cta_label: input.cta?.label ?? null,
      complaint: input.complaint && {
        subcategory: input.complaint.subcategory,
        description: input.complaint.description,
        location: input.complaint.location,
        legal_assistance_requested: input.complaint.legalAssistanceRequested,
        forward_requested: input.complaint.forwardRequested,
        authority_id: input.complaint.authorityId,
      },
    },
  });
  if (error) {
    if (error.code === 'PT422') await admin.storage.from(BUCKET).remove(toRemove);
    return fromRpcError(error, cors);
  }

  const { data: status } = await admin.from('posts').select('status').eq('id', postId).single();
  return json({ id: postId, status: status?.status ?? 'published' }, 201, cors);
});
