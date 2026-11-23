// Deno-only: Supabase clients for edge functions.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const env = (k: string) => Deno.env.get(k);

function required(k: string): string {
  const v = env(k);
  if (!v) throw new Error(`Missing required secret ${k}`);
  return v;
}

/** Service-role client. Server-only; never exposed to clients. */
export function adminClient(): SupabaseClient {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve the calling user from the request's bearer token (null if missing/invalid). */
export async function requestUser(req: Request): Promise<User | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(auth.slice(7));
  return error ? null : data.user;
}

export function siteUrl(): string {
  return (env('SITE_URL') ?? 'https://ojasss.com').replace(/\/$/, '');
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<{ id: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${required('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM') ?? 'OJASSS <no-reply@ojasss.com>', to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
  return (await res.json()) as { id: string };
}
