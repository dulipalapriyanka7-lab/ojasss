import { describe, expect, it } from 'vitest';
import { codeDigest, emailDigest, generateOtp, hmacHex, isValidOtp, normalizeEmail, timingSafeEqual } from './deletion.ts';
import { corsHeaders, escapeHtml } from './http.ts';
import { maxBytes, sniffMedia, validateCreatePost } from './media.ts';
import { buildFcmMessage, safeLink } from './push.ts';
import { complaintForwardEmail, postOgHtml } from './templates.ts';

const SECRET = 'x'.repeat(48);
const USER = '11111111-1111-4111-8111-111111111111';

const bytes = (...parts: Array<number[] | string>) => {
  const out: number[] = [];
  for (const p of parts) out.push(...(typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p));
  while (out.length < 16) out.push(0);
  return new Uint8Array(out);
};

describe('media sniffing (content, not filename)', () => {
  it('recognises supported formats from magic bytes', () => {
    expect(sniffMedia(bytes([0xff, 0xd8, 0xff, 0xe0])))?.toMatchObject({ mime: 'image/jpeg', kind: 'poster' });
    expect(sniffMedia(bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a])))?.toMatchObject({ mime: 'image/png' });
    expect(sniffMedia(bytes('RIFF', [0, 0, 0, 0], 'WEBP')))?.toMatchObject({ mime: 'image/webp' });
    expect(sniffMedia(bytes([0, 0, 0, 0x20], 'ftypisom')))?.toMatchObject({ mime: 'video/mp4', kind: 'video' });
    expect(sniffMedia(bytes([0, 0, 0, 0x14], 'ftypqt  ')))?.toMatchObject({ mime: 'video/quicktime' });
    expect(sniffMedia(bytes([0x1a, 0x45, 0xdf, 0xa3])))?.toMatchObject({ mime: 'video/webm' });
  });

  it('rejects executables, scripts, HTML/SVG and HEIC even when renamed', () => {
    expect(sniffMedia(bytes('MZ', [0x90, 0]))).toBeNull(); // Windows PE
    expect(sniffMedia(bytes([0x7f], 'ELF'))).toBeNull();
    expect(sniffMedia(bytes('<svg xmlns="http'))).toBeNull();
    expect(sniffMedia(bytes('<!doctype html>'))).toBeNull();
    expect(sniffMedia(bytes('#!/bin/sh\nrm -rf'))).toBeNull();
    expect(sniffMedia(bytes('PK', [3, 4]))).toBeNull(); // zip / apk
    expect(sniffMedia(bytes([0, 0, 0, 0x18], 'ftypheic'))).toBeNull();
    expect(sniffMedia(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it('applies upload size limits from settings', () => {
    expect(maxBytes('video', { 'uploads.max_video_mb': 50 })).toBe(50 * 1024 * 1024);
    expect(maxBytes('poster', {})).toBe(10 * 1024 * 1024);
  });
});

describe('create-post validation', () => {
  const base = { kind: 'video', mediaPath: `${USER}/abc.mp4`, category: 'entertainment', caption: 'Hi', language: 'hi' };

  it('accepts a valid payload', () => {
    const r = validateCreatePost(base, USER);
    expect(r.ok).toBe(true);
  });

  it('rejects paths in another user\'s folder or with traversal', () => {
    for (const mediaPath of [`${'2'.repeat(8)}-2222-4222-8222-222222222222/a.mp4`, `${USER}/../x.mp4`, `${USER}/a/b.mp4`, '/etc/passwd']) {
      const r = validateCreatePost({ ...base, mediaPath }, USER);
      expect(r.ok).toBe(false);
    }
  });

  it('requires complaint details and the disclaimer for public complaints', () => {
    const r = validateCreatePost({ ...base, category: 'public_complaint' }, USER);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(expect.arrayContaining([
      'complaint.subcategory', 'complaint.description', 'complaint.location', 'complaint.acceptedDisclaimer',
    ]));
    const ok = validateCreatePost({
      ...base, category: 'public_complaint',
      complaint: {
        subcategory: 'health', description: 'The PHC has had no doctor for two months now.', location: 'Nashik',
        acceptedDisclaimer: true, forwardRequested: true, authorityId: null,
      },
    }, USER);
    expect(ok.ok).toBe(true);
    // Forwarding without an authority is silently downgraded, never sent anywhere.
    if (ok.ok) expect(ok.value.complaint?.forwardRequested).toBe(false);
  });

  it('rejects unknown categories and oversized captions', () => {
    expect(validateCreatePost({ ...base, category: 'crypto' }, USER).ok).toBe(false);
    expect(validateCreatePost({ ...base, caption: 'x'.repeat(2201) }, USER).ok).toBe(false);
  });
});

describe('deletion OTP primitives', () => {
  it('generates 8-digit numeric codes with no obvious bias', () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 2000; i++) {
      const code = generateOtp();
      expect(isValidOtp(code)).toBe(true);
      for (const d of code) counts[Number(d)]++;
    }
    for (const c of counts) expect(c).toBeGreaterThan(1300); // expected 1600 each
  });

  it('binds the digest to verification id, email and code', async () => {
    const a = await codeDigest(SECRET, 'v1', 'A@Example.com ', '12345678');
    expect(a).toBe(await codeDigest(SECRET, 'v1', 'a@example.com', '12345678'));
    expect(a).not.toBe(await codeDigest(SECRET, 'v2', 'a@example.com', '12345678'));
    expect(a).not.toBe(await codeDigest(SECRET, 'v1', 'b@example.com', '12345678'));
    expect(a).not.toBe(await codeDigest(SECRET, 'v1', 'a@example.com', '12345679'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await emailDigest(SECRET, 'x@y.in')).not.toContain('x@y.in');
  });

  it('refuses weak secrets', async () => {
    await expect(hmacHex('short', 'msg')).rejects.toThrow(/at least 32/);
  });

  it('compares in constant time and handles length mismatch', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
    expect(normalizeEmail('  MiXeD@Mail.COM ')).toBe('mixed@mail.com');
  });
});

describe('HTTP + templates', () => {
  it('only reflects allow-listed origins in CORS', () => {
    const allowed = ['https://ojasss.com'];
    expect(corsHeaders('https://ojasss.com', allowed)['Access-Control-Allow-Origin']).toBe('https://ojasss.com');
    expect(corsHeaders('https://evil.example', allowed)['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('escapes user content in OG pages (no XSS via captions)', () => {
    const html = postOgHtml({
      id: '11111111-1111-4111-8111-111111111111', kind: 'poster', caption: '"><script>alert(1)</script>',
      category: 'news', author_username: 'x', author_display_name: '</title><img src=x onerror=alert(1)>',
      media_path: `${USER}/p.jpg`, thumbnail_path: null, width: 1080, height: 1350,
      hot_count: 1, speak_count: 2, viral_count: 3, created_at: '2026-09-18T00:00:00Z',
    }, 'https://ojasss.com', 'https://cdn.example/media');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('og:site_name" content="OJASSS"');
    expect(html).toContain('https://ojasss.com/post/11111111-1111-4111-8111-111111111111');
    expect(escapeHtml(`<&"'>`)).toBe('&lt;&amp;&quot;&#39;&gt;');
  });

  it('complaint emails carry the unverified-allegation disclaimer and escape content', () => {
    const m = complaintForwardEmail({
      post_id: 'p1', subcategory: 'public_safety', description: '<b>Open manhole</b> near school', location: 'Sector 5',
      legal_assistance_requested: true, created_at: '2026-09-18', author_username: 'citizen',
      authority: { name: 'Municipal Corporation', department: 'Roads' },
    }, 'https://ojasss.com');
    expect(m.html).toContain('has not independently verified');
    expect(m.html).not.toContain('<b>Open manhole</b>');
    expect(m.text).toContain('Legal assistance requested: Yes');
  });
});

describe('push payloads', () => {
  it('never forwards absolute or protocol-relative links', () => {
    expect(safeLink('/post/abc')).toBe('/post/abc');
    expect(safeLink('https://evil.example')).toBe('/notifications');
    expect(safeLink('//evil.example')).toBe('/notifications');
    expect(safeLink('javascript:alert(1)')).toBe('/notifications');
    const m = buildFcmMessage('tok', { id: 'n1', type: 'message', title: 'Hi', body: 'There', link: '/messages/1' });
    expect(m.message.android.notification.channel_id).toBe('messages');
    expect(m.message.android.priority).toBe('HIGH');
  });
});
