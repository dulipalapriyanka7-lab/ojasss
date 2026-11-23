import { beforeAll, describe, expect, it } from 'vitest';
import { TestDb, createPost, expectDbError } from './harness';

let db: TestDb;
let creator: string;
let admin: string;
let admin2: string;
let clicker: string;

type Wallet = { available_paise: number; pending_paise: number; withdrawn_paise: number; in_process_paise: number };
const wallet = async (uid: string) => {
  const w = await db.as(uid).rpc<Wallet>('get_wallet');
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Number(v)])) as Wallet;
};

async function grantApproved(userId: string, paise: number) {
  await db.as(admin).rpc('admin_grant_bonus', { p_user_id: userId, p_amount_paise: paise, p_reason: 'Test credit' });
}

beforeAll(async () => {
  db = await TestDb.create();
  creator = await db.createUser('creator@example.com');
  admin = await db.createUser('admin@example.com', { role: 'admin' });
  admin2 = await db.createUser('admin2@example.com', { role: 'admin' });
  clicker = await db.createUser('clicker@example.com');
});

describe('payout details', () => {
  it('validates UPI and bank details server-side', async () => {
    await expectDbError(db.as(creator).rpc('upsert_payout_detail', { p_method: 'upi', p_upi_id: 'not-a-upi' }), { status: 422 });
    await expectDbError(db.as(creator).rpc('upsert_payout_detail', {
      p_method: 'bank', p_account_holder_name: 'A B', p_account_number: '12', p_ifsc: 'SBIN0001234',
    }), { status: 422 });
  });

  it('returns only a masked view to the owner', async () => {
    const d = await db.as(creator).rpc<{ masked: string; method: string }>('upsert_payout_detail', {
      p_method: 'bank', p_account_holder_name: 'Creator One', p_account_number: '123456789012',
      p_ifsc: 'sbin0001234', p_bank_name: 'SBI',
    });
    expect(d.masked).toBe('SBI ••••9012 (SBIN0001234)');
    expect(JSON.stringify(d)).not.toContain('123456789012');
  });
});

describe('requestWithdrawal', () => {
  it('rejects negative, zero, below-minimum and above-balance amounts', async () => {
    await grantApproved(creator, 25000);
    const req = (amount: number, key: string) =>
      db.as(creator).rpc('request_withdrawal', { p_amount_paise: amount, p_idempotency_key: key });
    await expectDbError(req(-500, 'neg-00001'), { status: 422, message: 'INVALID_AMOUNT' });
    await expectDbError(req(0, 'zero-0001'), { status: 422, message: 'INVALID_AMOUNT' });
    await expectDbError(req(5000, 'small-001'), { status: 422, message: 'BELOW_MINIMUM' });
    await expectDbError(req(25001, 'big-00001'), { status: 422, message: 'INSUFFICIENT_BALANCE' });
  });

  it('requires payout details', async () => {
    const u = await db.createUser('nodetails@example.com');
    await grantApproved(u, 20000);
    await expectDbError(db.as(u).rpc('request_withdrawal', { p_amount_paise: 15000, p_idempotency_key: 'nodet-001' }), {
      status: 422, message: 'PAYOUT_DETAILS_REQUIRED',
    });
  });

  it('is idempotent: replaying the same key never creates a second request', async () => {
    const first = await db.as(creator).rpc<{ id: string; replayed: boolean }>('request_withdrawal', {
      p_amount_paise: 20000, p_idempotency_key: 'withdraw-key-1',
    });
    const replay = await db.as(creator).rpc<{ id: string; replayed: boolean }>('request_withdrawal', {
      p_amount_paise: 20000, p_idempotency_key: 'withdraw-key-1',
    });
    expect(replay).toMatchObject({ id: first.id, replayed: true });
    expect(await db.sql(`select id from public.withdrawals where user_id = $1`, [creator])).toHaveLength(1);
    expect(await wallet(creator)).toMatchObject({ available_paise: 5000, in_process_paise: 20000 });
  });

  it('allows only one open withdrawal at a time', async () => {
    await grantApproved(creator, 20000);
    await expectDbError(db.as(creator).rpc('request_withdrawal', { p_amount_paise: 10000, p_idempotency_key: 'second-key' }), {
      status: 409, message: 'WITHDRAWAL_IN_PROGRESS',
    });
  });

  it('locks payout details while a withdrawal is open (no bait-and-switch)', async () => {
    await expectDbError(db.as(creator).rpc('upsert_payout_detail', { p_method: 'upi', p_upi_id: 'thief@okaxis' }), {
      status: 409,
    });
  });

  it('users cannot read the full payout snapshot of their withdrawal', async () => {
    const rows = await db.as(creator).rpc<Array<Record<string, unknown>>>('list_my_withdrawals');
    expect(JSON.stringify(rows)).not.toContain('123456789012');
  });
});

describe('processWithdrawal (admin)', () => {
  let wid: string;

  beforeAll(async () => {
    [{ id: wid }] = await db.sql<{ id: string }>(`select id from public.withdrawals where user_id = $1`, [creator]);
  });

  it('non-admins cannot process withdrawals, including their own', async () => {
    await expectDbError(db.as(creator).rpc('admin_process_withdrawal', { p_withdrawal_id: wid, p_action: 'approve' }), {
      status: 403,
    });
  });

  it('cannot mark paid before approval; paid requires a UTR reference', async () => {
    await expectDbError(db.as(admin).rpc('admin_process_withdrawal', {
      p_withdrawal_id: wid, p_action: 'mark_paid', p_payment_reference: 'UTR123456',
    }), { status: 409, message: 'INVALID_TRANSITION' });
    await db.as(admin).rpc('admin_process_withdrawal', { p_withdrawal_id: wid, p_action: 'approve' });
    await expectDbError(db.as(admin).rpc('admin_process_withdrawal', { p_withdrawal_id: wid, p_action: 'mark_paid' }), {
      status: 422, message: 'REFERENCE_REQUIRED',
    });
  });

  it('mark paid moves money to withdrawn and records an auditable trail', async () => {
    await db.as(admin).rpc('admin_process_withdrawal', {
      p_withdrawal_id: wid, p_action: 'mark_paid', p_payment_reference: 'UTR998877',
    });
    expect(await wallet(creator)).toMatchObject({ withdrawn_paise: 20000, in_process_paise: 0, available_paise: 25000 });
    const events = await db.sql<{ from_status: string | null; to_status: string }>(
      `select from_status, to_status from public.withdrawal_events where withdrawal_id = $1 order by id`, [wid]);
    expect(events).toEqual([
      { from_status: null, to_status: 'requested' },
      { from_status: 'requested', to_status: 'approved' },
      { from_status: 'approved', to_status: 'paid' },
    ]);
    const logs = await db.sql(`select action from public.admin_logs where target_id = $1 order by id`, [wid]);
    expect(logs.map((l) => (l as { action: string }).action)).toEqual(['withdrawal.approve', 'withdrawal.mark_paid']);
    await expectDbError(db.as(admin).rpc('admin_process_withdrawal', { p_withdrawal_id: wid, p_action: 'reject', p_note: 'oops' }), {
      status: 409,
    });
  });

  it('rejection returns the amount to the available balance', async () => {
    const r = await db.as(creator).rpc<{ id: string }>('request_withdrawal', {
      p_amount_paise: 15000, p_idempotency_key: 'withdraw-key-2',
    });
    expect((await wallet(creator)).available_paise).toBe(10000);
    await expectDbError(db.as(admin).rpc('admin_process_withdrawal', { p_withdrawal_id: r.id, p_action: 'reject' }), {
      status: 422, message: 'REASON_REQUIRED',
    });
    await db.as(admin).rpc('admin_process_withdrawal', { p_withdrawal_id: r.id, p_action: 'reject', p_note: 'KYC mismatch' });
    expect((await wallet(creator)).available_paise).toBe(25000);
  });

  it('an admin cannot approve their own withdrawal', async () => {
    await db.as(admin).rpc('upsert_payout_detail', { p_method: 'upi', p_upi_id: 'boss@okhdfc' });
    await db.as(admin2).rpc('admin_grant_bonus', { p_user_id: admin, p_amount_paise: 20000, p_reason: 'Test' });
    const r = await db.as(admin).rpc<{ id: string }>('request_withdrawal', { p_amount_paise: 15000, p_idempotency_key: 'adm-key-01' });
    await expectDbError(db.as(admin).rpc('admin_process_withdrawal', { p_withdrawal_id: r.id, p_action: 'approve' }), {
      status: 422, message: 'SELF_ACTION',
    });
  });

  it('admins cannot grant bonuses to themselves', async () => {
    await expectDbError(db.as(admin).rpc('admin_grant_bonus', { p_user_id: admin, p_amount_paise: 100, p_reason: 'me' }), {
      status: 422,
    });
  });
});

describe('approveReward (admin)', () => {
  it('approves once; re-review is refused; rejection needs a reason', async () => {
    const [e] = await db.sql<{ id: string }>(
      `insert into public.earnings (user_id, type, amount_paise, reference) values ($1, 'viral', 5000, 'viral:test-1') returning id`,
      [creator]);
    await expectDbError(db.as(admin).rpc('admin_review_earning', { p_earning_id: e.id, p_approve: false }), { status: 422 });
    await db.as(admin).rpc('admin_review_earning', { p_earning_id: e.id, p_approve: true });
    await expectDbError(db.as(admin).rpc('admin_review_earning', { p_earning_id: e.id, p_approve: true }), { status: 409 });
  });
});

describe('CTA click rewards', () => {
  let post: string;
  beforeAll(async () => {
    post = await createPost(db, creator, { cta_type: 'visit_website', cta_url: 'https://shop.example.in/item' });
  });

  it('rejects CTA URLs that do not match the CTA type', async () => {
    await expectDbError(createPost(db, creator, { cta_type: 'visit_website', cta_url: 'javascript:alert(1)' }), { status: 422 });
    await expectDbError(createPost(db, creator, { cta_type: 'call', cta_url: 'https://x.y' }), { status: 422 });
  });

  it('the CTA target URL is not exposed in feed cards', async () => {
    const [card] = await db.anon().rpc<Array<Record<string, unknown>>>('get_post', { p_post_id: post });
    expect(card.has_cta).toBe(true);
    expect(JSON.stringify(card)).not.toContain('shop.example.in');
  });

  it('a unique signed-in clicker earns the creator one pending reward; repeats earn nothing', async () => {
    const r = await db.as(clicker).rpc<{ url: string }>('record_cta_click', { p_post_id: post });
    expect(r.url).toBe('https://shop.example.in/item');
    await db.as(clicker).rpc('record_cta_click', { p_post_id: post });
    await db.as(clicker).rpc('record_cta_click', { p_post_id: post });
    const rewards = await db.sql(`select * from public.earnings where post_id = $1 and type = 'cta_click'`, [post]);
    expect(rewards).toHaveLength(1);
    const [{ cta_clicks_count }] = await db.sql<{ cta_clicks_count: number }>(
      `select cta_clicks_count from public.posts where id = $1`, [post]);
    expect(cta_clicks_count).toBe(3);
  });

  it('creator self-clicks and anonymous clicks never generate rewards', async () => {
    await db.as(creator).rpc('record_cta_click', { p_post_id: post });
    await db.anon().rpc('record_cta_click', { p_post_id: post });
    const rewards = await db.sql(`select * from public.earnings where post_id = $1 and type = 'cta_click'`, [post]);
    expect(rewards).toHaveLength(1);
  });

  it('WhatsApp CTAs resolve server-side to a wa.me link', async () => {
    const wa = await createPost(db, creator, { cta_type: 'whatsapp', cta_url: '+91 9876543210'.replace(/ /g, '') });
    const r = await db.anon().rpc<{ url: string }>('record_cta_click', { p_post_id: wa });
    expect(r.url).toBe('https://wa.me/919876543210');
  });
});

describe('referrals', () => {
  it('a referral creates one pending (admin-reviewed) reward; self-referral is refused', async () => {
    const [{ referral_code }] = await db.sql<{ referral_code: string }>(
      `select referral_code from public.profiles where id = $1`, [creator]);
    const newbie = await db.createUser('newbie@example.com');
    const self = (await db.sql<{ referral_code: string }>(`select referral_code from public.profiles where id = $1`, [newbie]))[0];
    await expectDbError(db.as(newbie).rpc('complete_onboarding', {
      p_username: 'newbie_one', p_display_name: 'Newbie', p_referral_code: self.referral_code,
    }), { status: 422, message: 'INVALID_REFERRAL' });
    await db.as(newbie).rpc('complete_onboarding', {
      p_username: 'newbie_one', p_display_name: 'Newbie', p_referral_code: referral_code.toLowerCase(),
    });
    await db.as(newbie).rpc('complete_onboarding', {
      p_username: 'newbie_one', p_display_name: 'Newbie', p_referral_code: referral_code,
    });
    const rewards = await db.sql<{ status: string }>(
      `select status from public.earnings where type = 'referral' and user_id = $1`, [creator]);
    expect(rewards).toEqual([{ status: 'pending' }]);
  });
});
