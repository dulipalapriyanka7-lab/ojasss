// Domain API modules. One function per backend capability; no URLs or table names leak
// into components. Both web and the Android app (which loads this web app) use these.
import { supabase } from '@/lib/supabase';
import { fromPostgrest, invoke, rpc } from './client';
import type {
  Announcement, Authority, Comment, ConversationSummary, CtaType, EarningPoint, Earning, EngagementKind,
  EngagementState, Me, Message, AppNotification, PayoutDetail, PostCard, PostKind, Category, Profile,
  PublicSettings, ReportReason, ReportTarget, Wallet, Withdrawal, StatusStory,
} from './types';

export * from './types';
export { ApiError, friendly } from './client';

type Page = { limit?: number; offset?: number };

// ---------------------------------------------------------------- posts / feed
export const posts = {
  feed: (p: { mode: 'for_you' | 'following' | 'latest'; seed?:string; limit?: number; offset?: number; before?: string | null;
    kind?: PostKind | null; category?: Category | null; language?: string | null; country?: string | null; city?: string | null }) =>
    rpc<PostCard[]>('feed', {
      p_city: p.city ?? null,
      p_seed:p.seed??null, p_mode: p.mode, p_limit: p.limit ?? 8, p_offset: p.offset ?? 0, p_before: p.before ?? null,
      p_kind: p.kind ?? null, p_category: p.category ?? null, p_language: p.language ?? null,
      p_country: p.country ?? null,
    }),
  trending: (p: { kind?: PostKind | null; category?: Category | null; language?: string | null; country?:string|null; days?: number } & Page) =>
    rpc<PostCard[]>('trending_posts', {
      p_kind: p.kind ?? null, p_category: p.category ?? null, p_language: p.language ?? null,
      p_country:p.country??null, p_days: p.days ?? 7, p_limit: p.limit ?? 20, p_offset: p.offset ?? 0,
    }),
  get: async (id: string) => (await rpc<PostCard[]>('get_post', { p_post_id: id }))[0] ?? null,
  byUser: (userId: string, kind: PostKind | null, page: Page & { viralOnly?: boolean } = {}) =>
    rpc<PostCard[]>('user_posts', { p_user_id: userId, p_kind: kind, p_limit: page.limit ?? 24, p_offset: page.offset ?? 0, p_viral_only: page.viralOnly ?? false }),
  search: (q: string, p: { kind?: PostKind | null; category?: Category | null; language?: string | null } & Page = {}) =>
    rpc<PostCard[]>('search_posts', {
      p_q: q, p_kind: p.kind ?? null, p_category: p.category ?? null, p_language: p.language ?? null,
      p_limit: p.limit ?? 20, p_offset: p.offset ?? 0,
    }),
  update: (id: string, patch: { caption?: string; location?: string; language?: string }) =>
    rpc<PostCard[]>('update_post', { p_post_id: id, p_caption: patch.caption ?? null, p_location: patch.location ?? null, p_language: patch.language ?? null }),
  remove: (id: string) => rpc<void>('delete_post', { p_post_id: id }),
  recordView: (id: string) => rpc<void>('record_view', { p_post_id: id }),
  recordShare: (id: string) => rpc<{shares_count:number;viral_eligible:boolean;is_viral:boolean}>('record_share', { p_post_id: id }),
  ctaClick: (id: string) => rpc<{ url: string; kind: CtaType['target_kind'] }>('record_cta_click', { p_post_id: id }),
  series: (id:string) => rpc<{series_id:string;title:string;genre:string;total:number|null;episodes:Array<{id:string;episode_number:number;thumbnail_path:string|null;caption:string;title:string;access:'free'|'interest'|'premium';watched:boolean;locked:boolean;lock_reason:string|null;interest_count:number;interest_goal:number;interest_percent:number;interested:boolean}>;interest_count:number;interested:boolean;is_creator:boolean}>('series_details',{p_post_id:id}),
  completeEpisode: (id:string) => rpc<{watched:boolean;next_episode:number}>('complete_episode',{p_post_id:id}),
  toggleSeriesInterest: (seriesId:string) => rpc<{interested:boolean;interest_count:number}>('toggle_series_interest',{p_series_id:seriesId}),
  toggleEpisodeInterest: (id:string) => rpc<{interested:boolean;interest_count:number;interest_goal:number;interest_percent:number}>('toggle_episode_interest',{p_post_id:id}),
};

// ---------------------------------------------------------------- engagements
export const engagements = {
  toggle: (postId: string, kind: EngagementKind) =>
    rpc<EngagementState>('toggle_engagement', { p_post_id: postId, p_kind: kind }),
};

// ---------------------------------------------------------------- comments
export const comments = {
  list: (postId: string, before: string | null = null, limit = 20, parentId: string | null = null) =>
    rpc<Comment[]>('list_comments', { p_post_id: postId, p_cursor: before, p_limit: limit, p_parent_id: parentId }),
  add: (postId: string, body: string, parentId: string | null = null, language='en',extras?:{mediaPath?:string|null;replyToId?:string|null}) => rpc<Comment>('add_comment', { p_post_id: postId, p_body: body, p_parent_id: parentId, p_language:language,p_media_path:extras?.mediaPath??null,p_reply_to_id:extras?.replyToId??null }),
  remove: (id: string) => rpc<{removed_count:number}>('delete_comment', { p_comment_id: id }),
  fire: (id:string) => rpc<Comment>('toggle_comment_fire',{p_comment_id:id}),
  edit: (id:string,body:string)=>rpc<Comment>('update_comment',{p_comment_id:id,p_body:body}),
  pin: (id:string)=>rpc<Comment>('pin_comment',{p_comment_id:id}),
};

// ---------------------------------------------------------------- users / follows / blocks / bookmarks
export const users = {
  me: () => rpc<Me>('get_me'),
  get: (handle: string) => rpc<Profile>('get_profile', { p_handle: handle }),
  search: (q: string, page: Page = {}) => rpc<Profile[]>('search_users', { p_q: q, p_limit: page.limit ?? 20, p_offset: page.offset ?? 0 }),
  popular: (limit = 12) => rpc<Profile[]>('popular_creators', { p_limit: limit }),
  update: (p: { displayName?: string; bio?: string; phone?: string; address?:string; interests?: string; country?:string; username?: string; avatarPath?: string; language?: string }) =>
    rpc<Me>('update_profile', {
      p_display_name: p.displayName ?? null, p_bio: p.bio ?? null, p_username: p.username ?? null,
      p_avatar_path: p.avatarPath ?? null, p_preferred_language: p.language ?? null,
      p_address:p.address??null, p_phone: p.phone ?? null, p_interests: p.interests ?? null,
      p_country: p.country ?? null,
    }),
  completeOnboarding: (username: string, displayName: string, referralCode?: string, country?:string, details?:{phone:string;address:string;bio:string}) =>
    rpc<Me>('complete_onboarding', { p_username: username, p_display_name: displayName, p_referral_code: referralCode || null, p_country:country??null,p_phone:details?.phone??null,p_address:details?.address??null,p_bio:details?.bio??null }),
  touchPresence: () => rpc<void>('touch_presence'),
};

export const statuses = {
  list: (page: Page = {}) => rpc<StatusStory[]>('list_statuses', { p_limit: page.limit ?? 40, p_offset: page.offset ?? 0 }),
  toggleHot: (statusId: string) => rpc<{ my_hot: boolean; hot_count: number }>('toggle_status_hot', { p_status_id: statusId }),
  update: (statusId: string, caption: string) => rpc<StatusStory>('update_status', { p_status_id: statusId, p_caption: caption }),
  remove: (statusId: string) => rpc<{ deleted: boolean }>('delete_status', { p_status_id: statusId }),
  create: (p: { mediaPath: string; caption: string; visibility: 'public' | 'followers' }) =>
    invoke<StatusStory>('create-status', { mediaPath: p.mediaPath, caption: p.caption, visibility: p.visibility }),
};

export const follows = {
  toggle: (userId: string) => rpc<{ following: boolean; followers_count: number }>('toggle_follow', { p_user_id: userId }),
  list: (userId: string, direction: 'followers' | 'following', page: Page = {}) =>
    rpc<Profile[]>('list_follows', { p_user_id: userId, p_direction: direction, p_limit: page.limit ?? 30, p_offset: page.offset ?? 0 }),
};

export const blocks = {
  block: (userId: string) => rpc<void>('block_user', { p_user_id: userId }),
  unblock: (userId: string) => rpc<void>('unblock_user', { p_user_id: userId }),
  list: () => rpc<Array<{ id: string; username: string; display_name: string; avatar_path: string | null; blocked_at: string }>>('my_blocks'),
};

export const bookmarks = {
  toggle: (postId: string) => rpc<{ bookmarked: boolean; bookmarks_count: number }>('toggle_bookmark', { p_post_id: postId }),
  list: (page: Page = {}) => rpc<PostCard[]>('my_bookmarks', { p_limit: page.limit ?? 24, p_offset: page.offset ?? 0 }),
};

export const reports = {
  create: (targetType: ReportTarget, targetId: string, reason: ReportReason, description: string) =>
    rpc<string>('create_report', { p_target_type: targetType, p_target_id: targetId, p_reason: reason, p_description: description }),
};

// ---------------------------------------------------------------- messaging
export const messages = {
  conversations: (page: Page = {}) => rpc<ConversationSummary[]>('list_conversations', { p_limit: page.limit ?? 30, p_offset: page.offset ?? 0 }),
  conversation: (id: string) => rpc<{ id: string; other: Profile; can_message: boolean; is_group?:boolean; group_name?:string }>('get_conversation', { p_conversation_id: id }),
  joinOneChanceChat: () => rpc<string>('join_one_chance_chat'),
  open: (otherUserId: string) => rpc<string>('get_or_create_conversation', { p_other: otherUserId }),
  send: (conversationId: string, body: string) => rpc<Message>('send_message', { p_conversation_id: conversationId, p_body: body }),
  markRead: (conversationId: string) => rpc<void>('mark_conversation_read', { p_conversation_id: conversationId }),
  /** Messages are read directly from the table; RLS restricts rows to participants. */
  history: async (conversationId: string, before: string | null, limit = 40): Promise<Message[]> => {
    let q = supabase.from('messages').select('id, conversation_id, sender_id, body, created_at, read_at')
      .eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit);
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q;
    if (error) throw fromPostgrest(error);
    return (data ?? []) as Message[];
  },
};

// ---------------------------------------------------------------- notifications
export const notifications = {
  list: (before: string | null = null, unreadOnly = false, limit = 30) =>
    rpc<AppNotification[]>('list_notifications', { p_before: before, p_limit: limit, p_unread_only: unreadOnly }),
  markRead: (ids: string[] | null) => rpc<number>('mark_notifications_read', { p_ids: ids }),
  unreadCounts: () => rpc<{ notifications: number; messages: number }>('unread_counts'),
  registerPushToken: (token: string, platform: 'android' | 'web') =>
    rpc<void>('register_push_token', { p_token: token, p_platform: platform }),
};

// ---------------------------------------------------------------- earnings / withdrawals
export const earnings = {
  wallet: () => rpc<Wallet>('get_wallet'),
  list: (page: Page & { type?: string | null } = {}) =>
    rpc<Earning[]>('list_my_earnings', { p_limit: page.limit ?? 30, p_offset: page.offset ?? 0, p_type: page.type ?? null }),
  series: (bucket: 'day' | 'week' | 'month', periods: number) =>
    rpc<EarningPoint[]>('earnings_series', { p_bucket: bucket, p_periods: periods }),
};

export const withdrawals = {
  list: (page: Page = {}) => rpc<Withdrawal[]>('list_my_withdrawals', { p_limit: page.limit ?? 30, p_offset: page.offset ?? 0 }),
  request: (amountPaise: number, idempotencyKey: string) =>
    rpc<{ id: string; status: string; amount_paise: number; replayed: boolean }>('request_withdrawal', {
      p_amount_paise: amountPaise, p_idempotency_key: idempotencyKey,
    }),
  cancel: (id: string) => rpc<void>('cancel_withdrawal', { p_withdrawal_id: id }),
  payoutDetail: () => rpc<PayoutDetail | null>('get_my_payout_detail'),
  savePayoutDetail: (d: { method: 'upi' | 'bank'; upiId?: string; accountHolderName?: string; accountNumber?: string; ifsc?: string; bankName?: string }) =>
    rpc<PayoutDetail>('upsert_payout_detail', {
      p_method: d.method, p_upi_id: d.upiId ?? null, p_account_holder_name: d.accountHolderName ?? null,
      p_account_number: d.accountNumber ?? null, p_ifsc: d.ifsc ?? null, p_bank_name: d.bankName ?? null,
    }),
};

// ---------------------------------------------------------------- reference data
export const reference = {
  settings: () => rpc<PublicSettings>('public_settings'),
  authorities: () => rpc<Authority[]>('list_authorities'),
  announcements: () => rpc<Announcement[]>('active_announcements'),
  ctaTypes: async (): Promise<CtaType[]> => {
    const { data, error } = await supabase.from('cta_types')
      .select('id, label, icon, target_kind, reward_eligible, sort_order').order('sort_order');
    if (error) throw fromPostgrest(error);
    return (data ?? []) as CtaType[];
  },
};

// ---------------------------------------------------------------- business / complaints / deletion
export const inquiries = {
  submit: (p: { type: string; businessName: string; contactName: string; phone: string; email: string; message: string }) =>
    rpc<string>('submit_business_inquiry', {
      p_type: p.type, p_business_name: p.businessName, p_contact_name: p.contactName,
      p_phone: p.phone, p_email: p.email, p_message: p.message,
    }),
  mine: () => rpc<Array<{ id: string; type: string; business_name: string; status: string; created_at: string }>>('my_business_inquiries'),
};

export const deletion = {
  /** createAccountDeletionRequest — step 1: send an 8-digit code. */
  start: (email: string, reason: string | null, source: 'web' | 'android') =>
    invoke<{ ok: true; verificationId: string; expiresInMinutes: number }>('create-account-deletion-request', { email, reason, source }),
  /** verifyAccountDeletionOtp — step 2: confirm the code; records the request. */
  verify: (verificationId: string, email: string, code: string) =>
    invoke<{ ok: true; message: string }>('verify-account-deletion-otp', { verificationId, email, code }),
  /** Signed-in shortcut: the session already proves ownership of the email. */
  requestSignedIn: (reason: string | null, source: 'in_app' | 'android' | 'web') =>
    rpc<string>('request_my_account_deletion', { p_reason: reason, p_source: source }),
};

export const complaints = {
  /** sendComplaintEmail — staff only; recipient is resolved on the server. */
  forward: (postId: string) => invoke<{ ok: true; forwardStatus: string }>('send-complaint-email', { postId }),
};
