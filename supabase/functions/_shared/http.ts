// HTTP helpers shared by all edge functions: strict CORS, JSON responses, safe errors.

export function allowedOrigins(env: (k: string) => string | undefined): string[] {
  return (env('ALLOWED_ORIGINS') ?? 'https://ojasss.com,https://www.ojasss.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

/** User-safe error: stable code + friendly message. Internal details are logged, never returned. */
export function errorResponse(
  status: number, code: string, message: string, headers: Record<string, string> = {}, fields?: Record<string, string>,
): Response {
  return json({ error: { code, message, ...(fields ? { fields } : {}) } }, status, headers);
}

export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip');
  return ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

/** Map a PostgREST/RPC error (PTxxx) to an HTTP response. */
export function fromRpcError(
  err: { code?: string; message?: string; details?: string | null } | null, headers: Record<string, string> = {},
): Response {
  const code = err?.code ?? '';
  if (/^PT\d{3}$/.test(code)) {
    return errorResponse(Number(code.slice(2)), err?.message ?? 'ERROR', err?.details ?? 'Request failed.', headers);
  }
  console.error('rpc error', err);
  return errorResponse(500, 'INTERNAL', 'Something went wrong. Please try again.', headers);
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > maxBytes) throw new RangeError('Payload too large');
  const text = await req.text();
  if (text.length > maxBytes) throw new RangeError('Payload too large');
  return text ? JSON.parse(text) : {};
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
