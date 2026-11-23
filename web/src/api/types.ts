import type { HomeControl } from '@/lib/homeControls';
// Types mirroring the database API (supabase/migrations). Keep in sync with SQL.

export type Uuid = string;
export type Iso = string;

export type PostKind = 'video' | 'poster';
export type Category = 'technology' | 'education' | 'gaming' | 'lifestyle' | 'one_chance' | 'horror_stories' | 'music_dance' | 'world_education' | 'entertainment' | 'business_promotion' | 'public_complaint' | 'news' | 'part_time_jobs' | 'full_time_jobs';
export type PostStatus = 'pending_review' | 'published' | 'flagged' | 'removed' | 'deleted';
export type EngagementKind = 'hot' | 'speak' | 'viral';
export type Role = 'user' | 'moderator' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'banned';

export interface ComplaintInfo {
  subcategory: string;
  description: string;
  location: string;
  legal_assistance_requested: boolean;
  forward_requested: boolean;
  authority_name: string | null;
  forward_status: 'not_requested' | 'pending' | 'forwarded' | 'failed';
  forwarded_at: Iso | null;
  status: 'submitted' | 'under_review' | 'forwarded' | 'resolved' | 'rejected';
  authority_response: string | null;
  authority_responded_at: Iso | null;
}

export interface PostCard {
  series_id?: string | null;
  series_title?: string | null;
  series_genre?: string | null;
  episode_number?: number | null;
  episode_total?: number | null;
  episode_title?: string | null;
  episode_access?: 'free' | 'interest' | 'premium' | null;
  episode_watched?: boolean;
  votes_count?:number;my_voted?:boolean;
  source_category?:Category;viral_at?:Iso|null;author_premium?:boolean;premium_until?:Iso|null;
  hashtags?: string[];
  visibility?: 'public' | 'followers' | 'private';
  audio_title?: string | null;
  repost_source?: string | null;
  content_origin?: 'copy_paste' | 'new_content' | null;
  country?: string | null;
  expires_at?: Iso | null;
  id: Uuid;
  kind: PostKind;
  author_id: Uuid;
  author_username: string;
  author_display_name: string;
  author_avatar_path: string | null;
  author_verified: boolean;
  author_status_post_id?: Uuid | null;
  author_status_expires_at?: Iso | null;
  media_path: string;
  thumbnail_path: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  caption: string;
  category: Category;
  language: string;
  location: string | null;
  cta_type: string | null;
  cta_label: string | null;
  cta_url?: string | null;
  has_cta: boolean;
  status: PostStatus;
  hot_count: number;
  speak_count: number;
  viral_count: number;
  comments_count: number;
  bookmarks_count: number;
  shares_count: number;
  views_count: number;
  is_viral: boolean;
  viral_eligible: boolean;
  one_chance_ready?: boolean;
  one_chance_available_at?: Iso | null;
  one_chance_voting_until?: Iso | null;
  /** Votes are locked until this time (48 h after Viral, or at once when the creator pays). */
  one_chance_voting_opens_at?: Iso | null;
  one_chance_voting_renewal_paise?: number | null;
  one_chance_unlock_at?: string | null;
  created_at: Iso;
  my_hot: boolean;
  my_speak: boolean;
  my_viral: boolean;
  my_bookmarked: boolean;
  my_following: boolean;
  complaint: ComplaintInfo | null;
}

export interface EngagementState {
  category?:Category;viral_at?:Iso|null;
  post_id: Uuid;
  my_hot: boolean;
  my_speak: boolean;
  my_viral: boolean;
  hot_count: number;
  speak_count: number;
  viral_count: number;
  is_viral: boolean;
  viral_eligible: boolean;
  one_chance_ready?: boolean;
  one_chance_available_at?: Iso | null;
}

export interface Profile {
  is_premium?:boolean;premium_until?:Iso|null;
  status_post_id?: Uuid | null;
  status_expires_at?: Iso | null;
  phone?: string;
  interests?: string;
  id: Uuid;
  username: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  is_verified: boolean;
  followers_count: number;
  following_count: number;
  posts_count: number;
  created_at: Iso;
  is_me: boolean;
  is_following: boolean;
  follows_me: boolean;
  blocked_by_me: boolean;
  has_viral_badge: boolean;
}

export interface StatusStory {
  id: Uuid;
  user_id: Uuid;
  media_path: string;
  mime_type: string;
  caption: string;
  visibility: 'public' | 'followers';
  created_at: Iso;
  expires_at: Iso;
  profile: Profile;
  hot_count: number;
  my_hot: boolean;
}

export interface Me extends Profile {
  address?:string;
  country?: string | null;
  role: Role;
  status: AccountStatus;
  status_reason: string | null;
  category_preferences?:{selected:Category[];show_all:boolean}|null;
  city?: string | null;
  onboarded: boolean;
  preferred_language: string;
  referral_code: string;
  referred: boolean;
  email: string | null;
}

export interface Comment {
  id: Uuid;
  post_id: Uuid;
  body: string;
  created_at: Iso;
  can_delete: boolean;
  parent_id: string | null;
  fire_count: number;
  my_fire: boolean;
  reply_count: number;
  language: string;
  can_edit?: boolean;
  can_pin?: boolean;
  pinned_at?: string | null;
  edited_at?: string | null;
  reply_to_id?: string | null;
  attachment?: {path:string;mime_type:string;size:number}|null;
  author: { id: Uuid; username: string; display_name: string; avatar_path: string | null; is_verified: boolean };
}

export interface ConversationSummary {
  id: Uuid;
  other_id: Uuid;
  other_username: string;
  other_display_name: string;
  other_avatar_path: string | null;
  other_verified: boolean;
  last_message_at: Iso;
  last_message_preview: string | null;
  unread_count: number;
  is_blocked: boolean;
  is_group?: boolean;
}

export interface Message {
  id: Uuid;
  conversation_id: Uuid;
  sender_id: Uuid;
  body: string;
  created_at: Iso;
  read_at: Iso | null;
}

export type NotificationType =
  | 'follow' | 'new_post' | 'comment' | 'engagement' | 'message' | 'reward' | 'withdrawal'
  | 'announcement' | 'system' | 'complaint' | 'moderation' | 'episode_unlock';

export interface AppNotification {
  id: Uuid;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  post_id: Uuid | null;
  read_at: Iso | null;
  created_at: Iso;
  actor: { id: Uuid; username: string; display_name: string; avatar_path: string | null } | null;
  post_thumbnail_path: string | null;
  image_url?: string | null;
  category?: string;
}

export interface Announcement {
  id: Uuid;
  title: string;
  message: string;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  starts_at: Iso;
  ends_at: Iso | null;
  is_active: boolean;
  created_at: Iso;
}

export interface Wallet {
  available_paise: number;
  pending_paise: number;
  lifetime_paise: number;
  withdrawn_paise: number;
  in_process_paise: number;
  this_month_paise: number;
  min_withdrawal_paise: number;
  max_withdrawal_paise: number;
}

export type EarningType = 'viral' | 'cta_click' | 'bonus' | 'referral';
export type EarningStatus = 'pending' | 'approved' | 'rejected' | 'reversed';

export interface Earning {
  id: Uuid;
  type: EarningType;
  amount_paise: number;
  status: EarningStatus;
  reference: string;
  note: string | null;
  created_at: Iso;
  reviewed_at: Iso | null;
  post: { id: Uuid; caption: string; thumbnail_path: string | null; kind: PostKind } | null;
}

export interface EarningPoint {
  bucket_start: string;
  approved_paise: number;
  pending_paise: number;
}

export type WithdrawalStatus = 'requested' | 'approved' | 'rejected' | 'paid' | 'cancelled';

export interface Withdrawal {
  id: Uuid;
  amount_paise: number;
  status: WithdrawalStatus;
  payout_method: 'upi' | 'bank';
  payout_masked: string;
  payment_reference: string | null;
  note: string | null;
  created_at: Iso;
  processed_at: Iso | null;
  paid_at: Iso | null;
}

export interface PayoutDetail {
  method: 'upi' | 'bank';
  masked: string;
  account_holder_name: string | null;
  updated_at: Iso;
}

export interface CtaType {
  id: string;
  label: string;
  icon: string;
  target_kind: 'url' | 'phone' | 'whatsapp' | 'email';
  reward_eligible: boolean;
  sort_order: number;
}

export interface Authority {
  id: Uuid;
  name: string;
  department: string;
  jurisdiction: string;
}

export type ReportReason =
  | 'spam' | 'harassment' | 'illegal' | 'copyright' | 'misinformation' | 'adult' | 'violence' | 'child_safety' | 'other';
export type ReportTarget = 'post' | 'comment' | 'user' | 'message';

export type PublicSettings = Partial<{
  'feed.reveal_footer_on_unmute':boolean;
  'one_chance.wait_hours':number;
  'one_chance.entry_paise':number;
  'one_chance.free_wait_enabled':boolean;
  'one_chance.category_access'?: { entry: Category[]; voting: Category[] };
  'categories.config': Partial<Record<Category,{label:string;description:string;enabled:boolean;deleted:boolean}>>;
  'home.controls': Partial<Record<HomeControl,boolean>>;
  'layout.category_order': string[];
  'layout.action_order': string[];
  'engagement.hot_threshold': number;
  'engagement.share_threshold': number;
  'engagement.speak_threshold': number;
  'engagement.viral_threshold': number;
  'rewards.viral_paise': number;
  'rewards.cta_click_paise': number;
  'rewards.referral_paise': number;
  'withdrawals.min_paise': number;
  'withdrawals.max_paise': number;
  'platform.maintenance_mode': boolean;
  'uploads.max_video_mb': number;
  'uploads.max_image_mb': number;
  'uploads.max_video_seconds': number;
  'episodes.max_per_series': number;
  'content.complaints_require_review': boolean;
  'content.comments_enabled': boolean;
}>;
