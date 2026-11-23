// Media validation for uploads. Never trusts the filename, extension or client MIME type:
// the file's leading bytes decide what it is.

export type MediaKind = 'video' | 'poster';

export interface SniffResult {
  mime: 'video/mp4' | 'video/quicktime' | 'video/webm' | 'image/jpeg' | 'image/png' | 'image/webp';
  kind: MediaKind;
}

const ascii = (bytes: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...bytes.subarray(start, start + len));

/** Identify a file from its magic bytes (first 16+ bytes). Returns null for anything unsupported. */
export function sniffMedia(bytes: Uint8Array): SniffResult | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', kind: 'poster' };
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a) {
    return { mime: 'image/png', kind: 'poster' };
  }
  // WEBP: RIFF....WEBP
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return { mime: 'image/webp', kind: 'poster' };
  // WebM / Matroska: EBML header 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { mime: 'video/webm', kind: 'video' };
  }
  // ISO BMFF (MP4 / MOV): [size]ftyp[brand]
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand === 'qt  ') return { mime: 'video/quicktime', kind: 'video' };
    const videoBrands = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'MSNV', '3gp4', '3gp5', '3g2a'];
    if (videoBrands.includes(brand)) return { mime: 'video/mp4', kind: 'video' };
    // HEIC/AVIF also use ftyp — explicitly unsupported.
    return null;
  }
  return null;
}

export const EXTENSION_FOR: Record<SniffResult['mime'], string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const CATEGORIES = ['entertainment', 'business_promotion', 'public_complaint', 'news', 'part_time_jobs'] as const;
export const COMPLAINT_SUBCATEGORIES = [
  'civic_infrastructure', 'corruption', 'consumer_rights', 'public_safety', 'health', 'education', 'environment', 'other',
] as const;
export const LANGUAGES = ['en', 'hi', 'bn', 'te', 'mr', 'ta', 'ur', 'gu', 'kn', 'ml', 'or', 'pa', 'as'] as const;

export interface CreatePostInput {
  kind: MediaKind;
  mediaPath: string;
  thumbnailPath: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  caption: string;
  category: (typeof CATEGORIES)[number];
  language: string;
  location: string | null;
  cta: { type: string; url: string; label: string | null } | null;
  complaint: {
    subcategory: (typeof COMPLAINT_SUBCATEGORIES)[number];
    description: string;
    location: string;
    legalAssistanceRequested: boolean;
    forwardRequested: boolean;
    authorityId: string | null;
  } | null;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_NAME_RE = /^[A-Za-z0-9._-]{1,160}$/;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const optInt = (v: unknown, max: number): number | null | undefined => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined;
};

/** Validates the create-post request body. `userId` scopes allowed storage paths. */
export function validateCreatePost(body: unknown, userId: string): Validation<CreatePostInput> {
  const errors: Record<string, string> = {};
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const kind = b.kind === 'video' || b.kind === 'poster' ? b.kind : null;
  if (!kind) errors.kind = 'Choose video or poster.';

  const ownPath = (p: unknown): string | null => {
    const s = str(p);
    const [folder, name, ...rest] = s.split('/');
    return folder === userId && name && rest.length === 0 && SAFE_NAME_RE.test(name) ? s : null;
  };
  const mediaPath = ownPath(b.mediaPath);
  if (!mediaPath) errors.mediaPath = 'Upload the media file first.';
  const thumbnailPath = b.thumbnailPath ? ownPath(b.thumbnailPath) : null;
  if (b.thumbnailPath && !thumbnailPath) errors.thumbnailPath = 'Invalid thumbnail.';

  const width = optInt(b.width, 20000);
  const height = optInt(b.height, 20000);
  const durationMs = optInt(b.durationMs, 24 * 3600 * 1000);
  if (width === undefined || height === undefined) errors.dimensions = 'Invalid media dimensions.';
  if (durationMs === undefined) errors.durationMs = 'Invalid duration.';

  const caption = str(b.caption);
  if (caption.length > 2200) errors.caption = 'Captions can be at most 2200 characters.';

  const category = CATEGORIES.find((c) => c === b.category);
  if (!category) errors.category = 'Choose a category.';

  const language = LANGUAGES.find((l) => l === b.language) ?? (b.language ? undefined : 'en');
  if (!language) errors.language = 'Choose a supported language.';

  const location = str(b.location) || null;
  if (location && location.length > 120) errors.location = 'Location can be at most 120 characters.';

  let cta: CreatePostInput['cta'] = null;
  if (b.cta && typeof b.cta === 'object') {
    const c = b.cta as Record<string, unknown>;
    const type = str(c.type);
    const url = str(c.url);
    const label = str(c.label) || null;
    if (!/^[a-z_]{2,32}$/.test(type)) errors.ctaType = 'Choose a call-to-action.';
    if (!url || url.length > 500) errors.ctaUrl = 'Enter the call-to-action link.';
    if (label && label.length > 40) errors.ctaLabel = 'Button text can be at most 40 characters.';
    cta = { type, url, label };
  }

  let complaint: CreatePostInput['complaint'] = null;
  if (category === 'public_complaint') {
    const c = (b.complaint && typeof b.complaint === 'object' ? b.complaint : {}) as Record<string, unknown>;
    const subcategory = COMPLAINT_SUBCATEGORIES.find((s) => s === c.subcategory);
    const description = str(c.description);
    const cLocation = str(c.location);
    const authorityId = c.authorityId ? str(c.authorityId) : null;
    if (!subcategory) errors['complaint.subcategory'] = 'Choose a complaint type.';
    if (description.length < 20 || description.length > 5000) {
      errors['complaint.description'] = 'Describe the issue in 20–5000 characters.';
    }
    if (cLocation.length < 3 || cLocation.length > 200) errors['complaint.location'] = 'Enter where this happened.';
    if (authorityId && !UUID_RE.test(authorityId)) errors['complaint.authorityId'] = 'Choose a valid authority.';
    if (c.acceptedDisclaimer !== true) errors['complaint.acceptedDisclaimer'] = 'Please confirm the complaint declaration.';
    if (subcategory) {
      complaint = {
        subcategory, description, location: cLocation,
        legalAssistanceRequested: c.legalAssistanceRequested === true,
        forwardRequested: c.forwardRequested === true && !!authorityId,
        authorityId,
      };
    }
  } else if (b.complaint) {
    errors.complaint = 'Complaint details only apply to Public Complaint posts.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: kind!, mediaPath: mediaPath!, thumbnailPath, width: width ?? null, height: height ?? null,
      durationMs: durationMs ?? null, caption, category: category!, language: language!, location, cta, complaint,
    },
  };
}

/** Size limit (bytes) for a media kind from public settings (MB). */
export function maxBytes(kind: MediaKind, settings: Record<string, unknown>): number {
  const mb = Number(kind === 'video' ? settings['uploads.max_video_mb'] ?? 100 : settings['uploads.max_image_mb'] ?? 10);
  return Math.max(1, mb) * 1024 * 1024;
}
