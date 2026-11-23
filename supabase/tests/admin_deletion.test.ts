import { beforeAll, describe, expect, it } from 'vitest';
import { TestDb, createPost, expectDbError } from './harness';

let db: TestDb;
let admin: string;
let user: string;

beforeAll(async () => {
  db = await TestDb.create();
  admin = await db.createUser('admin@example.com', { role: 'admin' });
  user = await db.createUser('member@example.com');
});

describe('admin settings', () => {
  it('dangerous settings require explicit confirmation', async () => {
    await expectDbError(db.as(admin).rpc('admin_update_setting', { p_key: 'rewards.viral_paise', p_value: 7000 }), {
      status: 428,
    });
    const s = await db.as(admin).rpc<Array<{ value: number }>>('admin_update_setting', {
      p_key: 'rewards.viral_paise', p_value: 7000, p_reason: 'Festive campaign', p_confirm: true,
    });
    expect(s[0].value).toBe(7000);
  });

  it('validates types and ranges server-side', async () => {
    const upd = (key: string, value: unknown) =>
      db.as(admin).rpc('admin_update_setting', { p_key: key, p_value: value, p_confirm: true });
    await expectDbError(upd('engagement.hot_threshold', 0), { status: 422 });
    await expectDbError(upd('engagement.hot_threshold', JSON.stringify('lots')), { status: 422 });
    await expectDbError(upd('engagement.hot_threshold', 1.5), { status: 422 });
    await expectDbError(upd('platform.maintenance_mode', 1), { status: 422 });
    await expectDbError(upd('withdrawals.min_paise', 99999999), { status: 422 });
    await expectDbError(upd('no.such_key', 1), { status: 404 });
  });

  it('maintenance mode pauses user writes but not staff', async () => {
    const post = await createPost(db, admin);
    await db.as(admin).rpc('admin_update_setting', { p_key: 'platform.maintenance_mode', p_value: true, p_confirm: true });
    await expectDbError(db.as(user).rpc('toggle_engagement', { p_post_id: post, p_kind: 'hot' }), { status: 503 });
    await db.as(admin).rpc('admin_update_setting', { p_key: 'platform.maintenance_mode', p_value: false, p_confirm: true });
    await db.as(user).rpc('toggle_engagement', { p_post_id: post, p_kind: 'hot' });
  });

  it('public settings expose only public keys', async () => {
    const s = await db.anon().rpc<Record<string, unknown>>('public_settings');
    expect(s).toHaveProperty(['engagement.hot_threshold']);
    expect(s).not.toHaveProperty(['rewards.auto_approve']);
  });
});

describe('admin dashboard uses real data', () => {
  it('counts reflect the database', async () => {
    const d = await db.as(admin).rpc<Record<string, number>>('admin_dashboard', {
      p_from: new Date(Date.now() - 86400000).toISOString(), p_to: new Date(Date.now() + 60000).toISOString(),
    });
    const [{ n }] = await db.sql<{ n: number }>(`select count(*)::int n from public.profiles`);
    expect(Number(d.total_users)).toBe(n);
    expect(Number(d.videos)).toBeGreaterThanOrEqual(1);
  });

  it('timeseries buckets sum to the underlying rows', async () => {
    const rows = await db.as(admin).rpc<Array<{ value: string }>>('admin_timeseries', {
      p_metric: 'users', p_from: new Date(Date.now() - 3 * 86400000).toISOString(),
      p_to: new Date(Date.now() + 60000).toISOString(), p_bucket: 'day',
    });
    expect(rows.reduce((a, r) => a + Number(r.value), 0)).toBe(2);
    await expectDbError(db.as(admin).rpc('admin_timeseries', {
      p_metric: 'users', p_from: '2020-01-01', p_to: '2026-01-01', p_bucket: 'day',
    }), { status: 422 });
  });
});

describe('announcements', () => {
  it('admins publish; everyone sees active announcements; links must be https or relative', async () => {
    await expectDbError(db.as(admin).rpc('admin_upsert_announcement', {
      p_id: null, p_title: 'Hi', p_message: 'Msg', p_cta_url: 'javascript:alert(1)',
    }), { status: 422 });
    await db.as(admin).rpc('admin_upsert_announcement', {
      p_id: null, p_title: 'Diwali creator fest', p_message: 'Double viral rewards this week', p_cta_url: '/earnings',
      p_notify: true,
    });
    const list = await db.anon().rpc<Array<{ title: string }>>('active_announcements');
    expect(list.map((a) => a.title)).toContain('Diwali creator fest');
    const n = await db.sql(`select * from public.notifications where type = 'announcement' and user_id = $1`, [user]);
    expect(n).toHaveLength(1);
  });
});

describe('account deletion OTP storage (service role)', () => {
  const hash = 'email-hash-abc';

  it('allows at most 5 attempts, then locks the code', async () => {
    const id = crypto.randomUUID();
    await db.service().rpc('internal_deletion_store', {
      p_id: id, p_email_hash: hash, p_code_hmac: 'digest', p_user_id: user, p_email: 'member@example.com',
      p_reason: 'leaving', p_source: 'web',
    });
    for (let i = 1; i <= 5; i++) {
      const r = await db.service().rpc<{ attempts: number } | null>('internal_deletion_attempt', { p_id: id, p_email_hash: hash });
      expect(r?.attempts).toBe(i);
    }
    expect(await db.service().rpc('internal_deletion_attempt', { p_id: id, p_email_hash: hash })).toBeNull();
  });

  it('attempts against the wrong email hash are refused', async () => {
    const id = crypto.randomUUID();
    await db.service().rpc('internal_deletion_store', {
      p_id: id, p_email_hash: hash, p_code_hmac: 'digest', p_user_id: user, p_email: 'member@example.com',
      p_reason: null, p_source: 'web',
    });
    expect(await db.service().rpc('internal_deletion_attempt', { p_id: id, p_email_hash: 'other' })).toBeNull();
  });

  it('expired codes cannot be used', async () => {
    const id = crypto.randomUUID();
    await db.service().rpc('internal_deletion_store', {
      p_id: id, p_email_hash: 'exp-hash', p_code_hmac: 'digest', p_user_id: user, p_email: 'member@example.com',
      p_reason: null, p_source: 'web',
    });
    await db.sql(`update public.deletion_verifications set expires_at = now() - interval '1 second' where id = $1`, [id]);
    expect(await db.service().rpc('internal_deletion_attempt', { p_id: id, p_email_hash: 'exp-hash' })).toBeNull();
    expect(await db.service().rpc('internal_deletion_consume', { p_id: id })).toEqual({ ok: false });
  });

  it('a new code invalidates the previous one; consumption is single-use and creates one request', async () => {
    const old = crypto.randomUUID();
    const fresh = crypto.randomUUID();
    const store = (id: string) => db.service().rpc('internal_deletion_store', {
      p_id: id, p_email_hash: 'single-hash', p_code_hmac: 'digest', p_user_id: user, p_email: 'member@example.com',
      p_reason: 'privacy', p_source: 'android',
    });
    await store(old);
    await store(fresh);
    expect(await db.service().rpc('internal_deletion_attempt', { p_id: old, p_email_hash: 'single-hash' })).toBeNull();
    expect(await db.service().rpc('internal_deletion_consume', { p_id: fresh })).toEqual({ ok: true });
    expect(await db.service().rpc('internal_deletion_consume', { p_id: fresh })).toEqual({ ok: false });
    const reqs = await db.sql<{ source: string; status: string }>(
      `select source, status from public.account_deletion_requests where user_id = $1`, [user]);
    expect(reqs).toEqual([{ source: 'android', status: 'pending' }]);
  });

  it('unknown emails produce the same consume response without creating a request', async () => {
    const id = crypto.randomUUID();
    await db.service().rpc('internal_deletion_store', {
      p_id: id, p_email_hash: 'ghost', p_code_hmac: 'digest', p_user_id: null, p_email: 'ghost@example.com',
      p_reason: null, p_source: 'web',
    });
    expect(await db.service().rpc('internal_deletion_consume', { p_id: id })).toEqual({ ok: true });
    const [{ n }] = await db.sql<{ n: number }>(
      `select count(*)::int n from public.account_deletion_requests where email = 'ghost@example.com'`);
    expect(n).toBe(0);
    const [v] = await db.sql<{ email: string | null }>(`select email from public.deletion_verifications where id = $1`, [id]);
    expect(v.email).toBeNull();
  });

  it('start is rate limited per email hash (3 per hour)', async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await db.service().rpc<{ allowed: boolean }>('internal_deletion_start', {
        p_email: 'member@example.com', p_email_hash: 'rl-hash', p_ip: null,
      }));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
  });

  it('admin completes a deletion: auth user removed, financial + audit rows retained', async () => {
    const leaver = await db.createUser('leaver@example.com');
    const post = await createPost(db, leaver);
    await db.as(admin).rpc('admin_grant_bonus', { p_user_id: leaver, p_amount_paise: 500, p_reason: 'Test' });
    const reqId = await db.as(leaver).rpc<string>('request_my_account_deletion', { p_reason: 'bye' });
    const listed = await db.as(admin).rpc<Array<{ id: string }>>('admin_list_deletion_requests', { p_status: 'pending' });
    expect(listed.map((r) => r.id)).toContain(reqId);

    await db.as(admin).rpc('admin_process_deletion_request', { p_request_id: reqId, p_action: 'complete' });
    expect(await db.sql(`select * from auth.users where id = $1`, [leaver])).toHaveLength(0);
    expect(await db.sql(`select * from public.posts where id = $1`, [post])).toHaveLength(0);
    const [e] = await db.sql<{ user_id: string | null }>(
      `select user_id from public.earnings where note = 'Test' and user_id is null`);
    expect(e.user_id).toBeNull();
    const [r] = await db.sql<{ status: string; email: string }>(
      `select status, email from public.account_deletion_requests where id = $1`, [reqId]);
    expect(r.status).toBe('completed');
    expect(r.email).toMatch(/@redacted\.invalid$/);
  });
});
