-- OJASSS — core schema
-- Single source of truth for web + Android. All writes go through SECURITY DEFINER
-- functions (see later migrations); clients never write tables directly.

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table public.app_settings (
  key          text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  value        jsonb not null,
  description  text not null default '',
  is_public    boolean not null default false,
  is_dangerous boolean not null default false,
  updated_by   uuid,
  updated_at   timestamptz not null default now()
);

create table public.cta_types (
  id              text primary key check (id ~ '^[a-z_]{2,32}$'),
  label           text not null,
  icon            text not null default 'link',
  target_kind     text not null check (target_kind in ('url', 'phone', 'whatsapp', 'email')),
  reward_eligible boolean not null default false,
  is_active       boolean not null default true,
  sort_order      int not null default 0
);

create table public.authorities (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 160),
  department   text not null default '' check (char_length(department) <= 160),
  jurisdiction text not null default '' check (char_length(jurisdiction) <= 160),
  -- Recipient address is server-only: never selectable by clients.
  email        text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  username         text not null unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name     text not null default '' check (char_length(display_name) <= 50),
  bio              text not null default '' check (char_length(bio) <= 280),
  avatar_path      text check (avatar_path is null or char_length(avatar_path) <= 300),
  role             text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  status           text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  status_reason    text,
  is_verified      boolean not null default false,
  onboarded        boolean not null default false,
  preferred_language text not null default 'en' check (preferred_language ~ '^[a-z]{2,3}$'),
  referral_code    text not null unique,
  referred_by      uuid references public.profiles (id) on delete set null,
  followers_count  int not null default 0 check (followers_count >= 0),
  following_count  int not null default 0 check (following_count >= 0),
  posts_count      int not null default 0 check (posts_count >= 0),
  last_active_at   timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index profiles_created_idx on public.profiles (created_at desc);
create index profiles_username_pattern_idx on public.profiles (username text_pattern_ops);

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id, created_at desc);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

-- ---------------------------------------------------------------------------
-- Content: videos and posters share one table (kind), complaints extend posts.
-- ---------------------------------------------------------------------------

create table public.posts (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references public.profiles (id) on delete cascade,
  kind             text not null check (kind in ('video', 'poster')),
  media_path       text not null unique,
  thumbnail_path   text,
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes > 0),
  width            int check (width is null or width > 0),
  height           int check (height is null or height > 0),
  duration_ms      int check (duration_ms is null or duration_ms >= 0),
  caption          text not null default '' check (char_length(caption) <= 2200),
  category         text not null check (category in
                     ('entertainment', 'business_promotion', 'public_complaint', 'news', 'part_time_jobs')),
  language         text not null default 'en' check (language ~ '^[a-z]{2,3}$'),
  location         text check (location is null or char_length(location) <= 120),
  cta_type         text references public.cta_types (id),
  cta_url          text check (cta_url is null or char_length(cta_url) <= 500),
  cta_label        text check (cta_label is null or char_length(cta_label) <= 40),
  status           text not null default 'published' check (status in
                     ('pending_review', 'published', 'flagged', 'removed', 'deleted')),
  moderation_reason text,
  hot_count        int not null default 0 check (hot_count >= 0),
  speak_count      int not null default 0 check (speak_count >= 0),
  viral_count      int not null default 0 check (viral_count >= 0),
  comments_count   int not null default 0 check (comments_count >= 0),
  bookmarks_count  int not null default 0 check (bookmarks_count >= 0),
  shares_count     int not null default 0 check (shares_count >= 0),
  cta_clicks_count int not null default 0 check (cta_clicks_count >= 0),
  views_count      bigint not null default 0 check (views_count >= 0),
  is_viral         boolean not null default false,
  viral_at         timestamptz,
  search_vector    tsvector generated always as (to_tsvector('simple', coalesce(caption, ''))) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((cta_type is null) = (cta_url is null))
);
create index posts_feed_idx on public.posts (status, created_at desc, id);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_category_idx on public.posts (category, status, created_at desc);
create index posts_search_idx on public.posts using gin (search_vector);

create table public.complaints (
  post_id           uuid primary key references public.posts (id) on delete cascade,
  subcategory       text not null check (subcategory in
                      ('civic_infrastructure', 'corruption', 'consumer_rights', 'public_safety',
                       'health', 'education', 'environment', 'other')),
  description       text not null check (char_length(description) between 20 and 5000),
  location          text not null check (char_length(location) between 3 and 200),
  legal_assistance_requested boolean not null default false,
  forward_requested boolean not null default false,
  authority_id      uuid references public.authorities (id) on delete set null,
  forward_status    text not null default 'not_requested' check (forward_status in
                      ('not_requested', 'pending', 'forwarded', 'failed')),
  forwarded_at      timestamptz,
  forward_attempts  int not null default 0,
  last_forward_error text,
  status            text not null default 'submitted' check (status in
                      ('submitted', 'under_review', 'forwarded', 'resolved', 'rejected')),
  authority_response text check (authority_response is null or char_length(authority_response) <= 5000),
  authority_responded_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index complaints_status_idx on public.complaints (status, created_at desc);

create table public.complaint_notes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.complaints (post_id) on delete cascade,
  admin_id   uuid references public.profiles (id) on delete set null,
  note       text not null check (char_length(note) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Engagement. Exactly one row per (user, post); HOT/SPEAK/VIRAL are flags on it.
-- ---------------------------------------------------------------------------

create table public.engagements (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  hot        boolean not null default false,
  speak      boolean not null default false,
  viral      boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index engagements_post_idx on public.engagements (post_id);
create index engagements_created_idx on public.engagements (created_at);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 1000),
  status     text not null default 'visible' check (status in ('visible', 'removed', 'deleted')),
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at desc);

create table public.bookmarks (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index bookmarks_user_idx on public.bookmarks (user_id, created_at desc);

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid references public.profiles (id) on delete set null,
  target_type      text not null check (target_type in ('post', 'comment', 'user', 'message')),
  target_id        uuid not null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  reason           text not null check (reason in
                     ('spam', 'harassment', 'illegal', 'copyright', 'misinformation',
                      'adult', 'violence', 'child_safety', 'other')),
  description      text not null default '' check (char_length(description) <= 1000),
  status           text not null default 'pending' check (status in
                     ('pending', 'under_review', 'resolved', 'rejected')),
  admin_action     text,
  admin_note       text,
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);
create unique index reports_open_unique on public.reports (reporter_id, target_type, target_id)
  where status in ('pending', 'under_review');
create index reports_status_idx on public.reports (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------

create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  user_a               uuid not null references public.profiles (id) on delete cascade,
  user_b               uuid not null references public.profiles (id) on delete cascade,
  last_message_at      timestamptz,
  last_message_preview text,
  created_at           timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index conversations_b_idx on public.conversations (user_b);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_unread_idx on public.messages (conversation_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Notifications / announcements / push
-- ---------------------------------------------------------------------------

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in
               ('follow', 'comment', 'engagement', 'message', 'reward', 'withdrawal',
                'announcement', 'system', 'complaint', 'moderation')),
  actor_id   uuid references public.profiles (id) on delete set null,
  post_id    uuid references public.posts (id) on delete cascade,
  title      text not null,
  body       text not null default '',
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 2 and 120),
  message    text not null check (char_length(message) between 2 and 2000),
  image_url  text check (image_url is null or image_url ~ '^https://'),
  cta_label  text check (cta_label is null or char_length(cta_label) <= 40),
  cta_url    text check (cta_url is null or cta_url ~ '^(https://|/)'),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  is_active  boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.push_tokens (
  token      text primary key check (char_length(token) between 10 and 4096),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('android', 'web')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Money. Amounts are integer paise (INR/100) — never floats.
-- Financial records survive account deletion (user_id set null) for audit.
-- ---------------------------------------------------------------------------

create table public.earnings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete set null,
  type         text not null check (type in ('viral', 'cta_click', 'bonus', 'referral')),
  post_id      uuid references public.posts (id) on delete set null,
  amount_paise bigint not null check (amount_paise > 0),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'reversed')),
  -- Idempotency key: 'viral:<post>', 'cta:<post>:<user>', 'referral:<user>', 'bonus:<uuid>'
  reference    text not null unique,
  note         text,
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index earnings_user_idx on public.earnings (user_id, created_at desc);
create index earnings_status_idx on public.earnings (status, created_at desc);

create table public.payout_details (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  method              text not null check (method in ('upi', 'bank')),
  upi_id              text check (upi_id is null or upi_id ~ '^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$'),
  account_holder_name text check (account_holder_name is null or char_length(account_holder_name) between 2 and 100),
  account_number      text check (account_number is null or account_number ~ '^[0-9]{9,18}$'),
  ifsc                text check (ifsc is null or ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name           text check (bank_name is null or char_length(bank_name) <= 100),
  updated_at          timestamptz not null default now(),
  check (
    (method = 'upi' and upi_id is not null)
    or (method = 'bank' and account_holder_name is not null and account_number is not null and ifsc is not null)
  )
);

create table public.withdrawals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles (id) on delete set null,
  amount_paise      bigint not null check (amount_paise > 0),
  status            text not null default 'requested' check (status in
                      ('requested', 'approved', 'rejected', 'paid', 'cancelled')),
  payout_method     text not null check (payout_method in ('upi', 'bank')),
  payout_masked     text not null,
  payout_snapshot   jsonb not null,  -- full details, admin-only column
  idempotency_key   text not null check (char_length(idempotency_key) between 8 and 80),
  admin_note        text,
  payment_reference text,
  processed_by      uuid references public.profiles (id) on delete set null,
  processed_at      timestamptz,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create unique index withdrawals_one_open on public.withdrawals (user_id) where status in ('requested', 'approved');
create index withdrawals_status_idx on public.withdrawals (status, created_at desc);

create table public.withdrawal_events (
  id            bigint generated always as identity primary key,
  withdrawal_id uuid not null references public.withdrawals (id) on delete cascade,
  from_status   text,
  to_status     text not null,
  actor_id      uuid references public.profiles (id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);

create table public.cta_clicks (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid references public.profiles (id) on delete set null,
  rewarded   boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index cta_clicks_rewarded_once on public.cta_clicks (post_id, user_id) where rewarded;
create index cta_clicks_post_idx on public.cta_clicks (post_id, created_at);

create table public.business_inquiries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles (id) on delete set null,
  type          text not null check (type in ('gst_consultant', 'investor', 'business_promotion', 'other')),
  business_name text not null check (char_length(business_name) between 2 and 120),
  contact_name  text not null check (char_length(contact_name) between 2 and 80),
  phone         text not null check (phone ~ '^\+?[0-9 ]{8,16}$'),
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message       text not null check (char_length(message) between 10 and 3000),
  status        text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  admin_note    text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audit, deletion, rate limits
-- ---------------------------------------------------------------------------

create table public.admin_logs (
  id             bigint generated always as identity primary key,
  admin_id       uuid references public.profiles (id) on delete set null,
  action         text not null,
  target_type    text not null,
  target_id      text,
  previous_state jsonb,
  new_state      jsonb,
  reason         text,
  ip             text,
  created_at     timestamptz not null default now()
);
create index admin_logs_created_idx on public.admin_logs (created_at desc);
create index admin_logs_target_idx on public.admin_logs (target_type, target_id);

create table public.account_deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete set null,
  email        text not null,
  reason       text check (reason is null or char_length(reason) <= 1000),
  source       text not null default 'web' check (source in ('web', 'android', 'in_app')),
  status       text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'rejected')),
  admin_note   text,
  processed_by uuid references public.profiles (id) on delete set null,
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);

create table public.deletion_verifications (
  id          uuid primary key default gen_random_uuid(),
  email_hash  text not null,          -- HMAC(secret, normalized email); plaintext never stored here
  code_hmac   text not null,          -- HMAC(secret, id|email|code); plaintext OTP never stored
  user_id     uuid,                   -- null when no account matches (response is identical)
  email       text,                   -- only kept when an account matches, to record the request
  reason      text,
  source      text not null default 'web',
  attempts    int not null default 0,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index deletion_verifications_email_idx on public.deletion_verifications (email_hash, created_at desc);

create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hits         int not null
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger posts_touch before update on public.posts for each row execute function public.touch_updated_at();
create trigger complaints_touch before update on public.complaints for each row execute function public.touch_updated_at();
create trigger engagements_touch before update on public.engagements for each row execute function public.touch_updated_at();
create trigger announcements_touch before update on public.announcements for each row execute function public.touch_updated_at();
create trigger authorities_touch before update on public.authorities for each row execute function public.touch_updated_at();

-- Audit history is append-only for everyone, including admins.
create function public.forbid_mutation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'AUDIT_IMMUTABLE' using errcode = 'PT403', detail = 'Audit records cannot be modified.';
end $$;

create trigger admin_logs_immutable before update or delete on public.admin_logs
  for each row execute function public.forbid_mutation();
create trigger withdrawal_events_immutable before update or delete on public.withdrawal_events
  for each row execute function public.forbid_mutation();
