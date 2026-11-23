import { beforeAll, describe, expect, it } from 'vitest';
import { TestDb, createPost, expectDbError, setSetting } from './harness';

let db: TestDb;
let alice: string;
let bob: string;
let carol: string;
let admin: string;

beforeAll(async () => {
  db = await TestDb.create();
  alice = await db.createUser('alice@example.com');
  bob = await db.createUser('bob@example.com');
  carol = await db.createUser('carol@example.com');
  admin = await db.createUser('admin@example.com', { role: 'admin' });
  await setSetting(db, 'content.comments_enabled', true);
});

const counts = async (id: string) =>
  (await db.sql<{ followers_count: number; following_count: number }>(
    `select followers_count, following_count from public.profiles where id = $1`, [id]))[0];

describe('follows', () => {
  it('toggles follow with consistent counters and no duplicates', async () => {
    const r1 = await db.as(alice).rpc<{ following: boolean; followers_count: number }>('toggle_follow', { p_user_id: bob });
    expect(r1).toEqual({ following: true, followers_count: 1 });
    const r2 = await db.as(alice).rpc<{ following: boolean }>('toggle_follow', { p_user_id: bob });
    expect(r2.following).toBe(false);
    await db.as(alice).rpc('toggle_follow', { p_user_id: bob });
    expect(await db.sql(`select * from public.follows where follower_id = $1`, [alice])).toHaveLength(1);
    expect(await counts(bob)).toMatchObject({ followers_count: 1 });
    expect(await counts(alice)).toMatchObject({ following_count: 1 });
  });

  it('notifies once per day, not on every follow/unfollow cycle', async () => {
    await db.as(alice).rpc('toggle_follow', { p_user_id: bob });
    await db.as(alice).rpc('toggle_follow', { p_user_id: bob });
    const n = await db.sql(`select * from public.notifications where user_id = $1 and type = 'follow'`, [bob]);
    expect(n).toHaveLength(1);
  });

  it('cannot follow yourself', async () => {
    await expectDbError(db.as(alice).rpc('toggle_follow', { p_user_id: alice }), { status: 422 });
  });

  it('follow state is visible on the profile (same data for every client)', async () => {
    const p = await db.as(alice).rpc<{ is_following: boolean }>('get_profile', { p_handle: bob });
    expect(p.is_following).toBe(true);
  });
});

describe('blocking', () => {
  it('severs follows both ways and hides the blocker\'s content and profile', async () => {
    await db.as(carol).rpc('toggle_follow', { p_user_id: alice });
    await db.as(alice).rpc('toggle_follow', { p_user_id: carol });
    const carolPost = await createPost(db, carol);

    await db.as(carol).rpc('block_user', { p_user_id: alice });
    expect(await db.sql(`select * from public.follows where
      (follower_id = $1 and followee_id = $2) or (follower_id = $2 and followee_id = $1)`, [alice, carol])).toHaveLength(0);
    expect(await counts(carol)).toMatchObject({ followers_count: 0, following_count: 0 });

    const feed = await db.as(alice).rpc<Array<{ id: string }>>('feed', { p_mode: 'latest', p_limit: 30 });
    expect(feed.map((c) => c.id)).not.toContain(carolPost);
    expect(await db.as(alice).rpc<unknown[]>('get_post', { p_post_id: carolPost })).toHaveLength(0);
    await expectDbError(db.as(alice).rpc('get_profile', { p_handle: carol }), { status: 404 });
    await expectDbError(db.as(alice).rpc('toggle_follow', { p_user_id: carol }), { status: 404 });
  });

  it('blocked users cannot message, start conversations, comment or engage', async () => {
    await expectDbError(db.as(alice).rpc('get_or_create_conversation', { p_other: carol }), { status: 403 });
    const post = await createPost(db, carol);
    await expectDbError(db.as(alice).rpc('add_comment', { p_post_id: post, p_body: 'hi' }), { status: 403 });
    await expectDbError(db.as(alice).rpc('toggle_engagement', { p_post_id: post, p_kind: 'hot' }), { status: 403 });
  });

  it('an existing conversation is frozen after a block', async () => {
    const dave = await db.createUser('dave@example.com');
    const conv = await db.as(dave).rpc<string>('get_or_create_conversation', { p_other: bob });
    await db.as(dave).rpc('send_message', { p_conversation_id: conv, p_body: 'hey' });
    await db.as(bob).rpc('block_user', { p_user_id: dave });
    await expectDbError(db.as(dave).rpc('send_message', { p_conversation_id: conv, p_body: 'hello?' }), { status: 403 });
    await expectDbError(db.as(bob).rpc('send_message', { p_conversation_id: conv, p_body: 'bye' }), { status: 403 });
    const list = await db.as(dave).rpc<unknown[]>('list_conversations');
    expect(list).toHaveLength(0);
    await db.as(bob).rpc('unblock_user', { p_user_id: dave });
    await db.as(dave).rpc('send_message', { p_conversation_id: conv, p_body: 'hello again' });
  });
});

describe('messaging', () => {
  it('conversations are unique per pair and unread counts clear on read', async () => {
    const c1 = await db.as(alice).rpc<string>('get_or_create_conversation', { p_other: bob });
    const c2 = await db.as(bob).rpc<string>('get_or_create_conversation', { p_other: alice });
    expect(c1).toBe(c2);
    await db.as(alice).rpc('send_message', { p_conversation_id: c1, p_body: 'one' });
    await db.as(alice).rpc('send_message', { p_conversation_id: c1, p_body: 'two' });
    const unread = async () => Number((await db.as(bob).rpc<{ messages: number }>('unread_counts')).messages);
    const before = await unread();
    const rows = await db.as(bob).rpc<Array<{ id: string; unread_count: number }>>('list_conversations');
    expect(rows.find((r) => r.id === c1)?.unread_count).toBe(2);
    await db.as(bob).rpc('mark_conversation_read', { p_conversation_id: c1 });
    expect(await unread()).toBe(before - 2);
  });

  it('rejects empty and oversized messages', async () => {
    const c = await db.as(alice).rpc<string>('get_or_create_conversation', { p_other: bob });
    await expectDbError(db.as(alice).rpc('send_message', { p_conversation_id: c, p_body: '   ' }), { status: 422 });
    await expectDbError(db.as(alice).rpc('send_message', { p_conversation_id: c, p_body: 'x'.repeat(2001) }), { status: 422 });
  });
});

describe('comments', () => {
  it('the admin switch hides comments from users but not staff', async () => {
    const post = await createPost(db, bob);
    const [{ value }] = await db.sql<{ value: boolean }>(`select value from public.app_settings where key = 'content.comments_enabled'`);
    expect(value).toBe(true); // enabled in beforeAll; ships off by default
    await setSetting(db, 'content.comments_enabled', false);
    try {
      await expectDbError(db.as(alice).rpc('add_comment', { p_post_id: post, p_body: 'hi' }), { status: 403, message: 'COMMENTS_DISABLED' });
      await db.as(admin).rpc('add_comment', { p_post_id: post, p_body: 'staff note' });
      const s = await db.as(alice).rpc<Record<string, unknown>>('public_settings');
      expect(s['content.comments_enabled']).toBe(false);
    } finally {
      await setSetting(db, 'content.comments_enabled', true);
    }
  });

  it('validates, counts and lets only the author, post owner or staff delete', async () => {
    const post = await createPost(db, bob);
    const c = await db.as(alice).rpc<{ id: string; can_delete: boolean }>('add_comment', { p_post_id: post, p_body: ' Great! ' });
    expect(c.can_delete).toBe(true);
    await expectDbError(db.as(alice).rpc('add_comment', { p_post_id: post, p_body: '' }), { status: 422 });
    const dave = await db.createUser('dave2@example.com');
    await expectDbError(db.as(dave).rpc('delete_comment', { p_comment_id: c.id }), { status: 403 });
    await db.as(bob).rpc('delete_comment', { p_comment_id: c.id });
    const [{ comments_count }] = await db.sql<{ comments_count: number }>(`select comments_count from public.posts where id = $1`, [post]);
    expect(comments_count).toBe(0);
    await expectDbError(db.as(bob).rpc('delete_comment', { p_comment_id: c.id }), { status: 404 });
  });

  it('comment spam is rate limited', async () => {
    const post = await createPost(db, bob);
    const spammer = await db.createUser('cspam@example.com');
    let limited = false;
    for (let i = 0; i < 15 && !limited; i++) {
      try {
        await db.as(spammer).rpc('add_comment', { p_post_id: post, p_body: `spam ${i}` });
      } catch (e) {
        expect((e as { status: number }).status).toBe(429);
        limited = true;
      }
    }
    expect(limited).toBe(true);
  });
});

describe('bookmarks', () => {
  it('one bookmark per user/post, listed in saved content', async () => {
    const post = await createPost(db, bob);
    expect(await db.as(alice).rpc('toggle_bookmark', { p_post_id: post })).toMatchObject({ bookmarked: true, bookmarks_count: 1 });
    expect(await db.as(alice).rpc('toggle_bookmark', { p_post_id: post })).toMatchObject({ bookmarked: false, bookmarks_count: 0 });
    await db.as(alice).rpc('toggle_bookmark', { p_post_id: post });
    const saved = await db.as(alice).rpc<Array<{ id: string; my_bookmarked: boolean }>>('my_bookmarks');
    expect(saved.find((s) => s.id === post)?.my_bookmarked).toBe(true);
  });
});

describe('reports', () => {
  it('resolves the reported user server-side and prevents duplicate open reports', async () => {
    const post = await createPost(db, bob);
    const id = await db.as(alice).rpc<string>('create_report', {
      p_target_type: 'post', p_target_id: post, p_reason: 'spam', p_description: 'Repeated promo',
    });
    const [r] = await db.sql<{ reported_user_id: string }>(`select reported_user_id from public.reports where id = $1`, [id]);
    expect(r.reported_user_id).toBe(bob);
    await expectDbError(db.as(alice).rpc('create_report', { p_target_type: 'post', p_target_id: post, p_reason: 'spam' }), {
      status: 409,
    });
    await expectDbError(db.as(alice).rpc('create_report', { p_target_type: 'post', p_target_id: post, p_reason: 'bogus' }), {
      status: 422,
    });
  });

  it('cannot report messages from conversations you are not part of', async () => {
    const c = await db.as(bob).rpc<string>('get_or_create_conversation', { p_other: admin });
    const m = await db.as(bob).rpc<{ id: string }>('send_message', { p_conversation_id: c, p_body: 'private' });
    await expectDbError(db.as(alice).rpc('create_report', { p_target_type: 'message', p_target_id: m.id, p_reason: 'spam' }), {
      status: 404,
    });
  });

  it('admin "remove content" removes the post, voids pending rewards and logs', async () => {
    const post = await createPost(db, bob);
    await db.sql(`insert into public.earnings (user_id, type, post_id, amount_paise, reference)
                  values ($1, 'viral', $2::uuid, 5000, 'viral:' || $2::text)`, [bob, post]);
    const id = await db.as(alice).rpc<string>('create_report', { p_target_type: 'post', p_target_id: post, p_reason: 'illegal' });
    await db.as(admin).rpc('admin_review_report', { p_report_id: id, p_action: 'remove_content', p_note: 'Confirmed illegal' });
    const [p] = await db.sql<{ status: string }>(`select status from public.posts where id = $1`, [post]);
    expect(p.status).toBe('removed');
    const [e] = await db.sql<{ status: string }>(`select status from public.earnings where post_id = $1`, [post]);
    expect(e.status).toBe('rejected');
    const actions = (await db.sql<{ action: string }>(`select action from public.admin_logs order by id`)).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['post.remove', 'report.remove_content']));
    // Removed content is no longer publicly visible.
    expect(await db.anon().rpc<unknown[]>('get_post', { p_post_id: post })).toHaveLength(0);
  });
});

describe('public visibility', () => {
  it('anonymous visitors can read published posts and profiles (for /post/:id)', async () => {
    const post = await createPost(db, bob, { caption: 'Public launch' });
    const [card] = await db.anon().rpc<Array<{ caption: string; my_hot: boolean }>>('get_post', { p_post_id: post });
    expect(card).toMatchObject({ caption: 'Public launch', my_hot: false });
  });

  it('pending-review complaints are only visible to their author and staff', async () => {
    const post = await createPost(db, bob, {
      category: 'public_complaint',
      complaint: {
        subcategory: 'civic_infrastructure', description: 'Streetlights on MG Road have been out for 3 weeks.',
        location: 'MG Road, Pune', legal_assistance_requested: false, forward_requested: true,
      },
    });
    expect(await db.anon().rpc<unknown[]>('get_post', { p_post_id: post })).toHaveLength(0);
    expect(await db.as(bob).rpc<unknown[]>('get_post', { p_post_id: post })).toHaveLength(1);
    await db.as(admin).rpc('admin_moderate_post', { p_post_id: post, p_action: 'approve' });
    const [card] = await db.anon().rpc<Array<{ complaint: { forward_status: string } }>>('get_post', { p_post_id: post });
    expect(card.complaint.forward_status).toBe('pending');
  });

  it('complaint posts require complaint details; other categories reject them', async () => {
    await expectDbError(createPost(db, bob, { category: 'public_complaint' }), { status: 422 });
    await expectDbError(createPost(db, bob, {
      complaint: { subcategory: 'other', description: 'x'.repeat(30), location: 'Pune' },
    }), { status: 422 });
  });

  it('treats an explicit JSON null complaint as "no complaint" (what clients send)', async () => {
    const id = await createPost(db, bob, { category: 'business_promotion', complaint: null });
    const [p] = await db.sql<{ status: string }>(`select status from public.posts where id = $1`, [id]);
    expect(p.status).toBe('published');
    expect(await db.sql(`select * from public.complaints where post_id = $1`, [id])).toHaveLength(0);
  });

  it('media paths outside the creator\'s folder are rejected', async () => {
    await expectDbError(createPost(db, bob, { media_path: `${alice}/stolen.mp4` }), { status: 422 });
  });
});
