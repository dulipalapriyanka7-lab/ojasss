// POST /functions/v1/send-complaint-email   { postId }
// sendComplaintEmail: staff-only. The recipient is resolved from the authorities table on the
// server — the client can only name the complaint, never an address.
import { adminClient, env, requestUser, sendEmail, siteUrl } from '../_shared/clients.ts';
import { allowedOrigins, corsHeaders, errorResponse, fromRpcError, json, readJson } from '../_shared/http.ts';
import { complaintForwardEmail } from '../_shared/templates.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'), allowedOrigins(env));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST.', cors);

  const user = await requestUser(req);
  if (!user) return errorResponse(401, 'AUTH_REQUIRED', 'Please sign in to continue.', cors);

  let postId = '';
  try {
    postId = String(((await readJson(req)) as { postId?: unknown }).postId ?? '');
  } catch {
    return errorResponse(400, 'BAD_REQUEST', 'Invalid request body.', cors);
  }
  if (!UUID_RE.test(postId)) return errorResponse(422, 'INVALID_COMPLAINT', 'Choose a complaint.', cors);

  const admin = adminClient();
  // Authorization + context in one server-side call (checks profiles.role of the caller).
  const { data: ctx, error } = await admin.rpc('internal_complaint_forward_context', {
    p_post_id: postId, p_admin_id: user.id,
  });
  if (error) return fromRpcError(error, cors);

  if (!ctx.authority || !ctx.authority.is_active) {
    return errorResponse(422, 'AUTHORITY_REQUIRED', 'Assign an active authority before forwarding.', cors);
  }
  if (ctx.forward_status === 'forwarded') {
    return errorResponse(409, 'ALREADY_FORWARDED', 'This complaint has already been forwarded.', cors);
  }
  if (!['published', 'flagged'].includes(ctx.post_status)) {
    return errorResponse(409, 'NOT_PUBLISHED', 'Approve the complaint post before forwarding it.', cors);
  }

  const mail = complaintForwardEmail(ctx, siteUrl());
  try {
    const sent = await sendEmail(ctx.authority.email, mail.subject, mail.html, mail.text);
    await admin.rpc('internal_record_complaint_forward', {
      p_post_id: postId, p_admin_id: user.id, p_success: true, p_error: null, p_provider_id: sent.id,
    });
    return json({ ok: true, forwardStatus: 'forwarded' }, 200, cors);
  } catch (e) {
    console.error('complaint forward failed', e);
    await admin.rpc('internal_record_complaint_forward', {
      p_post_id: postId, p_admin_id: user.id, p_success: false, p_error: String(e).slice(0, 300), p_provider_id: null,
    });
    return errorResponse(502, 'EMAIL_FAILED', 'The email could not be sent. The attempt was logged; try again later.', cors);
  }
});
