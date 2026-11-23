-- ---------------------------------------------------------------------------
-- DEV-ONLY local emulator patch (never deployed).
--
-- The bundled supabase/migrations snapshot predates the current web client, which
-- sends extra profile fields (country, phone, address, interests) to update_profile
-- and complete_onboarding. This patch brings the embedded Postgres in line with that
-- client contract so local QA works. It is additive and idempotent; it does not change
-- product business rules. Applied by server.mjs after the real migrations, every boot.
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists interests text;
alter table public.profiles add column if not exists category_preferences jsonb;

-- get_me must surface the new fields (the client reads me.country, me.phone, ...).
create or replace function public.get_me() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
begin
  if v_uid is null then
    perform public._err(401, 'AUTH_REQUIRED', 'Please sign in to continue.');
  end if;
  select * into v_p from public.profiles where id = v_uid;
  if not found then
    perform public._err(401, 'PROFILE_MISSING', 'Your profile is not set up yet.');
  end if;
  return public._profile_json(v_p, v_uid) || jsonb_build_object(
    'role', v_p.role, 'status', v_p.status, 'status_reason', v_p.status_reason,
    'onboarded', v_p.onboarded, 'preferred_language', v_p.preferred_language,
    'referral_code', v_p.referral_code, 'referred', v_p.referred_by is not null,
    'email', (select email from auth.users where id = v_uid),
    'country', v_p.country, 'phone', v_p.phone, 'address', v_p.address, 'interests', v_p.interests,
    'category_preferences', v_p.category_preferences
  );
end $$;

-- get_profile surfaces the public-facing extra fields too (bio/phone/interests on the profile card).
create or replace function public.get_profile(p_handle text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles;
begin
  if p_handle ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_p from public.profiles where id = p_handle::uuid;
  else
    select * into v_p from public.profiles where username = lower(p_handle);
  end if;
  if not found
     or (v_p.status <> 'active' and not public.is_staff(v_uid) and v_p.id <> v_uid)
     or exists (select 1 from public.blocks where blocker_id = v_p.id and blocked_id = v_uid) then
    perform public._err(404, 'NOT_FOUND', 'This profile is not available.');
  end if;
  return public._profile_json(v_p, v_uid) || jsonb_build_object(
    'country', v_p.country, 'phone', v_p.phone, 'interests', v_p.interests,
    'address', case when v_p.id = v_uid then v_p.address else null end
  );
end $$;

-- Drop both the bundled signatures and any previously-patched ones (idempotent reboots).
drop function if exists public.update_profile(text, text, text, text, text);
drop function if exists public.update_profile(text, text, text, text, text, text, text, text, text);
drop function if exists public.complete_onboarding(text, text, text);
drop function if exists public.complete_onboarding(text, text, text, text, text, text, text);

create function public.update_profile(
  p_display_name text default null,
  p_bio text default null,
  p_username text default null,
  p_avatar_path text default null,
  p_preferred_language text default null,
  p_address text default null,
  p_phone text default null,
  p_interests text default null,
  p_country text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_username text := lower(btrim(p_username));
begin
  perform public._rate_limit('profile:' || v_uid, 20, 3600);
  if p_username is not null then
    if v_username !~ '^[a-z0-9_.]{3,24}$' then
      perform public._err(422, 'INVALID_USERNAME', 'Usernames are 3–24 characters: letters, numbers, _ or .');
    end if;
    if public._is_reserved_username(v_username) then
      perform public._err(422, 'USERNAME_RESERVED', 'That username is reserved.');
    end if;
    if exists (select 1 from public.profiles where username = v_username and id <> v_uid) then
      perform public._err(409, 'USERNAME_TAKEN', 'That username is already taken.');
    end if;
  end if;
  if p_avatar_path is not null and p_avatar_path !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]{1,120}$') then
    perform public._err(422, 'INVALID_AVATAR', 'Invalid avatar upload.');
  end if;
  if p_display_name is not null and char_length(btrim(p_display_name)) > 50 then
    perform public._err(422, 'INVALID_NAME', 'Names can be at most 50 characters.');
  end if;
  if p_bio is not null and char_length(p_bio) > 280 then
    perform public._err(422, 'INVALID_BIO', 'Bio can be at most 280 characters.');
  end if;

  update public.profiles set
    display_name = coalesce(btrim(p_display_name), display_name),
    bio = coalesce(p_bio, bio),
    username = coalesce(v_username, username),
    avatar_path = coalesce(p_avatar_path, avatar_path),
    preferred_language = coalesce(p_preferred_language, preferred_language),
    address = coalesce(nullif(btrim(p_address), ''), address),
    phone = coalesce(nullif(btrim(p_phone), ''), phone),
    interests = coalesce(nullif(btrim(p_interests), ''), interests),
    country = coalesce(nullif(btrim(p_country), ''), country)
  where id = v_uid;
  return public.get_me();
end $$;

create function public.complete_onboarding(
  p_username text,
  p_display_name text,
  p_referral_code text default null,
  p_country text default null,
  p_phone text default null,
  p_address text default null,
  p_bio text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_me public.profiles;
  v_referrer public.profiles;
begin
  perform public.update_profile(
    p_display_name => p_display_name, p_username => p_username,
    p_bio => p_bio, p_address => p_address, p_phone => p_phone, p_country => p_country
  );
  if char_length(btrim(coalesce(p_display_name, ''))) < 1 then
    perform public._err(422, 'INVALID_NAME', 'Please enter your name.');
  end if;

  select * into v_me from public.profiles where id = v_uid for update;
  if nullif(btrim(p_referral_code), '') is not null and v_me.referred_by is null then
    select * into v_referrer from public.profiles where referral_code = upper(btrim(p_referral_code));
    if not found or v_referrer.id = v_uid or v_referrer.status <> 'active' then
      perform public._err(422, 'INVALID_REFERRAL', 'That referral code is not valid.');
    end if;
    if v_me.created_at < now() - interval '7 days' then
      perform public._err(422, 'REFERRAL_WINDOW_CLOSED', 'Referral codes can only be used within 7 days of signup.');
    end if;
    update public.profiles set referred_by = v_referrer.id where id = v_uid;
    insert into public.earnings (user_id, type, amount_paise, status, reference, note)
    values (v_referrer.id, 'referral', public._setting_int('rewards.referral_paise', 1000), 'pending',
            'referral:' || v_uid, 'Referral: @' || v_me.username)
    on conflict (reference) do nothing;
  end if;

  update public.profiles set onboarded = true, last_active_at = now() where id = v_uid;
  return public.get_me();
end $$;

grant execute on function
  public.update_profile(text, text, text, text, text, text, text, text, text),
  public.complete_onboarding(text, text, text, text, text, text, text)
to authenticated;

-- Harmless no-op heartbeat the client polls; the bundled snapshot has no such function.
-- The client sends { seconds }, so the argument must be named "seconds".
drop function if exists public.weekly_usage_heartbeat(int);
create function public.weekly_usage_heartbeat(seconds int default 0) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('ok', true);
$$;
grant execute on function public.weekly_usage_heartbeat(int) to authenticated;

-- Home feed. The client sends p_seed and p_country which the snapshot's feed() lacks,
-- so re-create it accepting (and ignoring) those to keep the feed and eligibility checks working.
drop function if exists public.feed(text, int, int, timestamptz, text, text, text);
drop function if exists public.feed(text, text, int, int, timestamptz, text, text, text, text);
create function public.feed(
  p_mode text default 'for_you',
  p_seed text default null,
  p_limit int default 8,
  p_offset int default 0,
  p_before timestamptz default null,
  p_kind text default null,
  p_category text default null,
  p_language text default null,
  p_country text default null
) returns setof public.post_card
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := least(greatest(coalesce(p_limit, 8), 1), 30);
begin
  if p_mode = 'following' then
    if v_uid is null then
      perform public._err(401, 'AUTH_REQUIRED', 'Sign in to see creators you follow.');
    end if;
    return query
      select c.* from public._cards(v_uid) c
      where c.status = 'published'
        and c.author_id in (select followee_id from public.follows where follower_id = v_uid)
        and (p_before is null or c.created_at < p_before)
        and (p_kind is null or c.kind = p_kind)
        and (p_category is null or c.category = p_category)
        and (p_language is null or c.language = p_language)
      order by c.created_at desc, c.id
      limit v_limit;
  elsif p_mode = 'latest' then
    return query
      select c.* from public._cards(v_uid) c
      where c.status = 'published'
        and (p_before is null or c.created_at < p_before)
        and (p_kind is null or c.kind = p_kind)
        and (p_category is null or c.category = p_category)
        and (p_language is null or c.language = p_language)
      order by c.created_at desc, c.id
      limit v_limit;
  else
    return query
      select c.* from public._cards(v_uid) c
      where c.status = 'published'
        and (p_kind is null or c.kind = p_kind)
        and (p_category is null or c.category = p_category)
        and (p_language is null or c.language = p_language)
      order by
        (c.hot_count + 2 * c.speak_count + 3 * c.viral_count + c.comments_count + 1)::numeric
          / power(extract(epoch from (now() - c.created_at)) / 3600 + 2, 1.3) desc,
        c.created_at desc, c.id
      limit v_limit offset greatest(coalesce(p_offset, 0), 0);
  end if;
end $$;
grant execute on function public.feed(text, text, int, int, timestamptz, text, text, text, text) to anon, authenticated;

-- Weekly One Chance leaderboard. The bundled snapshot predates this feature, so the
-- emulator returns an empty-but-valid board (the web UI then shows its demo leaderboard).
create or replace function public.one_chance_leaderboard(
  p_period text default 'weekly', p_anchor text default null, p_limit int default 100
) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'period', coalesce(p_period, 'weekly'),
    'start', to_char(date_trunc('week', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'end', to_char(date_trunc('week', now()) + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'closed', false,
    'timezone', 'Asia/Kolkata',
    'entries', '[]'::jsonb
  );
$$;
grant execute on function public.one_chance_leaderboard(text, text, int) to anon, authenticated;

-- Category preferences (the client gates the feed behind this; snapshot predates it).
drop function if exists public.save_category_preferences(jsonb, boolean);
create function public.save_category_preferences(p_selected jsonb default '[]'::jsonb, p_show_all boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  update public.profiles
     set category_preferences = jsonb_build_object('selected', coalesce(p_selected, '[]'::jsonb), 'show_all', coalesce(p_show_all, false))
   where id = v_uid;
  return public.get_me();
end $$;
grant execute on function public.save_category_preferences(jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Group chat (One Chance Leaders) — mirrors the production hostinger contract:
-- a single open community room every signed-in user can read and post to. The
-- bundled snapshot is 1:1-only, so add group columns, policies and group-aware RPCs.
-- ---------------------------------------------------------------------------
alter table public.conversations add column if not exists is_group boolean not null default false;
alter table public.conversations add column if not exists name text;
alter table public.conversations alter column user_a drop not null;
alter table public.conversations alter column user_b drop not null;

drop policy if exists conversations_group on public.conversations;
create policy conversations_group on public.conversations for select to authenticated using (is_group);
drop policy if exists messages_group on public.messages;
create policy messages_group on public.messages for select to authenticated using (
  exists (select 1 from public.conversations c where c.id = conversation_id and c.is_group)
);

create or replace function public.join_one_chance_chat() returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid := '0a11c0de-0000-4000-8000-000000000001';
begin
  perform public._require_user();
  insert into public.conversations (id, is_group, name, last_message_at, last_message_preview)
  values (v_id, true, 'One Chance Leaders', now(), 'Welcome to the One Chance community chat.')
  on conflict (id) do nothing;
  return v_id;
end $$;
grant execute on function public.join_one_chance_chat() to authenticated;

drop function if exists public.one_chance_members(uuid, int);
create function public.one_chance_members(p_conversation_id uuid, p_limit int default 100)
returns setof jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public._profile_json(p, auth.uid())
  from public.profiles p
  where p.status = 'active'
    and (p.id = auth.uid()
         or exists (select 1 from public.messages m where m.conversation_id = p_conversation_id and m.sender_id = p.id))
  order by (p.id = auth.uid()) desc, p.display_name
  limit least(greatest(p_limit, 1), 200);
$$;
grant execute on function public.one_chance_members(uuid, int) to authenticated;

drop function if exists public.profiles_by_ids(uuid[]);
create function public.profiles_by_ids(p_ids uuid[]) returns setof jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public._profile_json(p, auth.uid())
  from public.profiles p
  where p.id = any(coalesce(p_ids, '{}'::uuid[]));
$$;
grant execute on function public.profiles_by_ids(uuid[]) to anon, authenticated;

create or replace function public.get_conversation(p_conversation_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_conv public.conversations;
  v_other public.profiles;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found or (not v_conv.is_group and v_uid not in (v_conv.user_a, v_conv.user_b)) then
    perform public._err(404, 'NOT_FOUND', 'Conversation not found.');
  end if;
  if v_conv.is_group then
    return jsonb_build_object(
      'id', v_conv.id, 'is_group', true, 'group_name', coalesce(v_conv.name, 'One Chance Leaders'),
      'can_message', true,
      'member_count', (select count(distinct m.sender_id) from public.messages m where m.conversation_id = v_conv.id),
      'other', jsonb_build_object(
        'id', v_conv.id, 'username', 'onechance_leaders', 'display_name', coalesce(v_conv.name, 'One Chance Leaders'),
        'avatar_path', null, 'is_verified', true, 'bio', 'Weekly One Chance community',
        'created_at', v_conv.created_at, 'followers_count', 0, 'following_count', 0, 'posts_count', 0,
        'is_me', false, 'is_following', false, 'follows_me', false, 'blocked_by_me', false,
        'has_viral_badge', false, 'is_premium', false
      ));
  end if;
  select * into v_other from public.profiles
  where id = case when v_conv.user_a = v_uid then v_conv.user_b else v_conv.user_a end;
  return jsonb_build_object('id', v_conv.id, 'is_group', false, 'other', public._profile_json(v_other, v_uid),
                            'can_message', not public._is_blocked(v_uid, v_other.id) and v_other.status = 'active');
end $$;

create or replace function public.send_message(p_conversation_id uuid, p_body text) returns public.messages
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_conv public.conversations;
  v_other uuid;
  v_msg public.messages;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform public._assert_not_maintenance();
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    perform public._err(422, 'INVALID_MESSAGE', 'Messages must be 1-2000 characters.');
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if not found or (not v_conv.is_group and v_uid not in (v_conv.user_a, v_conv.user_b)) then
    perform public._err(404, 'NOT_FOUND', 'Conversation not found.');
  end if;
  perform public._rate_limit('msg:' || v_uid, 60, 60);
  insert into public.messages (conversation_id, sender_id, body) values (p_conversation_id, v_uid, v_body)
  returning * into v_msg;
  update public.conversations set last_message_at = v_msg.created_at, last_message_preview = left(v_body, 120)
  where id = p_conversation_id;
  if not v_conv.is_group then
    v_other := case when v_conv.user_a = v_uid then v_conv.user_b else v_conv.user_a end;
    if public._is_blocked(v_uid, v_other) then
      perform public._err(403, 'BLOCKED', 'You cannot message this user.');
    end if;
    if not exists (select 1 from public.notifications
                   where user_id = v_other and type = 'message' and actor_id = v_uid and read_at is null) then
      perform public._notify(v_other, 'message', v_uid, null,
        'New message from @' || (select username from public.profiles where id = v_uid),
        left(v_body, 120), '/messages/' || p_conversation_id);
    end if;
  end if;
  return v_msg;
end $$;

create or replace function public.mark_conversation_read(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user(); v_group boolean;
begin
  select is_group into v_group from public.conversations where id = p_conversation_id;
  if v_group is null then perform public._err(404, 'NOT_FOUND', 'Conversation not found.'); end if;
  if v_group then return; end if;
  if not exists (select 1 from public.conversations where id = p_conversation_id and v_uid in (user_a, user_b)) then
    perform public._err(404, 'NOT_FOUND', 'Conversation not found.');
  end if;
  update public.messages set read_at = now()
  where conversation_id = p_conversation_id and sender_id <> v_uid and read_at is null;
  update public.notifications set read_at = now()
  where user_id = v_uid and type = 'message' and read_at is null and link = '/messages/' || p_conversation_id;
end $$;

drop function if exists public.list_conversations(int, int);
create function public.list_conversations(p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, is_group boolean, other_id uuid, other_username text, other_display_name text, other_avatar_path text,
  other_verified boolean, last_message_at timestamptz, last_message_preview text, unread_count int,
  is_blocked boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  return query
    select c.id, true, c.id, 'onechance_leaders'::text, coalesce(c.name, 'One Chance Leaders'),
           null::text, true, c.last_message_at, c.last_message_preview, 0, false
    from public.conversations c
    where c.is_group and c.last_message_at is not null
    union all
    select c.id, false, o.id, o.username, o.display_name, o.avatar_path, o.is_verified,
           c.last_message_at, c.last_message_preview,
           (select count(*)::int from public.messages m
             where m.conversation_id = c.id and m.sender_id <> v_uid and m.read_at is null),
           public._is_blocked(v_uid, o.id)
    from public.conversations c
    join public.profiles o on o.id = case when c.user_a = v_uid then c.user_b else c.user_a end
    where not c.is_group and v_uid in (c.user_a, c.user_b)
      and c.last_message_at is not null
      and not exists (select 1 from public.blocks where blocker_id = o.id and blocked_id = v_uid)
    order by last_message_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;
grant execute on function public.list_conversations(int, int) to authenticated;

-- DEV-ONLY: seed a few demo posts for the current user so the feed renders locally.
create or replace function public.dev_seed_demo_feed() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user(); v_n int := 0;
begin
  insert into public.posts (author_id, kind, media_path, thumbnail_path, mime_type, size_bytes, width, height, caption, category, language, is_viral, created_at)
  values
    (v_uid,'poster',v_uid||'/demo-1.jpg',v_uid||'/demo-1.jpg','image/jpeg',120000,1080,1350,'Golden hour on the rooftop — chasing light before it fades.','entertainment','en',true, now() - interval '20 minutes'),
    (v_uid,'poster',v_uid||'/demo-2.jpg',v_uid||'/demo-2.jpg','image/jpeg',110000,1080,1350,'Weekend street food tour. Save this for later!','entertainment','en',false, now() - interval '2 hours'),
    (v_uid,'poster',v_uid||'/demo-3.jpg',v_uid||'/demo-3.jpg','image/jpeg',130000,1080,1350,'Hiring part-time editors — DM to apply.','part_time_jobs','en',false, now() - interval '1 day')
  on conflict (media_path) do nothing;
  get diagnostics v_n = row_count;
  update public.profiles set posts_count = (select count(*) from public.posts where author_id = v_uid and status='published') where id = v_uid;
  return v_n;
end $$;
grant execute on function public.dev_seed_demo_feed() to authenticated;

-- ---------------------------------------------------------------------------
-- DEV-ONLY: message reactions for the premium group chat. Real toggle + counts.
-- ---------------------------------------------------------------------------
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 12),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.message_reactions enable row level security;
grant select on public.message_reactions to authenticated;
drop policy if exists mr_read on public.message_reactions;
create policy mr_read on public.message_reactions for select to authenticated using (
  exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
          where m.id = message_id and (c.is_group or auth.uid() in (c.user_a, c.user_b)))
);

drop function if exists public.toggle_message_reaction(uuid, text);
create function public.toggle_message_reaction(p_message_id uuid, p_emoji text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user(); v_ok boolean; v_removed boolean := false;
begin
  select exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
                 where m.id = p_message_id and (c.is_group or v_uid in (c.user_a, c.user_b))) into v_ok;
  if not v_ok then perform public._err(404, 'NOT_FOUND', 'Message not found.'); end if;
  if char_length(btrim(coalesce(p_emoji, ''))) < 1 then perform public._err(422, 'INVALID', 'Pick an emoji.'); end if;
  delete from public.message_reactions where message_id = p_message_id and user_id = v_uid and emoji = p_emoji;
  if found then v_removed := true; else
    insert into public.message_reactions(message_id, user_id, emoji) values (p_message_id, v_uid, p_emoji) on conflict do nothing;
  end if;
  return jsonb_build_object('message_id', p_message_id, 'emoji', p_emoji,
    'count', (select count(*) from public.message_reactions where message_id = p_message_id and emoji = p_emoji),
    'mine', not v_removed);
end $$;
grant execute on function public.toggle_message_reaction(uuid, text) to authenticated;

drop function if exists public.list_reactions(uuid);
create function public.list_reactions(p_conversation_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('message_id', r.message_id, 'emoji', r.emoji, 'count', r.cnt, 'mine', r.mine)), '[]'::jsonb)
  from (
    select mr.message_id, mr.emoji, count(*) as cnt, bool_or(mr.user_id = auth.uid()) as mine
    from public.message_reactions mr
    join public.messages m on m.id = mr.message_id
    where m.conversation_id = p_conversation_id
    group by mr.message_id, mr.emoji
  ) r;
$$;
grant execute on function public.list_reactions(uuid) to authenticated;
