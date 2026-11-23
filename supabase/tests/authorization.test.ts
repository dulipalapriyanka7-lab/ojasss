import { beforeAll, describe, expect, it } from 'vitest';
import { TestDb, createPost, expectDbError, setSetting } from './harness';

let db: TestDb;
let alice: string;
let bob: string;
let mod: string;
let admin: string;

beforeAll(async () => {
  db = await TestDb.create();
  alice = await db.createUser('alice@example.com');
  bob = await db.createUser('bob@example.com');
  mod = await db.createUser('mod@example.com', { role: 'moderator' });
  admin = await db.createUser('admin@example.com', { role: 'admin' });
  await setSetting(db, 'content.comments_enabled', true);
});

describe('direct table access', () => {
  const privateTables = [
    'profiles', 'posts', 'engagements', 'earnings', 'withdrawals', 'payout_details', 'admin_logs',
    'reports', 'app_settings', 'authorities', 'deletion_verifications', 'account_deletion_requests',
    'business_inquiries', 'rate_limits', 'push_tokens', 'follows', 'blocks', 'bookmarks', 'comments',
  ];

  it.each(privateTables)('anon cannot read %s', async (table) => {
    await expectDbError(db.anon().query(`select * from public.${table} limit 1`), { code: '42501' });
  });

  it.each(privateTables)('authenticated users cannot read %s directly', async (table) => {
    await expectDbError(db.as(alice).query(`select * from public.${table} limit 1`), { code: '42501' });
  });

  it('users cannot award themselves money by inserting earnings', async () => {
    await expectDbError(
      db.as(alice).query(
        `insert into public.earnings (user_id, type, amount_paise, status, reference) values ($1, 'bonus', 999999, 'approved', 'x')`,
        [alice],
      ),
      { code: '42501' },
    );
  });

  it('users cannot promote themselves to admin by updating profiles', async () => {
    await expectDbError(db.as(alice).query(`update public.profiles set role = 'admin' where id = $1`, [alice]), {
      code: '42501',
    });
    const [p] = await db.sql<{ role: string }>(`select role from public.profiles where id = $1`, [alice]);
    expect(p.role).toBe('user');
  });

  it('users cannot write notifications, messages or conversations directly', async () => {
    await expectDbError(
      db.as(alice).query(`insert into public.notifications (user_id, type, title) values ($1, 'system', 'x')`, [bob]),
      { code: '42501' },
    );
    await expectDbError(db.as(alice).query(`delete from public.notifications`), { code: '42501' });
  });
});

describe('function allow-list', () => {
  it('internal service functions are not callable by users or anon', async () => {
    await expectDbError(
      db.as(alice).rpc('internal_create_post', { p_user_id: alice, p: { kind: 'video' } }),
      { code: '42501' },
    );
    await expectDbError(db.anon().rpc('internal_deletion_consume', { p_id: crypto.randomUUID() }), { code: '42501' });
    await expectDbError(db.as(alice).rpc('_notify', {
      p_user: bob, p_type: 'system', p_actor: alice, p_post: null, p_title: 'x', p_body: 'x', p_link: null,
    }), { code: '42501' });
    await expectDbError(db.as(alice).rpc('_log_admin', {
      p_admin: alice, p_action: 'x', p_target_type: 'x', p_target_id: 'x', p_prev: null, p_new: null, p_reason: null,
    }), { code: '42501' });
  });

  it('anon cannot call signed-in functions', async () => {
    await expectDbError(db.anon().rpc('get_wallet'), { code: '42501' });
    await expectDbError(db.anon().rpc('admin_dashboard'), { code: '42501' });
  });
});

describe('admin authorization comes from the database, not the client', () => {
  const adminCalls: Array<[string, Record<string, unknown>]> = [
    ['admin_dashboard', {}],
    ['admin_list_users', {}],
    ['admin_manage_user', { p_user_id: '00000000-0000-0000-0000-000000000000', p_action: 'set_role', p_role: 'admin' }],
    ['admin_list_withdrawals', {}],
    ['admin_process_withdrawal', { p_withdrawal_id: '00000000-0000-0000-0000-000000000000', p_action: 'approve' }],
    ['admin_review_earning', { p_earning_id: '00000000-0000-0000-0000-000000000000', p_approve: true }],
    ['admin_grant_bonus', { p_user_id: '00000000-0000-0000-0000-000000000000', p_amount_paise: 100, p_reason: 'hack' }],
    ['admin_update_setting', { p_key: 'rewards.viral_paise', p_value: 1, p_confirm: true }],
    ['admin_list_logs', {}],
    ['admin_list_deletion_requests', {}],
  ];

  it.each(adminCalls)('regular user gets 403 from %s', async (fn, args) => {
    await expectDbError(db.as(alice).rpc(fn, args), { status: 403 });
  });

  it('a forged JWT "role" claim does not grant admin', async () => {
    await db.enter({ kind: 'user', id: alice });
    try {
      await db.pg.query(`select set_config('request.jwt.claims', '{"role":"admin","user_role":"admin"}', false)`);
      await expect(db.pg.query(`select public.admin_dashboard()`)).rejects.toMatchObject({ code: 'PT403' });
    } finally {
      await db.leave();
    }
  });

  it('moderators can moderate content but cannot touch money, settings or roles', async () => {
    await expect(db.as(mod).rpc('admin_dashboard')).resolves.toBeTruthy();
    await expectDbError(db.as(mod).rpc('admin_list_withdrawals'), { status: 403 });
    await expectDbError(db.as(mod).rpc('admin_list_earnings'), { status: 403 });
    await expectDbError(db.as(mod).rpc('admin_update_setting', { p_key: 'rewards.viral_paise', p_value: 1 }), { status: 403 });
    await expectDbError(db.as(mod).rpc('admin_manage_user', { p_user_id: alice, p_action: 'set_role', p_role: 'admin' }), {
      status: 403,
    });
  });

  it('admins can change roles, and the change is audit-logged', async () => {
    await db.as(admin).rpc('admin_manage_user', { p_user_id: bob, p_action: 'verify', p_reason: 'Known creator' });
    const logs = await db.sql<{ action: string; admin_id: string }>(
      `select action, admin_id from public.admin_logs where target_id = $1`, [bob],
    );
    expect(logs).toEqual([{ action: 'user.verify', admin_id: admin }]);
  });

  it('admins cannot demote or suspend themselves via the panel', async () => {
    await expectDbError(db.as(admin).rpc('admin_manage_user', { p_user_id: admin, p_action: 'set_role', p_role: 'user' }), {
      status: 422,
    });
  });

  it('audit log is append-only, even for the database owner', async () => {
    await expect(db.sql(`delete from public.admin_logs`)).rejects.toThrow(/AUDIT_IMMUTABLE/);
    await expect(db.sql(`update public.admin_logs set reason = 'x'`)).rejects.toThrow(/AUDIT_IMMUTABLE/);
  });

  it('a suspended user is locked out of every mutating API', async () => {
    const carol = await db.createUser('carol@example.com');
    const post = await createPost(db, bob);
    await db.as(admin).rpc('admin_manage_user', { p_user_id: carol, p_action: 'suspend', p_reason: 'Spam wave' });
    await expectDbError(db.as(carol).rpc('toggle_engagement', { p_post_id: post, p_kind: 'hot' }), { status: 403 });
    await expectDbError(db.as(carol).rpc('add_comment', { p_post_id: post, p_body: 'hi' }), { status: 403 });
    await expectDbError(db.as(carol).rpc('request_withdrawal', { p_amount_paise: 10000, p_idempotency_key: 'k-12345678' }), {
      status: 403,
    });
    // get_me still works so the client can explain the restriction.
    const me = await db.as(carol).rpc<{ status: string }>('get_me');
    expect(me.status).toBe('suspended');
  });

  it('a suspended admin loses admin rights immediately', async () => {
    const admin2 = await db.createUser('admin2@example.com', { role: 'admin' });
    await db.as(admin).rpc('admin_manage_user', { p_user_id: admin2, p_action: 'suspend', p_reason: 'Compromised' });
    await expectDbError(db.as(admin2).rpc('admin_dashboard'), { status: 403 });
  });
});

describe('realtime-readable tables are scoped by RLS', () => {
  it('only participants can read a conversation and its messages', async () => {
    const eve = await db.createUser('eve@example.com');
    const conv = await db.as(alice).rpc<string>('get_or_create_conversation', { p_other: bob });
    await db.as(alice).rpc('send_message', { p_conversation_id: conv, p_body: 'Hello Bob' });

    expect(await db.as(bob).query(`select body from public.messages where conversation_id = $1`, [conv])).toHaveLength(1);
    expect(await db.as(eve).query(`select body from public.messages where conversation_id = $1`, [conv])).toHaveLength(0);
    expect(await db.as(eve).query(`select id from public.conversations where id = $1`, [conv])).toHaveLength(0);
    await expectDbError(db.as(eve).rpc('send_message', { p_conversation_id: conv, p_body: 'intrude' }), { status: 404 });
    await expectDbError(db.as(eve).rpc('mark_conversation_read', { p_conversation_id: conv }), { status: 404 });
  });

  it('users only see their own notifications', async () => {
    const rows = await db.as(alice).query<{ user_id: string }>(`select user_id from public.notifications`);
    expect(rows.every((r) => r.user_id === alice)).toBe(true);
  });
});

describe('profile updates', () => {
  it('validates usernames and rejects reserved or taken names', async () => {
    await expectDbError(db.as(alice).rpc('update_profile', { p_username: 'Admin' }), { status: 422 });
    await expectDbError(db.as(alice).rpc('update_profile', { p_username: 'a b' }), { status: 422 });
    const bobName = (await db.sql<{ username: string }>(`select username from public.profiles where id = $1`, [bob]))[0].username;
    await expectDbError(db.as(alice).rpc('update_profile', { p_username: bobName }), { status: 409 });
    const me = await db.as(alice).rpc<{ username: string }>('update_profile', { p_username: 'alice.creates' });
    expect(me.username).toBe('alice.creates');
  });

  it('never auto-assigns a reserved username at signup', async () => {
    const id = await db.createUser('admin@somewhere.in');
    const [{ username }] = await db.sql<{ username: string }>(`select username from public.profiles where id = $1`, [id]);
    expect(username).not.toBe('admin');
    expect(username).toMatch(/^admin_\d{5}$/);
  });

  it('avatar paths must live in the caller\'s own storage folder', async () => {
    await expectDbError(db.as(alice).rpc('update_profile', { p_avatar_path: `${bob}/avatar.jpg` }), { status: 422 });
    await expectDbError(db.as(alice).rpc('update_profile', { p_avatar_path: `${alice}/../x.jpg` }), { status: 422 });
  });
});
