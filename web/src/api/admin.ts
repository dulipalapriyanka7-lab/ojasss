// Admin API. The UI hides admin screens from non-admins, but every one of these calls is
// authorized server-side against profiles.role — the UI check is only for UX.
import { rpc } from './client';
import type { Announcement, Uuid } from './types';

type Page = { limit?: number; offset?: number };
const page = (p: Page = {}) => ({ p_limit: p.limit ?? 25, p_offset: p.offset ?? 0 });

export interface Dashboard {
  total_users: number; active_users: number; new_users: number; suspended_users: number;
  videos: number; posters: number; new_posts: number; pending_review: number;
  complaints_open: number; complaints_total: number; reports_open: number; child_safety_open: number;
  pending_withdrawals: number; pending_withdrawals_paise: number; pending_earnings: number;
  total_earnings_paise: number; range_earnings_paise: number; paid_out_paise: number;
  engagements: number; viral_posts: number; cta_clicks: number; deletion_requests_open: number;
}

export type Metric =
  | 'users' | 'active_users' | 'posts' | 'videos' | 'posters' | 'engagements' | 'viral' | 'earnings_paise'
  | 'withdrawals_paise' | 'cta_clicks' | 'reports' | 'complaints';

export interface AdminUserRow {
  competition_rank?:number|null;viral_videos?:number;one_chance_videos?:number;
  id: Uuid; username: string; display_name: string; email: string | null; avatar_path: string | null;
  role: 'user' | 'moderator' | 'admin'; status: 'active' | 'suspended' | 'banned'; is_verified: boolean;
  followers_count: number; posts_count: number; created_at: string; last_active_at: string | null;
  open_reports: number; approved_paise: number; paid_paise: number; available_paise: number; total_count: number;
}

export interface AdminPostRow {
  series_id?:string|null; series_title?:string|null; episode_number?:number|null; episode_total?:number|null;
  content_origin?: 'copy_paste' | 'new_content' | null;
  id: Uuid; kind: 'video' | 'poster'; author_id: Uuid; author_username: string; thumbnail_path: string | null;
  media_path: string; caption: string; category: string; language: string; status: string;
  moderation_reason: string | null; views_count: number; hot_count: number; speak_count: number; viral_count: number;
  is_viral: boolean; open_reports: number; created_at: string; total_count: number;
}

export interface AdminComplaintRow {
  post_id: Uuid; caption: string; author_username: string; subcategory: string; location: string;
  authority_name: string | null; forward_requested: boolean; forward_status: string; forwarded_at: string | null;
  legal_assistance_requested: boolean; status: string; post_status: string; created_at: string; total_count: number;
}

export interface AdminReportRow {
  id: Uuid; reporter_username: string | null; reported_user_id: Uuid | null; reported_username: string | null;
  target_type: string; target_id: Uuid; target_preview: string | null; reason: string; description: string;
  status: string; admin_action: string | null; admin_note: string | null; reviewed_by_username: string | null;
  reviewed_at: string | null; created_at: string; total_count: number;
}

export interface AdminEarningRow {
  id: Uuid; user_id: Uuid | null; username: string | null; type: string; post_id: Uuid | null; post_caption: string | null;
  amount_paise: number; status: string; reference: string; note: string | null; reviewed_by_username: string | null;
  reviewed_at: string | null; created_at: string; user_open_reports: number; total_count: number;
}

export interface AdminWithdrawalRow {
  id: Uuid; user_id: Uuid | null; username: string | null; email: string | null; amount_paise: number; status: string;
  payout_method: 'upi' | 'bank';
  payout_snapshot: { method: string; upi_id?: string | null; account_holder_name?: string | null; account_number?: string | null; ifsc?: string | null; bank_name?: string | null };
  available_paise: number; admin_note: string | null; payment_reference: string | null; processed_by_username: string | null;
  processed_at: string | null; paid_at: string | null; created_at: string; total_count: number;
}

export interface AppSetting {
  key: string; value: number | boolean | string | string[]; description: string; is_public: boolean; is_dangerous: boolean;
  updated_by: Uuid | null; updated_at: string;
}

export interface AdminDeletionRow {
  id: Uuid; user_id: Uuid | null; username: string | null; email: string; reason: string | null; source: string;
  status: string; admin_note: string | null; processed_by_username: string | null; processed_at: string | null;
  created_at: string; total_count: number;
}

export interface AdminLogRow {
  id: number; admin_id: Uuid | null; admin_username: string | null; action: string; target_type: string;
  target_id: string | null; previous_state: Record<string, unknown> | null; new_state: Record<string, unknown> | null;
  reason: string | null; ip: string | null; created_at: string; total_count: number;
}

export interface AdminInquiryRow {
  id: Uuid; username: string | null; type: string; business_name: string; contact_name: string; phone: string;
  email: string; message: string; status: string; admin_note: string | null; created_at: string; total_count: number;
}

export interface AuthorityRow {
  id: Uuid; name: string; department: string; jurisdiction: string; email: string; is_active: boolean;
}

export interface StorageUsage {
  uploads_bytes: number; buckets: Array<{ bucket: string; bytes: number; files: number }>;
  temp_bytes: number; temp: Array<{ key: string; label: string; bytes: number; count: number }>;
  game_bytes: number; plan_bytes: number; disk_free_bytes: number;
  compression: { available: boolean; waiting: number; over_mb: number; target_mb: number }; checked_at: string;
}

export const admin = {
  storageUsage: () => rpc<StorageUsage>('admin_storage_usage', {}),
  storageCleanup: () => rpc<{ freed_bytes: number; removed: number; usage: StorageUsage }>('admin_storage_cleanup', { p_confirm: true }),
  storagePlan: (gb: number) => rpc<StorageUsage>('admin_storage_plan', { p_plan_gb: gb }),
  dashboard: (from: string, to: string) => rpc<Dashboard>('admin_dashboard', { p_from: from, p_to: to }),
  timeseries: (metric: Metric, from: string, to: string, bucket: 'hour' | 'day' | 'week' | 'month') =>
    rpc<Array<{ bucket_start: string; value: number }>>('admin_timeseries', { p_metric: metric, p_from: from, p_to: to, p_bucket: bucket }),
  breakdowns: (from: string, to: string) => rpc<Record<string, Record<string, number> | Array<Record<string, unknown>>>>(
    'admin_breakdowns', { p_from: from, p_to: to }),

  users: (f: { q?: string; status?: string | null; role?: string | null } & Page) =>
    rpc<AdminUserRow[]>('admin_list_users', { p_q: f.q || null, p_status: f.status ?? null, p_role: f.role ?? null, ...page(f) }),
  userDetail: (id: Uuid) => rpc<Record<string, unknown>>('admin_user_detail', { p_user_id: id }),
  /** manageUsers */
  manageUser: (id: Uuid, action: string, reason?: string, role?: string) =>
    rpc<unknown>('admin_manage_user', { p_user_id: id, p_action: action, p_reason: reason ?? null, p_role: role ?? null }),

  posts: (f: { kind?: string | null; status?: string | null; category?: string | null; q?: string } & Page) =>
    rpc<AdminPostRow[]>('admin_list_posts', {
      p_kind: f.kind ?? null, p_status: f.status ?? null, p_category: f.category ?? null, p_q: f.q || null, ...page(f),
    }),
  seriesInterest:(seriesId:string)=>rpc<{count:number;members:Array<{id:string;username:string;display_name:string;avatar_path:string|null}>}>('admin_series_interest',{p_series_id:seriesId}),
  deleteMedia: (id:Uuid,reason:string,confirmation:string)=>rpc<{id:Uuid;deleted:boolean}>('admin_delete_media',{p_post_id:id,p_reason:reason,p_confirmation:confirmation,p_confirm:true}),
  moderatePost: (id: Uuid, action: 'approve' | 'remove' | 'restore' | 'flag', reason?: string) =>
    rpc<unknown>('admin_moderate_post', { p_post_id: id, p_action: action, p_reason: reason ?? null }),

  complaints: (f: { status?: string | null; forwardStatus?: string | null; q?: string } & Page) =>
    rpc<AdminComplaintRow[]>('admin_list_complaints', { p_status: f.status ?? null, p_forward_status: f.forwardStatus ?? null, p_q: f.q || null, ...page(f) }),
  complaintDetail: (postId: Uuid) => rpc<Record<string, unknown>>('admin_complaint_detail', { p_post_id: postId }),
  updateComplaint: (postId: Uuid, action: string, opts: { note?: string; authorityId?: string; response?: string } = {}) =>
    rpc<unknown>('admin_update_complaint', {
      p_post_id: postId, p_action: action, p_note: opts.note ?? null, p_authority_id: opts.authorityId ?? null, p_response: opts.response ?? null,
    }),
  addComplaintNote: (postId: Uuid, note: string) => rpc<void>('admin_add_complaint_note', { p_post_id: postId, p_note: note }),
  authorities: () => rpc<AuthorityRow[]>('admin_list_authorities'),
  upsertAuthority: (a: Partial<AuthorityRow> & { name: string; email: string }) =>
    rpc<Uuid>('admin_upsert_authority', {
      p_id: a.id ?? null, p_name: a.name, p_department: a.department ?? '', p_jurisdiction: a.jurisdiction ?? '',
      p_email: a.email, p_is_active: a.is_active ?? true,
    }),

  reports: (f: { status?: string | null; targetType?: string | null; reason?: string | null } & Page) =>
    rpc<AdminReportRow[]>('admin_list_reports', { p_status: f.status ?? null, p_target_type: f.targetType ?? null, p_reason: f.reason ?? null, ...page(f) }),
  reviewReport: (id: Uuid, action: string, note?: string) =>
    rpc<unknown>('admin_review_report', { p_report_id: id, p_action: action, p_note: note ?? null }),
  safety: () => rpc<Record<string, unknown>>('admin_safety_overview'),

  earnings: (f: { status?: string | null; type?: string | null; userId?: string | null } & Page) =>
    rpc<AdminEarningRow[]>('admin_list_earnings', { p_status: f.status ?? null, p_type: f.type ?? null, p_user_id: f.userId ?? null, ...page(f) }),
  /** approveReward */
  reviewEarning: (id: Uuid, approve: boolean, reason?: string) =>
    rpc<unknown>('admin_review_earning', { p_earning_id: id, p_approve: approve, p_reason: reason ?? null }),
  reverseEarning: (id: Uuid, reason: string) => rpc<unknown>('admin_reverse_earning', { p_earning_id: id, p_reason: reason }),
  competitionPrizeWeeks: () => rpc<{ id: string; end: string }[]>('admin_competition_prize_weeks'),
  grantBonus: (userId: Uuid, amountPaise: number, reason: string, competitionId?: string) =>
    rpc<Uuid>('admin_grant_bonus', { p_user_id: userId, p_amount_paise: amountPaise, p_reason: reason, p_competition_id: competitionId }),

  withdrawals: (f: { status?: string | null } & Page) =>
    rpc<AdminWithdrawalRow[]>('admin_list_withdrawals', { p_status: f.status ?? null, ...page(f) }),
  /** processWithdrawal */
  processWithdrawal: (id: Uuid, action: 'approve' | 'reject' | 'mark_paid', note?: string, paymentReference?: string) =>
    rpc<unknown>('admin_process_withdrawal', {
      p_withdrawal_id: id, p_action: action, p_note: note ?? null, p_payment_reference: paymentReference ?? null,
    }),
  withdrawalEvents: (id: Uuid) =>
    rpc<Array<{ from_status: string | null; to_status: string; note: string | null; created_at: string; actor_username: string | null }>>(
      'admin_withdrawal_events', { p_withdrawal_id: id }),

  settings: () => rpc<AppSetting[]>('admin_list_settings'),
  oneChanceMoveToWeek: (postId: string, reason: string) => rpc<{ post_id: string; viral_at: string }>('admin_one_chance_move_to_week', { p_post_id: postId, p_reason: reason }),
  updateSetting: (key: string, value: unknown, reason: string, confirm: boolean) =>
    rpc<AppSetting>('admin_update_setting', { p_key: key, p_value: value, p_reason: reason || null, p_confirm: confirm }),

  announcements: () => rpc<Announcement[]>('admin_list_announcements'),
  upsertAnnouncement: (a: {
    id?: Uuid | null; title: string; message: string; imageUrl?: string | null; ctaLabel?: string | null; ctaUrl?: string | null;
    startsAt?: string | null; endsAt?: string | null; isActive?: boolean; notify?: boolean;
  }) =>
    rpc<Uuid>('admin_upsert_announcement', {
      p_id: a.id ?? null, p_title: a.title, p_message: a.message, p_image_url: a.imageUrl ?? null,
      p_cta_label: a.ctaLabel ?? null, p_cta_url: a.ctaUrl ?? null, p_starts_at: a.startsAt ?? new Date().toISOString(),
      p_ends_at: a.endsAt ?? null, p_is_active: a.isActive ?? true, p_notify: a.notify ?? false,
    }),

  deletionRequests: (f: { status?: string | null } & Page) =>
    rpc<AdminDeletionRow[]>('admin_list_deletion_requests', { p_status: f.status ?? null, ...page(f) }),
  processDeletion: (id: Uuid, action: 'processing' | 'complete' | 'reject', note?: string) =>
    rpc<unknown>('admin_process_deletion_request', { p_request_id: id, p_action: action, p_note: note ?? null }),

  inquiries: (f: { status?: string | null; type?: string | null } & Page) =>
    rpc<AdminInquiryRow[]>('admin_list_inquiries', { p_status: f.status ?? null, p_type: f.type ?? null, ...page(f) }),
  updateInquiry: (id: Uuid, status: string, note?: string) =>
    rpc<void>('admin_update_inquiry', { p_id: id, p_status: status, p_note: note ?? null }),

  logs: (f: { action?: string | null; targetType?: string | null } & Page) =>
    rpc<AdminLogRow[]>('admin_list_logs', { p_action: f.action || null, p_target_type: f.targetType ?? null, p_admin_id: null, ...page({ limit: f.limit ?? 50, offset: f.offset }) }),
};
