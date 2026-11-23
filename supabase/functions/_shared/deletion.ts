// Account-deletion OTP primitives (Web Crypto only — runs in Deno and Node).
// - 8-digit code from a CSPRNG with rejection sampling (no modulo bias)
// - HMAC-SHA256 keyed with DELETION_FLOW_SECRET; plaintext codes are never stored
// - constant-time comparison of digests

const encoder = new TextEncoder();

export const OTP_LENGTH = 8;
export const OTP_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 5;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email);
}

export function isValidOtp(code: string): boolean {
  return new RegExp(`^[0-9]{${OTP_LENGTH}}$`).test(code);
}

/** Uniformly random numeric code. */
export function generateOtp(length = OTP_LENGTH): string {
  const digits: number[] = [];
  const buf = new Uint8Array(length * 2);
  while (digits.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 250 && digits.length < length) digits.push(b % 10); // 250 = 25 * 10 → unbiased
    }
  }
  return digits.join('');
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  if (!secret || secret.length < 32) throw new Error('DELETION_FLOW_SECRET must be at least 32 characters');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison (length leak only, digests are fixed-length). */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** Digest bound to the verification id and email, so a code is useless for any other request. */
export function codeDigest(secret: string, verificationId: string, email: string, code: string): Promise<string> {
  return hmacHex(secret, `deletion-otp:v1:${verificationId}:${normalizeEmail(email)}:${code}`);
}

export function emailDigest(secret: string, email: string): Promise<string> {
  return hmacHex(secret, `deletion-email:v1:${normalizeEmail(email)}`);
}
