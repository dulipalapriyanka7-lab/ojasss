// OJASSS local QA server — DEVELOPMENT ONLY. Never deploy.
//
// Runs the real supabase/migrations in an embedded Postgres (PGlite) and speaks the subset
// of the Supabase HTTP protocol the web/Android clients use: GoTrue auth, PostgREST RPC and
// table reads, Storage objects, and the edge functions (reusing supabase/functions/_shared).
// Business rules, RLS and permissions are therefore exactly the production SQL.
//
// Not emulated: Realtime websockets (clients fall back to polling/refetch), Google OAuth,
// outbound email (codes and emails are printed to this console instead).
//
//   node tools/local-api/server.mjs            # http://localhost:54321
//   ADMIN_EMAIL=you@example.com node ...       # promote that account to admin after signup
import { PGlite } from '@electric-sql/pglite';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual as tse } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCreatePost, sniffMedia, maxBytes } from '../../supabase/functions/_shared/media.ts';
import { codeDigest, emailDigest, generateOtp, isValidEmail, isValidOtp, normalizeEmail, timingSafeEqual } from '../../supabase/functions/_shared/deletion.ts';
import { complaintForwardEmail, postOgHtml } from '../../supabase/functions/_shared/templates.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PORT = Number(process.env.PORT ?? 54321);
const DATA = join(HERE, '.data');
const STORAGE = join(DATA, 'storage');
const JWT_SECRET = process.env.LOCAL_JWT_SECRET ?? 'local-dev-only-jwt-secret-not-for-production';
const DELETION_SECRET = 'local-dev-only-deletion-secret-0123456789abcdef';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? '').toLowerCase();
const SITE = process.env.SITE_URL ?? 'http://localhost:5173';

mkdirSync(STORAGE, { recursive: true });

// ------------------------------------------------------------------ database

const fresh = !existsSync(join(DATA, 'pg', 'PG_VERSION'));
const db = new PGlite(join(DATA, 'pg'));
if (fresh) {
  await db.exec(readFileSync(join(ROOT, 'supabase', 'tests', 'bootstrap.sql'), 'utf8'));
  for (const f of readdirSync(join(ROOT, 'supabase', 'migrations')).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8'));
  }
  await db.exec(`
    create schema local;
    create table local.credentials (user_id uuid primary key references auth.users(id) on delete cascade,
      password_hash text, confirmed boolean not null default false);
  `);
  console.log('[db] fresh database created from migrations');
}

// DEV-ONLY: apply local-patch.sql on every boot so the embedded schema matches the web client
// (profile country/phone/address/interests, group chat, feed stubs). Never used in production.
{
  const patch = join(HERE, 'local-patch.sql');
  if (existsSync(patch)) {
    try { await db.exec(readFileSync(patch, 'utf8')); console.log('[db] local-patch.sql applied'); }
    catch (err) { console.error('[db] local-patch.sql failed:', err?.message ?? err); }
  }
}

// Serialise all DB work: role switching is per-connection state.
let queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

async function asRole(actor, fn) {
  return exclusive(async () => {
    const role = actor.kind === 'user' ? 'authenticated' : actor.kind === 'service' ? 'service_role' : 'anon';
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [actor.kind === 'user' ? actor.id : '']);
    await db.query(`select set_config('request.headers', $1, false)`, [JSON.stringify({ 'x-forwarded-for': '127.0.0.1' })]);
    await db.exec(`set role ${role}`);
    try {
      return await fn();
    } finally {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    }
  });
}

const sql = (q, p = []) => exclusive(async () => (await db.query(q, p)).rows);

// ------------------------------------------------------------------ JWT (HS256)

const b64u = (b) => Buffer.from(b).toString('base64url');
function signJwt(payload) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, b, s] = (token ?? '').split('.');
  if (!h || !b || !s) return null;
  const expect = createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
  if (expect.length !== s.length || !tse(Buffer.from(expect), Buffer.from(s))) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  return p.exp * 1000 > Date.now() ? p : null;
}

// ------------------------------------------------------------------ http helpers

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-upsert, range, prefer, accept-profile, content-profile, cache-control, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'content-range, content-length',
};
const replacer = (_k, v) => (typeof v === 'bigint' ? Number(v) : v);
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS, ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body, replacer));
}
async function readBody(req, limit = 250 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
const json = async (req) => {
  const b = await readBody(req, 1024 * 1024);
  return b.length ? JSON.parse(b.toString()) : {};
};

function actorFrom(req) {
  const auth = req.headers.authorization ?? '';
  const claims = auth.startsWith('Bearer ') ? verifyJwt(auth.slice(7)) : null;
  return claims ? { kind: 'user', id: claims.sub, email: claims.email } : { kind: 'anon' };
}

function pgError(res, e, actor) {
  const code = e.code ?? '';
  if (/^PT\d{3}$/.test(code)) return send(res, Number(code.slice(2)), { code, message: e.message, details: e.detail ?? null, hint: null });
  if (code === '42501') return send(res, actor.kind === 'anon' ? 401 : 403, { code, message: e.message, details: null, hint: null });
  if (code === '42883') return send(res, 404, { code: 'PGRST202', message: e.message, details: null, hint: null });
  console.error('[db error]', code, e.message);
  return send(res, 400, { code, message: e.message, details: e.detail ?? null, hint: null });
}

// ------------------------------------------------------------------ auth (GoTrue subset)

const codes = new Map(); // email -> { code, type, expires }
const lastDeletionCodes = new Map(); // email -> 8-digit code (dev only)
function issueCode(email, type) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(email, { code, type, expires: Date.now() + 15 * 60_000 });
  console.log(`\n[mail] ${type} code for ${email}: ${code}\n`);
}

async function userJson(id) {
  const [u] = await sql(`select u.*, c.confirmed from auth.users u left join local.credentials c on c.user_id = u.id where u.id = $1`, [id]);
  if (!u) return null;
  const now = new Date().toISOString();
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, phone: '',
    email_confirmed_at: u.confirmed ? now : null, confirmed_at: u.confirmed ? now : null,
    last_sign_in_at: u.last_sign_in_at, app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: u.raw_user_meta_data ?? {}, identities: [], created_at: u.created_at, updated_at: now,
  };
}

const refreshTokens = new Map();
async function session(userId) {
  const user = await userJson(userId);
  await sql(`update auth.users set last_sign_in_at = now() where id = $1`, [userId]);
  if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) {
    await sql(`update public.profiles set role = 'admin' where id = $1 and role <> 'admin'`, [userId]);
  }
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = signJwt({ sub: userId, email: user.email, role: 'authenticated', aud: 'authenticated', exp, iat: exp - 3600, session_id: randomUUID() });
  const refresh_token = randomBytes(24).toString('base64url');
  refreshTokens.set(refresh_token, userId);
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token, user };
}

const hash = (pw) => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 32).toString('hex')}`;
};
const checkHash = (pw, stored) => {
  const [salt, h] = (stored ?? ':').split(':');
  if (!salt) return false;
  const got = scryptSync(pw, Buffer.from(salt, 'hex'), 32);
  return tse(got, Buffer.from(h, 'hex'));
};
const authErr = (res, status, error_code, msg) => send(res, status, { code: status, error_code, msg });

async function handleAuth(req, res, url) {
  const p = url.pathname.replace('/auth/v1', '');
  if (p === '/signup' && req.method === 'POST') {
    const b = await json(req);
    const email = normalizeEmail(String(b.email ?? ''));
    if (!isValidEmail(email)) return authErr(res, 400, 'validation_failed', 'Unable to validate email address: invalid format');
    if (String(b.password ?? '').length < 8) return authErr(res, 422, 'weak_password', 'Password should be at least 8 characters.');
    const [exists] = await sql(`select id from auth.users where email = $1`, [email]);
    if (exists) return authErr(res, 422, 'user_already_exists', 'User already registered');
    const [u] = await sql(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, JSON.stringify(b.data ?? {})]);
    await sql(`insert into local.credentials (user_id, password_hash) values ($1, $2)`, [u.id, hash(b.password)]);
    issueCode(email, 'signup');
    return send(res, 200, await userJson(u.id));
  }
  if (p === '/resend' && req.method === 'POST') {
    const b = await json(req);
    issueCode(normalizeEmail(b.email ?? ''), b.type ?? 'signup');
    return send(res, 200, {});
  }
  if (p === '/otp' && req.method === 'POST') {
    const b = await json(req);
    const email = normalizeEmail(b.email ?? '');
    const [u] = await sql(`select id from auth.users where email = $1`, [email]);
    if (!u && b.create_user === false) return authErr(res, 400, 'otp_disabled', 'Signups not allowed for otp');
    issueCode(email, 'email');
    return send(res, 200, {});
  }
  if (p === '/verify' && req.method === 'POST') {
    const b = await json(req);
    const email = normalizeEmail(b.email ?? '');
    const c = codes.get(email);
    if (!c || c.code !== String(b.token) || c.expires < Date.now()) return authErr(res, 403, 'otp_expired', 'Token has expired or is invalid');
    codes.delete(email);
    const [u] = await sql(`select id from auth.users where email = $1`, [email]);
    if (!u) return authErr(res, 403, 'otp_expired', 'Token has expired or is invalid');
    await sql(`update local.credentials set confirmed = true where user_id = $1`, [u.id]);
    return send(res, 200, await session(u.id));
  }
  if (p === '/token' && req.method === 'POST') {
    const b = await json(req);
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const [u] = await sql(`select u.id, c.password_hash, c.confirmed from auth.users u join local.credentials c on c.user_id = u.id where u.email = $1`, [normalizeEmail(b.email ?? '')]);
      if (!u || !checkHash(String(b.password ?? ''), u.password_hash)) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
      if (!u.confirmed) return authErr(res, 400, 'email_not_confirmed', 'Email not confirmed');
      return send(res, 200, await session(u.id));
    }
    if (grant === 'refresh_token') {
      const uid = refreshTokens.get(b.refresh_token);
      if (!uid) return authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      refreshTokens.delete(b.refresh_token);
      return send(res, 200, await session(uid));
    }
    return authErr(res, 400, 'unsupported_grant_type', 'Unsupported grant type');
  }
  if (p === '/user') {
    const a = actorFrom(req);
    if (a.kind !== 'user') return authErr(res, 401, 'no_authorization', 'Invalid JWT');
    if (req.method === 'PUT') {
      const b = await json(req);
      if (b.password) await sql(`update local.credentials set password_hash = $2 where user_id = $1`, [a.id, hash(b.password)]);
    }
    return send(res, 200, await userJson(a.id));
  }
  if (p === '/recover' && req.method === 'POST') {
    const b = await json(req);
    console.log(`[mail] password reset requested for ${b.email} (local QA: sign in with a login code instead)`);
    return send(res, 200, {});
  }
  if (p === '/logout') return send(res, 204);
  if (p === '/authorize') {
    res.writeHead(400, { 'Content-Type': 'text/plain', ...CORS });
    return res.end('Google OAuth is not available on the local QA server.');
  }
  return send(res, 404, { msg: 'Not found' });
}

// ------------------------------------------------------------------ PostgREST subset

const fnCache = new Map();
async function fnInfo(name) {
  if (fnCache.has(name)) return fnCache.get(name);
  const rows = await sql(`
    select p.proretset as set, t.typtype as kind, t.typname as ret,
           coalesce(p.proargnames, '{}') as names, coalesce(p.proargmodes::text[], '{}') as modes,
           (select array_agg(format_type(x, null) order by o) from unnest(p.proargtypes) with ordinality u(x, o)) as types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public' and p.proname = $1 limit 1`, [name]);
  const info = rows[0] ?? null;
  if (info) {
    const inNames = info.modes.length ? info.names.filter((_, i) => ['i', 'b', 'v'].includes(info.modes[i])) : info.names;
    info.args = Object.fromEntries(inNames.map((n, i) => [n, info.types?.[i] ?? 'text']));
  }
  fnCache.set(name, info);
  return info;
}

const pgArray = (a) => `{${a.map((x) => `"${String(x).replace(/["\\]/g, '\\$&')}"`).join(',')}}`;

async function handleRpc(req, res, name, actor) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) return send(res, 404, { code: 'PGRST202', message: 'not found' });
  const info = await fnInfo(name);
  if (!info) return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${name}` });
  const args = req.method === 'GET' ? Object.fromEntries(new URL(req.url, 'http://x').searchParams) : await json(req);
  const parts = [];
  const params = [];
  for (const [k, v] of Object.entries(args)) {
    if (!(k in info.args)) return send(res, 404, { code: 'PGRST202', message: `Unknown argument ${k} for ${name}` });
    const type = info.args[k];
    params.push(v === null ? null : type.endsWith('[]') && Array.isArray(v) ? pgArray(v) : type === 'jsonb' || type === 'json' ? JSON.stringify(v) : typeof v === 'object' ? JSON.stringify(v) : v);
    parts.push(`${k} => $${params.length}::${type}`);
  }
  try {
    const rows = await asRole(actor, async () => (await db.query(`select * from public.${name}(${parts.join(', ')})`, params)).rows);
    if (info.ret === 'void') return send(res, 200, null);
    if (info.set) return send(res, 200, info.kind === 'c' || info.ret === 'record' ? rows : rows.map((r) => r[name]));
    if (info.kind === 'c') return send(res, 200, rows[0] ?? null);
    return send(res, 200, rows[0]?.[name] ?? null);
  } catch (e) {
    return pgError(res, e, actor);
  }
}

async function handleTable(req, res, table, url, actor) {
  if (!/^[a-z_]+$/.test(table)) return send(res, 404, {});
  const where = [];
  const params = [];
  let select = '*';
  let order = '';
  let limit = '';
  for (const [k, v] of url.searchParams) {
    if (k === 'select') select = v.split(',').map((c) => (/^[a-z_]+$/.test(c) ? c : 'null')).join(', ');
    else if (k === 'order') {
      const [col, dir] = v.split('.');
      if (/^[a-z_]+$/.test(col)) order = ` order by ${col} ${dir === 'desc' ? 'desc' : 'asc'}`;
    } else if (k === 'limit') limit = ` limit ${Math.min(1000, Number(v) || 100)}`;
    else if (/^[a-z_]+$/.test(k)) {
      const [op, ...rest] = v.split('.');
      const ops = { eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' };
      if (ops[op]) {
        params.push(rest.join('.'));
        where.push(`${k} ${ops[op]} $${params.length}`);
      }
    }
  }
  try {
    const rows = await asRole(actor, async () => (await db.query(`select ${select} from public.${table}${where.length ? ` where ${where.join(' and ')}` : ''}${order}${limit}`, params)).rows);
    return send(res, 200, rows);
  } catch (e) {
    return pgError(res, e, actor);
  }
}

// ------------------------------------------------------------------ storage

const MIME = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
function storagePath(bucket, key) {
  if (!['media', 'avatars'].includes(bucket)) return null;
  const p = normalize(join(STORAGE, bucket, key));
  return p.startsWith(join(STORAGE, bucket)) ? p : null;
}

async function handleStorage(req, res, url, actor) {
  const m = url.pathname.match(/^\/storage\/v1\/object\/(public\/)?([a-z]+)\/(.+)$/);
  if (!m) return send(res, 404, { message: 'Not found' });
  const [, isPublic, bucket, rawKey] = m;
  const key = decodeURIComponent(rawKey);
  const file = storagePath(bucket, key);
  if (!file) return send(res, 400, { message: 'Invalid path' });

  if (req.method === 'POST' && !isPublic) {
    // Same rules as the production storage policy: own folder, safe name, allowed extension.
    if (actor.kind !== 'user') return send(res, 401, { message: 'Unauthorized' });
    if (!new RegExp(`^${actor.id}/[A-Za-z0-9._-]{1,160}$`).test(key) || !MIME[extname(key).toLowerCase()]) {
      return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    }
    if (existsSync(file)) return send(res, 409, { message: 'The resource already exists' });
    const body = await readBody(req, bucket === 'avatars' ? 5 * 1024 * 1024 : 200 * 1024 * 1024);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
    return send(res, 200, { Key: `${bucket}/${key}`, Id: randomUUID() });
  }
  if (req.method === 'GET' && isPublic) {
    if (!existsSync(file)) return send(res, 404, { message: 'Object not found' });
    const size = statSync(file).size;
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { ...CORS, 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...CORS, 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' });
    return createReadStream(file).pipe(res);
  }
  return send(res, 405, { message: 'Method not allowed' });
}

// ------------------------------------------------------------------ edge functions

const fnErr = (res, status, code, message, fields) => send(res, status, { error: { code, message, ...(fields ? { fields } : {}) } });

async function createPost(req, res, actor) {
  if (actor.kind !== 'user') return fnErr(res, 401, 'AUTH_REQUIRED', 'Please sign in to continue.');
  const parsed = validateCreatePost(await json(req), actor.id);
  if (!parsed.ok) return fnErr(res, 422, 'VALIDATION_FAILED', 'Please check the highlighted fields.', parsed.errors);
  const input = parsed.value;
  const settings = (await sql(`select public.public_settings() s`))[0].s;
  const file = storagePath('media', input.mediaPath);
  if (!file || !existsSync(file)) return fnErr(res, 422, 'MEDIA_NOT_FOUND', 'Upload the media file first.');
  const head = readFileSync(file).subarray(0, 64);
  const size = statSync(file).size;
  const sniffed = sniffMedia(new Uint8Array(head));
  if (!sniffed || sniffed.kind !== input.kind) return fnErr(res, 422, 'UNSUPPORTED_MEDIA', 'Unsupported media file.');
  if (size > maxBytes(input.kind, settings)) return fnErr(res, 422, 'FILE_TOO_LARGE', 'This file is larger than the upload limit.');
  try {
    const id = await asRole({ kind: 'service' }, async () => (await db.query(`select public.internal_create_post($1::uuid, $2::jsonb) id`, [actor.id, JSON.stringify({
      kind: input.kind, media_path: input.mediaPath,
      thumbnail_path: input.kind === 'poster' ? input.mediaPath : input.thumbnailPath,
      mime_type: sniffed.mime, size_bytes: size, width: input.width, height: input.height,
      duration_ms: input.kind === 'video' ? input.durationMs : null, caption: input.caption, category: input.category,
      language: input.language, location: input.location, cta_type: input.cta?.type ?? null, cta_url: input.cta?.url ?? null,
      cta_label: input.cta?.label ?? null,
      complaint: input.complaint && {
        subcategory: input.complaint.subcategory, description: input.complaint.description, location: input.complaint.location,
        legal_assistance_requested: input.complaint.legalAssistanceRequested, forward_requested: input.complaint.forwardRequested,
        authority_id: input.complaint.authorityId,
      },
    })])).rows[0].id);
    const [{ status }] = await sql(`select status from public.posts where id = $1`, [id]);
    return send(res, 201, { id, status });
  } catch (e) {
    return fnErr(res, e.code?.startsWith('PT') ? Number(e.code.slice(2)) : 500, e.message, e.detail ?? 'Request failed.');
  }
}

async function deletionStart(req, res) {
  const b = await json(req);
  const email = normalizeEmail(String(b.email ?? ''));
  if (!isValidEmail(email)) return fnErr(res, 422, 'INVALID_EMAIL', 'Enter a valid email address.');
  const emailHash = await emailDigest(DELETION_SECRET, email);
  const id = randomUUID();
  const start = await asRole({ kind: 'service' }, async () => (await db.query(`select public.internal_deletion_start($1, $2, $3) r`, [email, emailHash, '127.0.0.1'])).rows[0].r);
  if (!start.allowed) return fnErr(res, 429, 'RATE_LIMITED', 'Too many requests. Please wait an hour and try again.');
  const code = generateOtp();
  const digest = await codeDigest(DELETION_SECRET, id, email, code);
  await asRole({ kind: 'service' }, () => db.query(`select public.internal_deletion_store($1,$2,$3,$4,$5,$6,$7)`,
    [id, emailHash, digest, start.user_id ?? null, email, b.reason ?? null, b.source ?? 'web']));
  if (start.user_id) {
    console.log(`\n[mail] account deletion code for ${email}: ${code}\n`);
    lastDeletionCodes.set(email, code);
  }
  return send(res, 200, { ok: true, verificationId: id, expiresInMinutes: 15 });
}

async function deletionVerify(req, res) {
  const b = await json(req);
  const email = normalizeEmail(String(b.email ?? ''));
  const code = String(b.code ?? '');
  const invalid = () => fnErr(res, 400, 'INVALID_CODE', 'That code is invalid or has expired. Request a new one.');
  if (!isValidEmail(email) || !isValidOtp(code)) return invalid();
  const attempt = await asRole({ kind: 'service' }, async () => (await db.query(`select public.internal_deletion_attempt($1::uuid, $2) r`, [b.verificationId, await emailDigest(DELETION_SECRET, email)])).rows[0].r);
  if (!attempt || !timingSafeEqual(await codeDigest(DELETION_SECRET, b.verificationId, email, code), attempt.code_hmac)) return invalid();
  const consumed = await asRole({ kind: 'service' }, async () => (await db.query(`select public.internal_deletion_consume($1::uuid) r`, [b.verificationId])).rows[0].r);
  if (!consumed.ok) return invalid();
  return send(res, 200, { ok: true, message: 'Your deletion request has been received. Our team will process it within 30 days and email you when complete.' });
}

async function forwardComplaint(req, res, actor) {
  if (actor.kind !== 'user') return fnErr(res, 401, 'AUTH_REQUIRED', 'Please sign in to continue.');
  const { postId } = await json(req);
  try {
    const ctx = await asRole({ kind: 'service' }, async () => (await db.query(`select public.internal_complaint_forward_context($1::uuid, $2::uuid) c`, [postId, actor.id])).rows[0].c);
    if (!ctx.authority?.is_active) return fnErr(res, 422, 'AUTHORITY_REQUIRED', 'Assign an active authority before forwarding.');
    if (ctx.forward_status === 'forwarded') return fnErr(res, 409, 'ALREADY_FORWARDED', 'This complaint has already been forwarded.');
    const mail = complaintForwardEmail(ctx, SITE);
    console.log(`\n[mail] To: ${ctx.authority.email}\nSubject: ${mail.subject}\n${mail.text}\n`);
    await asRole({ kind: 'service' }, () => db.query(`select public.internal_record_complaint_forward($1::uuid, $2::uuid, true, null, 'local-dev')`, [postId, actor.id]));
    return send(res, 200, { ok: true, forwardStatus: 'forwarded' });
  } catch (e) {
    return fnErr(res, e.code?.startsWith('PT') ? Number(e.code.slice(2)) : 500, e.message, e.detail ?? 'Request failed.');
  }
}

async function postOg(res, url) {
  const id = url.searchParams.get('id') ?? '';
  let post = null;
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    post = await asRole({ kind: 'anon' }, async () => (await db.query(`select * from public.get_post($1::uuid)`, [id])).rows[0] ?? null);
  }
  res.writeHead(post ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', ...CORS });
  res.end(postOgHtml(post, SITE, `http://localhost:${PORT}/storage/v1/object/public/media`));
}

// ------------------------------------------------------------------ Monster Fight (dev only)
// Production serves the game from hostinger/api (monster-game.php + monster-asset.php). Locally
// these stand-ins hand any signed-in user a play ticket and stream the packaged build from
// MONSTER_FIGHT_DIR (default D:/ojasss-private-dev/monster-fight, made by
// game/prepare-monster-fight.mjs). Rewards are only logged.

const MONSTER_DIR = process.env.MONSTER_FIGHT_DIR ?? 'D:/ojasss-private-dev/monster-fight';
const MONSTER_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream', '.bin': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8',
};

let devEconomy = { version: 1, entry_fee_rupees: 20, coins_per_10: 8, starting_coins: 16, coins_per_hit: 2, start_hp: 100, match_minutes: 20, min_players: 1, max_players: 50, coin_elimination: true, win_rule: 'objective', paid_entry: false, withdrawals: false, changed_at: null };
const devSeen = new Map();
const devCoins = new Map();
function devPresence(id) { if (id) devSeen.set(id, Date.now()); let n = 0; for (const t of devSeen.values()) if (Date.now() - t < 90_000) n++; return n; }
// DEV-ONLY sample leaderboard so the One Chance leaderboard renders locally (made-up local users).
function devCompetition() {
  const names = ['doondikotha','bhavani','ravi_k','sita.m','arjun22','meena','kiran_v','lakshmi','tarun','pooja_r','vamsi','anu','sai','divya','charan','nisha'];
  const mk = (n, i, rank, extra = {}) => ({ user_id: 'dev-' + i, username: n, display_name: n, avatar_path: null, votes: 40 - i * 2, views: 300 - i * 11, viral: 0, seconds: 3600 * 2 - i * 300, video_count: 6 - (i % 5), rank, target: 0, qualified: true, post_id: 'p' + i, ...extra });
  const tiers = { 1: [], 2: [0, 1, 2, 3, 4], 3: [5, 6], 4: [7, 8, 9, 10], 5: [11] };
  const top_groups = {}, tier_counts = {};
  for (const [t, ids] of Object.entries(tiers)) { top_groups[t] = ids.map((i) => mk(names[i], i, Number(t))); tier_counts[t] = ids.length + (t === '2' ? 9 : 0); }
  const entries = Object.values(top_groups).flat().concat([12, 13, 14, 15].map((i, k) => mk(names[i], i, 6 + k)));
  const now = Date.now();
  return { competition: { id: 'dev', start: new Date(now - 2 * 864e5).toISOString(), end: new Date(now + 5 * 864e5).toISOString(), status: 'active', config: { targets: [20, 10, 3, 2, 1], timezone: 'Asia/Kolkata' } }, locked: false, entries, top_groups, tier_counts, remaining_preview: entries.filter((e) => e.rank >= 6).slice(0, 3), total_count: entries.length, my_rank: null, totals: { votes: 412, views: 3880, viral: 23, active_users: 7 }, viewer_active_seconds: 1800, server_time: new Date().toISOString(), prize_results: null };
}
async function devMonster(req, res, name, actor) {
  const signedIn = actor.kind === 'user';
  switch (name) {
    case 'monster_game_status': {
      const b = await json(req).catch(() => ({}));
      if (signedIn && b?.playing && Number.isInteger(b.coins)) devCoins.set(actor.id, b.coins);
    }
      return send(res, 200, { mode: 'live', can_play: signedIn, live_players: devPresence(signedIn ? actor.id : null), active_coins: [...devCoins.values()].reduce((a, b) => a + b, 0), my_coins: signedIn ? devCoins.get(actor.id) ?? null : null, economy: { starting_coins: devEconomy.starting_coins, entry_fee_rupees: devEconomy.entry_fee_rupees, paid_entry: false, match_minutes: devEconomy.match_minutes } });
    case 'monster_game_play': {
      if (!signedIn) return send(res, 401, { message: 'Sign in to play.' });
      if (!existsSync(join(MONSTER_DIR, 'index.html'))) return send(res, 503, { message: 'The game build is unavailable.' });
      const ticket = `local.${createHmac('sha256', JWT_SECRET).update(randomUUID()).digest('hex')}`;
      devPresence(actor.id);
      const e = devEconomy;
      return send(res, 200, { path: `/play-game/${ticket}/index.html`, round_id: randomUUID(), rate_paise: 100, economy: { version: e.version, starting_coins: e.starting_coins, coins_per_hit: e.coins_per_hit, start_hp: e.start_hp, match_minutes: e.match_minutes, coin_elimination: e.coin_elimination, win_rule: e.win_rule } });
    }
    case 'monster_game_reward_submit': {
      const body = await json(req);
      console.log(`[monster] reward request: ${body.coins} coins for round ${body.round_id}`);
      return send(res, 200, { status: 'pending' });
    }
    case 'monster_game_economy':
      return send(res, 200, { economy: devEconomy, live_players: devPresence(null) });
    case 'monster_game_economy_save': {
      const body = await json(req);
      devEconomy = { ...devEconomy, ...body.economy, version: devEconomy.version + 1, paid_entry: false, withdrawals: false, changed_at: new Date().toISOString() };
      return send(res, 200, devEconomy);
    }
    default:
      return send(res, 200, null);
  }
}

function devMonsterAsset(req, res, url) {
  const m = /^\/play-game\/[A-Za-z0-9_.-]+\/(index\.html|(?:assets|game)\/[A-Za-z0-9_./-]+)$/.exec(url.pathname);
  if (!m || /(^|\/)\.\.?(\/|$)/.test(m[1])) return send(res, 404, {});
  const file = normalize(join(MONSTER_DIR, m[1]));
  if (!file.startsWith(normalize(MONSTER_DIR)) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, {});
  const type = MONSTER_TYPES[extname(file).toLowerCase()];
  if (!type) return send(res, 404, {});
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': statSync(file).size, 'Cache-Control': 'private, max-age=3600', ...CORS });
  createReadStream(file).pipe(res);
}

// ------------------------------------------------------------------ router

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') return send(res, 204);
  const actor = actorFrom(req);
  try {
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url);
    if (url.pathname === '/rest/v1/rpc/competition_live') return send(res, 200, devCompetition());
    if (url.pathname.startsWith('/rest/v1/rpc/monster_game_')) return await devMonster(req, res, url.pathname.slice('/rest/v1/rpc/'.length), actor);
    if (url.pathname.startsWith('/play-game/')) return devMonsterAsset(req, res, url);
    if (url.pathname.startsWith('/rest/v1/rpc/')) return await handleRpc(req, res, url.pathname.slice('/rest/v1/rpc/'.length), actor);
    if (url.pathname.startsWith('/rest/v1/')) return await handleTable(req, res, url.pathname.slice('/rest/v1/'.length), url, actor);
    if (url.pathname.startsWith('/storage/v1/object')) return await handleStorage(req, res, url, actor);
    if (url.pathname === '/functions/v1/create-post') return await createPost(req, res, actor);
    if (url.pathname === '/functions/v1/create-account-deletion-request') return await deletionStart(req, res);
    if (url.pathname === '/functions/v1/verify-account-deletion-otp') return await deletionVerify(req, res);
    if (url.pathname === '/functions/v1/send-complaint-email') return await forwardComplaint(req, res, actor);
    if (url.pathname === '/functions/v1/post-og') return await postOg(res, url);
    if (url.pathname.startsWith('/realtime/')) return send(res, 404, { message: 'Realtime is not emulated locally' });
    // Dev-only helper for the local e2e script: the last code "emailed" to an address.
    if (url.pathname === '/__dev/last-code') return send(res, 200, { code: codes.get(normalizeEmail(url.searchParams.get('email') ?? ''))?.code ?? lastDeletionCodes.get(normalizeEmail(url.searchParams.get('email') ?? '')) ?? null });
    return send(res, 404, { message: 'Not found' });
  } catch (e) {
    console.error('[server]', e);
    if (!res.headersSent) send(res, e.status ?? 500, { message: e.status === 413 ? 'Payload too large' : 'Internal error' });
  }
}).listen(PORT, () => {
  console.log(`OJASSS local QA API on http://localhost:${PORT}  (DEV ONLY — real migrations, embedded Postgres)`);
  if (ADMIN_EMAIL) console.log(`Accounts signing in as ${ADMIN_EMAIL} are promoted to admin.`);
});
