import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const bootstrap = readFileSync(join(HERE, 'bootstrap.sql'), 'utf8');
const migrations = readdirSync(join(ROOT, 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(ROOT, 'migrations', f), 'utf8'));

export class DbError extends Error {
  constructor(public code: string, message: string, public detail?: string) {
    super(message);
  }
  /** HTTP status PostgREST would return for PTxxx codes. */
  get status(): number | null {
    return this.code?.startsWith('PT') ? Number(this.code.slice(2)) : null;
  }
}

type Args = Record<string, unknown>;
type Actor = { kind: 'anon' } | { kind: 'user'; id: string } | { kind: 'service' };

export class TestDb {
  private constructor(public pg: PGlite) {}

  static async create(): Promise<TestDb> {
    const pg = new PGlite();
    await pg.exec(bootstrap);
    for (const sql of migrations) await pg.exec(sql);
    return new TestDb(pg);
  }

  /** Superuser SQL, for arranging fixtures and asserting on raw state. */
  async sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query<T>(query, params)).rows;
  }

  async createUser(email: string, opts: { role?: 'user' | 'moderator' | 'admin'; name?: string } = {}): Promise<string> {
    const [row] = await this.sql<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
      [email, JSON.stringify({ full_name: opts.name ?? email.split('@')[0] })],
    );
    if (opts.role && opts.role !== 'user') {
      await this.sql(`update public.profiles set role = $1 where id = $2`, [opts.role, row.id]);
    }
    return row.id;
  }

  anon() {
    return new Session(this, { kind: 'anon' });
  }
  as(id: string) {
    return new Session(this, { kind: 'user', id });
  }
  service() {
    return new Session(this, { kind: 'service' });
  }

  async enter(actor: Actor) {
    const sub = actor.kind === 'user' ? actor.id : '';
    const role = actor.kind === 'user' ? 'authenticated' : actor.kind === 'anon' ? 'anon' : 'service_role';
    await this.pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub]);
    await this.pg.exec(`set role ${role}`);
  }
  async leave() {
    await this.pg.exec(`reset role`);
    await this.pg.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

export class Session {
  constructor(private db: TestDb, private actor: Actor) {}

  /** Raw query executed with this actor's role and JWT subject. */
  async query<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
    await this.db.enter(this.actor);
    try {
      return (await this.db.pg.query<T>(query, params)).rows;
    } catch (e) {
      const err = e as { code?: string; message: string; detail?: string };
      throw new DbError(err.code ?? '', err.message, err.detail);
    } finally {
      await this.db.leave();
    }
  }

  /** Call an API function with named arguments, like supabase.rpc(). */
  async rpc<T = unknown>(fn: string, args: Args = {}): Promise<T> {
    const keys = Object.keys(args);
    const named = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
    const params = keys.map((k) => {
      const v = args[k];
      return v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v;
    });
    const rows = await this.query<Record<string, unknown>>(`select * from public.${fn}(${named})`, params);
    if (rows.length === 1 && Object.keys(rows[0]).length === 1 && fn in rows[0]) {
      return rows[0][fn] as T;
    }
    return rows as T;
  }
}

/** Assert that a promise rejects with a given DB error code / HTTP status. */
export async function expectDbError(p: Promise<unknown>, match: { status?: number; code?: string; message?: RegExp | string }) {
  try {
    await p;
  } catch (e) {
    if (!(e instanceof DbError)) throw e;
    if (match.status !== undefined && e.status !== match.status) {
      throw new Error(`Expected HTTP ${match.status}, got ${e.code} ${e.message}`);
    }
    if (match.code !== undefined && e.code !== match.code) {
      throw new Error(`Expected SQLSTATE ${match.code}, got ${e.code} ${e.message}`);
    }
    if (match.message !== undefined) {
      const ok = typeof match.message === 'string' ? e.message === match.message : match.message.test(e.message);
      if (!ok) throw new Error(`Unexpected error message: ${e.message}`);
    }
    return e;
  }
  throw new Error('Expected the call to fail, but it succeeded');
}

let postCounter = 0;
/** Creates a published post the way the create-post edge function does (service role). */
export async function createPost(db: TestDb, authorId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  postCounter += 1;
  const payload = {
    kind: 'video',
    media_path: `${authorId}/video-${postCounter}.mp4`,
    thumbnail_path: `${authorId}/thumb-${postCounter}.jpg`,
    mime_type: 'video/mp4',
    size_bytes: 1024 * 1024,
    width: 1080,
    height: 1920,
    duration_ms: 15000,
    caption: `Test post ${postCounter}`,
    category: 'entertainment',
    language: 'en',
    ...overrides,
  };
  return db.service().rpc<string>('internal_create_post', { p_user_id: authorId, p: payload });
}

export async function setSetting(db: TestDb, key: string, value: unknown) {
  await db.sql(`update public.app_settings set value = $1::jsonb where key = $2`, [JSON.stringify(value), key]);
}
