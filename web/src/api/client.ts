// Centralised API access. Components never call supabase directly or build URLs —
// they go through the typed modules in src/api/*, which all use rpc()/invoke() here.
import { FunctionsHttpError, type PostgrestError } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export type ApiErrorKind =
  | 'bad_request' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'validation'
  | 'rate_limited' | 'server' | 'unavailable' | 'network' | 'timeout' | 'session_expired' | 'not_configured';

const FRIENDLY: Record<ApiErrorKind, string> = {
  bad_request: 'That request could not be processed.',
  unauthenticated: 'Please sign in to continue.',
  forbidden: 'You do not have permission to do that.',
  not_found: 'We could not find what you were looking for.',
  conflict: 'That conflicts with the current state. Refresh and try again.',
  validation: 'Please check the details and try again.',
  rate_limited: 'You are doing that too often. Please wait a moment.',
  server: 'Something went wrong on our side. Please try again.',
  unavailable: 'OJASSS is temporarily unavailable. Please try again shortly.',
  network: 'You appear to be offline. Check your connection and try again.',
  timeout: 'The request took too long. Please try again.',
  session_expired: 'Your session has expired. Please sign in again.',
  not_configured: 'This build is not connected to the OJASSS backend.',
};

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    /** Stable machine code from the backend, e.g. INSUFFICIENT_BALANCE. */
    public code: string,
    /** User-safe message. Never contains stack traces or SQL. */
    message: string,
    public status: number | null = null,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get retryable(): boolean {
    return ['network', 'timeout', 'server', 'unavailable', 'rate_limited'].includes(this.kind);
  }
}

export function kindForStatus(status: number): ApiErrorKind {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422 || status === 428) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'unavailable';
  return 'server';
}

/** Normalise any PostgREST error. PTxxx codes carry the HTTP status and a user-safe detail. */
export function fromPostgrest(err: PostgrestError | { code?: string; message?: string; details?: string | null }): ApiError {
  const code = err.code ?? '';
  const pt = /^PT(\d{3})$/.exec(code);
  if (pt) {
    const status = Number(pt[1]);
    const kind = kindForStatus(status);
    const detail = err.details && err.details !== err.message ? err.details : FRIENDLY[kind];
    return new ApiError(kind, err.message ?? 'ERROR', detail, status);
  }
  if (code === 'PGRST301' || code === 'PGRST303' || /JWT expired/i.test(err.message ?? '')) {
    return new ApiError('session_expired', 'SESSION_EXPIRED', FRIENDLY.session_expired, 401);
  }
  if (code === '42501') return new ApiError('forbidden', 'FORBIDDEN', FRIENDLY.forbidden, 403);
  if (code === 'PGRST202' || code === '42883') return new ApiError('server', 'API_MISMATCH', FRIENDLY.server, 500);
  if (/Failed to fetch|NetworkError|Load failed/i.test(err.message ?? '')) {
    return new ApiError(navigator.onLine ? 'unavailable' : 'network', 'NETWORK', FRIENDLY[navigator.onLine ? 'unavailable' : 'network']);
  }
  if (import.meta.env.DEV) console.error('[api] unexpected error', err);
  return new ApiError('server', 'INTERNAL', FRIENDLY.server, 500);
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof DOMException && e.name === 'AbortError') return new ApiError('timeout', 'TIMEOUT', FRIENDLY.timeout);
  if (e instanceof TypeError) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    return new ApiError(offline ? 'network' : 'unavailable', 'NETWORK', FRIENDLY[offline ? 'network' : 'unavailable']);
  }
  if (import.meta.env.DEV) console.error('[api] unexpected error', e);
  return new ApiError('server', 'INTERNAL', FRIENDLY.server);
}

export function friendly(kind: ApiErrorKind): string {
  return FRIENDLY[kind];
}

const TIMEOUT_MS = 20_000;

function ensureConfigured() {
  if (!env.configured) throw new ApiError('not_configured', 'NOT_CONFIGURED', FRIENDLY.not_configured);
}

/** Call a database API function (PostgREST RPC) with a timeout and normalised errors. */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}, opts: { signal?: AbortSignal } = {}): Promise<T> {
  ensureConfigured();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  opts.signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const { data, error } = await supabase.rpc(fn, args).abortSignal(controller.signal);
    if (error) {
      if (controller.signal.aborted && !opts.signal?.aborted) throw new ApiError('timeout', 'TIMEOUT', FRIENDLY.timeout);
      throw fromPostgrest(error);
    }
    return data as T;
  } catch (e) {
    throw toApiError(e);
  } finally {
    clearTimeout(timer);
  }
}

/** Call an edge function; errors come back as { error: { code, message, fields } }. */
export async function invoke<T>(name: string, body: unknown): Promise<T> {
  ensureConfigured();
  try {
    if(env.mysql){
      const {data}=await supabase.auth.getSession();
      const response=await fetch(`${env.supabaseUrl}/functions/v1/${encodeURIComponent(name)}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:env.supabaseAnonKey,...(data.session?{Authorization:`Bearer ${data.session.access_token}`}:{})},body:JSON.stringify(body)});
      const payload=await response.json().catch(()=>null);
      if(response.ok&&payload===null)throw new ApiError('unavailable','INVALID_RESPONSE','The service returned an incomplete response. Refresh and try again.',response.status);
      if(!response.ok){const kind=kindForStatus(response.status);throw new ApiError(kind,payload?.error?.code??payload?.error_code??'REQUEST_FAILED',payload?.error?.message??payload?.message??(response.status===404?'The upload service could not be reached. Refresh this page and try again.':FRIENDLY[kind]),response.status,payload?.error?.fields);}
      return payload as T;
    }
    const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
    if (error) {
      if (error instanceof FunctionsHttpError) {
        const res = error.context as Response;
        let payload: { error?: { code?: string; message?: string; fields?: Record<string, string> } } = {};
        try {
          payload = await res.json();
        } catch {
          /* non-JSON error body */
        }
        const kind = kindForStatus(res.status);
        throw new ApiError(kind, payload.error?.code ?? 'ERROR', payload.error?.message ?? FRIENDLY[kind], res.status, payload.error?.fields);
      }
      throw toApiError(error);
    }
    return data as T;
  } catch (e) {
    throw toApiError(e);
  }
}
