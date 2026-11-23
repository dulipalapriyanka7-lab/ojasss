import { beforeAll, describe, expect, it } from 'vitest';
import { TestDb, createPost, expectDbError, setSetting } from './harness';

type EngagementState = {
  my_hot: boolean; my_speak: boolean; my_viral: boolean;
  hot_count: number; speak_count: number; viral_count: number; is_viral: boolean; viral_eligible: boolean;
};

let db: TestDb;
let creator: string;
const fans: string[] = [];

beforeAll(async () => {
  db = await TestDb.create();
  creator = await db.createUser('creator@example.com');
  for (let i = 0; i < 6; i++) fans.push(await db.createUser(`fan${i}@example.com`));
  await setSetting(db, 'engagement.hot_threshold', 3);
  await setSetting(db, 'engagement.speak_threshold', 2);
  await setSetting(db, 'engagement.viral_threshold', 2);
  await setSetting(db, 'rewards.viral_paise', 5000);
});

const engage = (user: string, post: string, kind: string) =>
  db.as(user).rpc<EngagementState>('toggle_engagement', { p_post_id: post, p_kind: kind });

describe('HOT / SPEAK engagement', () => {
  it('clicking HOT twice toggles off — one record per user per post, counter consistent', async () => {
    const post = await createPost(db, creator);
    expect((await engage(fans[0], post, 'hot')).hot_count).toBe(1);
    const second = await engage(fans[0], post, 'hot');
    expect(second).toMatchObject({ my_hot: false, hot_count: 0 });
    const rows = await db.sql(`select * from public.engagements where post_id = $1`, [post]);
    expect(rows).toHaveLength(1);
  });

  it('counters always match the engagement rows (no client counters)', async () => {
    const post = await createPost(db, creator);
    for (const f of fans.slice(0, 4)) await engage(f, post, 'hot');
    await engage(fans[1], post, 'hot'); // un-HOT
    await engage(fans[2], post, 'speak');
    const [p] = await db.sql<{ hot_count: number; speak_count: number }>(
      `select hot_count, speak_count from public.posts where id = $1`, [post]);
    const [agg] = await db.sql<{ hot: number; speak: number }>(
      `select count(*) filter (where hot)::int hot, count(*) filter (where speak)::int speak
       from public.engagements where post_id = $1`, [post]);
    expect(p.hot_count).toBe(agg.hot);
    expect(p.speak_count).toBe(agg.speak);
  });

  it('creators cannot engage with their own posts', async () => {
    const post = await createPost(db, creator);
    await expectDbError(engage(creator, post, 'hot'), { status: 422, message: 'SELF_ENGAGEMENT' });
  });

  it('rejects unknown engagement kinds and unknown posts', async () => {
    const post = await createPost(db, creator);
    await expectDbError(engage(fans[0], post, 'like'), { status: 422 });
    await expectDbError(engage(fans[0], crypto.randomUUID(), 'hot'), { status: 404 });
  });

  it('removed posts cannot be engaged with', async () => {
    const post = await createPost(db, creator);
    await db.sql(`update public.posts set status = 'removed' where id = $1`, [post]);
    await expectDbError(engage(fans[0], post, 'hot'), { status: 404 });
  });

  it('first engagement notifies the creator once', async () => {
    const post = await createPost(db, creator);
    await engage(fans[3], post, 'hot');
    await engage(fans[3], post, 'hot');
    await engage(fans[3], post, 'hot');
    const n = await db.sql(`select * from public.notifications where post_id = $1 and type = 'engagement'`, [post]);
    expect(n).toHaveLength(1);
  });
});

describe('VIRAL eligibility and reward', () => {
  it('VIRAL is locked until the HOT and SPEAK thresholds are met', async () => {
    const post = await createPost(db, creator);
    await expectDbError(engage(fans[0], post, 'viral'), { status: 422, message: 'VIRAL_NOT_ELIGIBLE' });
    for (const f of fans.slice(0, 3)) await engage(f, post, 'hot');
    await expectDbError(engage(fans[0], post, 'viral'), { status: 422, message: 'VIRAL_NOT_ELIGIBLE' });
    for (const f of fans.slice(0, 2)) await engage(f, post, 'speak');
    const s = await engage(fans[0], post, 'viral');
    expect(s).toMatchObject({ viral_eligible: true, viral_count: 1, is_viral: false });
  });

  it('reaching the VIRAL threshold creates exactly one pending reward for the creator', async () => {
    const post = await createPost(db, creator);
    for (const f of fans.slice(0, 3)) await engage(f, post, 'hot');
    for (const f of fans.slice(0, 2)) await engage(f, post, 'speak');
    await engage(fans[0], post, 'viral');
    const s = await engage(fans[1], post, 'viral');
    expect(s.is_viral).toBe(true);

    // More votes, repeated VIRAL clicks and HOT toggling must not create more rewards.
    await engage(fans[2], post, 'viral');
    await engage(fans[0], post, 'viral');
    await engage(fans[0], post, 'hot');
    await engage(fans[0], post, 'hot');

    const earnings = await db.sql<{ user_id: string; amount_paise: string; status: string; type: string }>(
      `select user_id, amount_paise::text, status, type from public.earnings where post_id = $1`, [post]);
    expect(earnings).toEqual([{ user_id: creator, amount_paise: '5000', status: 'pending', type: 'viral' }]);
  });

  it('VIRAL votes are irreversible (clicking again keeps the vote)', async () => {
    const post = await createPost(db, creator);
    for (const f of fans.slice(0, 3)) await engage(f, post, 'hot');
    for (const f of fans.slice(0, 2)) await engage(f, post, 'speak');
    await engage(fans[4], post, 'viral');
    const again = await engage(fans[4], post, 'viral');
    expect(again).toMatchObject({ my_viral: true, viral_count: 1 });
  });

  it('pending rewards are not withdrawable until an admin approves them', async () => {
    const wallet = await db.as(creator).rpc<{ available_paise: number; pending_paise: number }>('get_wallet');
    expect(Number(wallet.available_paise)).toBe(0);
    expect(Number(wallet.pending_paise)).toBeGreaterThan(0);
  });

  it('auto-approve setting credits the balance immediately', async () => {
    await setSetting(db, 'rewards.auto_approve', true);
    const c2 = await db.createUser('creator2@example.com');
    const post = await createPost(db, c2);
    for (const f of fans.slice(0, 3)) await engage(f, post, 'hot');
    for (const f of fans.slice(0, 2)) await engage(f, post, 'speak');
    for (const f of fans.slice(0, 2)) await engage(f, post, 'viral');
    const wallet = await db.as(c2).rpc<{ available_paise: number }>('get_wallet');
    expect(Number(wallet.available_paise)).toBe(5000);
    await setSetting(db, 'rewards.auto_approve', false);
  });
});

describe('rate limiting', () => {
  it('rapid engagement abuse is throttled (HTTP 429)', async () => {
    const spammer = await db.createUser('spammer@example.com');
    const posts: string[] = [];
    for (let i = 0; i < 3; i++) posts.push(await createPost(db, creator));
    let limited = false;
    for (let i = 0; i < 100 && !limited; i++) {
      try {
        await engage(spammer, posts[i % 3], 'hot');
      } catch (e) {
        expect((e as { status: number }).status).toBe(429);
        limited = true;
      }
    }
    expect(limited).toBe(true);
  });
});
