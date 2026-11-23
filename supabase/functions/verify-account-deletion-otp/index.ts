// POST /functions/v1/verify-account-deletion-otp   { verificationId, email, code }
// Step 2 of 2 (verifyAccountDeletionOtp): constant-time HMAC check, max 5 attempts,
// single use, then records an account deletion request for admin processing.
import { adminClient, env } from '../_shared/clients.ts';
import { codeDigest, emailDigest, isValidEmail, isValidOtp, normalizeEmail, timingSafeEqual } from '../_shared/deletion.ts';
import { allowedOrigins, clientIp, corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'), allowedOrigins(env));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST.', cors);

  const secret = env('DELETION_FLOW_SECRET');
  if (!secret || secret.length < 32) {
    return errorResponse(503, 'UNAVAILABLE', 'Account deletion is temporarily unavailable. Contact support@ojasss.com.', cors);
  }

  let body: { verificationId?: unknown; email?: unknown; code?: unknown };
  try {
    body = (await readJson(req, 4 * 1024)) as typeof body;
  } catch {
    return errorResponse(400, 'BAD_REQUEST', 'Invalid request body.', cors);
  }
  const verificationId = String(body.verificationId ?? '');
  const email = normalizeEmail(String(body.email ?? ''));
  const code = String(body.code ?? '').trim();
  const invalid = () => errorResponse(400, 'INVALID_CODE', 'That code is invalid or has expired. Request a new one.', cors);
  if (!UUID_RE.test(verificationId) || !isValidEmail(email) || !isValidOtp(code)) return invalid();

  const admin = adminClient();
  const ip = clientIp(req);
  if (ip) {
    const { data: allowed } = await admin.rpc('_rate_allow', { p_key: `del-verify-ip:${ip}`, p_max: 30, p_window_seconds: 3600 });
    if (allowed === false) return errorResponse(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.', cors);
  }

  // The attempt is counted (and committed) before comparing, so brute force is capped at 5.
  const { data: attempt } = await admin.rpc('internal_deletion_attempt', {
    p_id: verificationId, p_email_hash: await emailDigest(secret, email),
  });
  if (!attempt) return invalid();

  const expected = await codeDigest(secret, verificationId, email, code);
  if (!timingSafeEqual(expected, attempt.code_hmac)) return invalid();

  const { data: consumed } = await admin.rpc('internal_deletion_consume', { p_id: verificationId });
  if (!consumed?.ok) return invalid();

  return json({
    ok: true,
    message: 'Your deletion request has been received. Our team will process it within 30 days and email you when complete.',
  }, 200, cors);
});
