// POST /functions/v1/push-dispatch — invoked by a Database Webhook on notifications INSERT.
// Sends FCM HTTP v1 pushes to the recipient's devices. Degrades to a no-op when push is
// not configured, so the rest of the platform never depends on it.
import { SignJWT, importPKCS8 } from 'npm:jose@5';
import { adminClient, env } from '../_shared/clients.ts';
import { timingSafeEqual } from '../_shared/deletion.ts';
import { buildFcmMessage, type NotificationRow } from '../_shared/push.ts';
import { errorResponse, json } from '../_shared/http.ts';

interface ServiceAccount { client_email: string; private_key: string; project_id: string }

let cachedToken: { token: string; exp: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() / 1000 + 60) return cachedToken.token;
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email).setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now).setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`OAuth token request failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: body.access_token, exp: now + body.expires_in };
  return body.access_token;
}

Deno.serve(async (req) => {
  const secret = env('PUSH_WEBHOOK_SECRET');
  const given = req.headers.get('x-webhook-secret') ?? '';
  if (!secret || !timingSafeEqual(given, secret)) return errorResponse(401, 'UNAUTHORIZED', 'Unauthorized.');

  const saJson = env('FCM_SERVICE_ACCOUNT_JSON');
  if (!saJson) return json({ ok: true, skipped: 'push not configured' });

  const payload = (await req.json()) as { type?: string; record?: { id?: string } };
  const notificationId = payload.record?.id;
  if (payload.type !== 'INSERT' || !notificationId) return json({ ok: true, skipped: 'not an insert' });

  const admin = adminClient();
  const { data } = await admin.rpc('internal_push_targets', { p_notification_id: notificationId });
  const tokens: string[] = data?.tokens ?? [];
  if (!data?.notification || tokens.length === 0) return json({ ok: true, sent: 0 });

  const sa = JSON.parse(saJson) as ServiceAccount;
  const bearer = await accessToken(sa);
  let sent = 0;
  for (const token of tokens.slice(0, 20)) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildFcmMessage(token, data.notification as NotificationRow)),
    });
    if (res.ok) sent++;
    else if (res.status === 404 || res.status === 400) {
      // Unregistered / invalid token: stop sending to it.
      await admin.rpc('internal_drop_push_token', { p_token: token });
    }
  }
  return json({ ok: true, sent });
});
