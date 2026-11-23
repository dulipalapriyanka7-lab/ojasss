// POST /functions/v1/create-account-deletion-request   { email, reason?, source? }
// Step 1 of 2 (createAccountDeletionRequest): issues an 8-digit code valid for 15 minutes.
// The response is identical whether or not the email has an account (no enumeration).
import { adminClient, env, sendEmail } from '../_shared/clients.ts';
import {
  OTP_TTL_MINUTES, codeDigest, emailDigest, generateOtp, isValidEmail, normalizeEmail,
} from '../_shared/deletion.ts';
import { allowedOrigins, clientIp, corsHeaders, errorResponse, json, readJson } from '../_shared/http.ts';
import { deletionOtpEmail } from '../_shared/templates.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'), allowedOrigins(env));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST.', cors);

  const secret = env('DELETION_FLOW_SECRET');
  if (!secret || secret.length < 32) {
    console.error('DELETION_FLOW_SECRET is not configured');
    return errorResponse(503, 'UNAVAILABLE', 'Account deletion is temporarily unavailable. Contact support@ojasss.com.', cors);
  }

  let body: { email?: unknown; reason?: unknown; source?: unknown };
  try {
    body = (await readJson(req, 8 * 1024)) as typeof body;
  } catch {
    return errorResponse(400, 'BAD_REQUEST', 'Invalid request body.', cors);
  }
  const email = normalizeEmail(String(body.email ?? ''));
  if (!isValidEmail(email)) return errorResponse(422, 'INVALID_EMAIL', 'Enter a valid email address.', cors);
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 1000) : null;
  const source = body.source === 'android' ? 'android' : 'web';

  const admin = adminClient();
  const emailHash = await emailDigest(secret, email);
  const verificationId = crypto.randomUUID();
  const generic = json({ ok: true, verificationId, expiresInMinutes: OTP_TTL_MINUTES }, 200, cors);

  const { data: start, error } = await admin.rpc('internal_deletion_start', {
    p_email: email, p_email_hash: emailHash, p_ip: clientIp(req),
  });
  if (error) {
    console.error('deletion start failed', error);
    return errorResponse(500, 'INTERNAL', 'Something went wrong. Please try again.', cors);
  }
  if (!start.allowed) {
    return errorResponse(429, 'RATE_LIMITED', 'Too many requests. Please wait an hour and try again.', cors);
  }

  const code = generateOtp();
  const digest = await codeDigest(secret, verificationId, email, code);
  await admin.rpc('internal_deletion_store', {
    p_id: verificationId, p_email_hash: emailHash, p_code_hmac: digest, p_user_id: start.user_id ?? null,
    p_email: email, p_reason: reason, p_source: source,
  });

  // Only accounts that exist receive mail; the HTTP response is identical either way.
  if (start.user_id) {
    const mail = deletionOtpEmail(code);
    try {
      await sendEmail(email, mail.subject, mail.html, mail.text);
    } catch (e) {
      console.error('deletion email failed', e);
    }
  }
  return generic;
});
