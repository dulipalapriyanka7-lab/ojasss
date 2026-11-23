-- OJASSS — content, feed, engagement and social graph API.

-- ---------------------------------------------------------------------------
-- Post card: the one shape both clients render.
-- ---------------------------------------------------------------------------

create type public.post_card as (
  id                  uuid,
  kind                text,
  author_id           uuid,
  author_username     text,
  author_display_name text,
  author_avatar_path  text,
  author_verified     boolean,
  media_path          text,
  thumbnail_path      text,
  mime_type           text,
  width               int,
  height              int,
  duration_ms         int,
  caption             text,
  category            text,
  language            text,
  location            text,
  cta_type            text,
  cta_label           text,
  has_cta             boolean,
  status              text,
  hot_count           int,
  speak_count         int,
  viral_count         int,
  comments_count      int,
  bookmarks_count     int,
  shares_count        int,
  views_count         bigint,
  is_viral            boolean,
  viral_eligible      boolean,
  created_at          timestamptz,
  my_hot              boolean,
  my_speak            boolean,
  my_viral            boolean,
  my_bookmarked       boolean,
  my_following        boolean,
  complaint           jsonb
);

-- Visible posts for a viewer: published (or own / staff), author active, no block either way.
-- Note: cta_url is intentionally NOT exposed; CTA clicks resolve via record_cta_click().
create function public._cards(p_viewer uuid) returns setof public.post_card
language sql stable security definer set search_path = public, pg_temp as $$
  select
    p.id, p.kind, p.author_id, a.username, a.display_name, a.avatar_path, a.is_verified,
    p.media_path, p.thumbnail_path, p.mime_type, p.width, p.height, p.duration_ms,
    p.caption, p.category, p.language, p.location,
    p.cta_type, coalesce(p.cta_label, ct.label), p.cta_type is not null,
    p.status, p.hot_count, p.speak_count, p.viral_count, p.comments_count,
    p.bookmarks_count, p.shares_count, p.views_count, p.is_viral,
    (p.hot_count >= public._setting_int('engagement.hot_threshold', 100)
      and p.speak_count >= public._setting_int('engagement.speak_threshold', 50)),
    p.created_at,
    coalesce(e.hot, false), coalesce(e.speak, false), coalesce(e.viral, false),
    (b.user_id is not null), (f.follower_id is not null),
    case when c.post_id is null then null else jsonb_build_object(
      'subcategory', c.subcategory,
      'description', c.description,
      'location', c.location,
      'legal_assistance_requested', c.legal_assistance_requested,
      'forward_requested', c.forward_requested,
      'authority_name', au.name,
      'forward_status', c.forward_status,
      'forwarded_at', c.forwarded_at,
      'status', c.status,
      'authority_response', c.authority_response,
      'authority_responded_at', c.authority_responded_at
    ) end
  from public.posts p
  join public.profiles a on a.id = p.author_id
  left join public.cta_types ct on ct.id = p.cta_type
  left join public.engagements e on e.post_id = p.id and e.user_id = p_viewer
  left join public.bookmarks b on b.post_id = p.id and b.user_id = p_viewer
  left join public.follows f on f.followee_id = p.author_id and f.follower_id = p_viewer
  left join public.complaints c on c.post_id = p.id
  left join public.authorities au on au.id = c.authority_id
  where (
      (p.status = 'published' and a.status = 'active')
      or (p_viewer is not null and p.author_id = p_viewer and p.status <> 'deleted')
      or (p.status <> 'deleted' and public.is_staff(p_viewer))
    )
    and (p_viewer is null or not exists (
      select 1 from public.blocks bl
      where (bl.blocker_id = p_viewer and bl.blocked_id = p.author_id)
         or (bl.blocker_id = p.author_id and bl.blocked_id = p_viewer)
    ))
$$;

-- Home feed.
--   for_you   : engagement-weighted with time decay, offset pagination
--   following : chronological from followed creators, keyset pagination (p_before)
--   latest    : chronological, keyset pagination
create function public.feed(
  p_mode text default 'for_you',
  p_limit int default 8,
  p_offset int default 0,
  p_before timestamptz default null,
  p_kind text default null,
  p_category text default null,
  p_language text default null
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

-- Trending: engagement within a recent window.
create function public.trending_posts(
  p_kind text default null, p_category text default null, p_language text default null,
  p_days int default 7, p_limit int default 20, p_offset int default 0
) returns setof public.post_card
language sql stable security definer set search_path = public, pg_temp as $$
  select c.* from public._cards(auth.uid()) c
  where c.status = 'published'
    and c.created_at > now() - make_interval(days => least(greatest(p_days, 1), 90))
    and (p_kind is null or c.kind = p_kind)
    and (p_category is null or c.category = p_category)
    and (p_language is null or c.language = p_language)
  order by (c.hot_count + 2 * c.speak_count + 3 * c.viral_count + c.comments_count + c.shares_count) desc,
           c.views_count desc, c.created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

create function public.get_post(p_post_id uuid) returns setof public.post_card
language sql stable security definer set search_path = public, pg_temp as $$
  select c.* from public._cards(auth.uid()) c where c.id = p_post_id
$$;

create function public.user_posts(
  p_user_id uuid, p_kind text default null, p_limit int default 24, p_offset int default 0
) returns setof public.post_card
language sql stable security definer set search_path = public, pg_temp as $$
  select c.* from public._cards(auth.uid()) c
  where c.author_id = p_user_id and (p_kind is null or c.kind = p_kind)
  order by c.created_at desc, c.id
  limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0)
$$;

create function public.my_bookmarks(p_limit int default 24, p_offset int default 0)
returns setof public.post_card
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  return query
    select c.* from public._cards(v_uid) c
    join public.bookmarks b on b.post_id = c.id and b.user_id = v_uid
    where c.status = 'published'
    order by b.created_at desc
    limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
end $$;

create function public.search_posts(
  p_q text, p_kind text default null, p_category text default null, p_language text default null,
  p_limit int default 20, p_offset int default 0
) returns setof public.post_card
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := left(btrim(coalesce(p_q, '')), 100);
begin
  if char_length(v_q) < 2 then
    return;
  end if;
  return query
    select c.* from public._cards(auth.uid()) c
    join public.posts p on p.id = c.id
    where c.status = 'published'
      and (p.search_vector @@ websearch_to_tsquery('simple', v_q)
           or p.caption ilike '%' || replace(replace(v_q, '%', '\%'), '_', '\_') || '%'
           or c.author_username ilike replace(replace(v_q, '%', '\%'), '_', '\_') || '%')
      and (p_kind is null or c.kind = p_kind)
      and (p_category is null or c.category = p_category)
      and (p_language is null or c.language = p_language)
    order by (c.hot_count + c.speak_count + c.viral_count) desc, c.created_at desc
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create function public._profile_json(p public.profiles, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name, 'bio', p.bio,
    'avatar_path', p.avatar_path, 'is_verified', p.is_verified,
    'followers_count', p.followers_count, 'following_count', p.following_count,
    'posts_count', p.posts_count, 'created_at', p.created_at,
    'is_me', p.id = p_viewer,
    'is_following', exists (select 1 from public.follows where follower_id = p_viewer and followee_id = p.id),
    'follows_me', exists (select 1 from public.follows where follower_id = p.id and followee_id = p_viewer),
    'blocked_by_me', exists (select 1 from public.blocks where blocker_id = p_viewer and blocked_id = p.id),
    'has_viral_badge', exists (select 1 from public.posts where author_id = p.id and is_viral and status = 'published')
  )
$$;

-- Own profile, including private fields (role, status, onboarding, referral code).
create function public.get_me() returns jsonb
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
    'email', (select email from auth.users where id = v_uid)
  );
end $$;

-- p_handle: a username or a user id.
create function public.get_profile(p_handle text) returns jsonb
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
  -- Hidden: missing, banned/suspended (except to staff), or has blocked the viewer.
  if not found
     or (v_p.status <> 'active' and not public.is_staff(v_uid) and v_p.id <> v_uid)
     or exists (select 1 from public.blocks where blocker_id = v_p.id and blocked_id = v_uid) then
    perform public._err(404, 'NOT_FOUND', 'This profile is not available.');
  end if;
  return public._profile_json(v_p, v_uid);
end $$;

create function public.search_users(p_q text, p_limit int default 20, p_offset int default 0)
returns setof jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_q text := lower(left(btrim(coalesce(p_q, '')), 50));
  v_like text;
begin
  if char_length(v_q) < 2 then
    return;
  end if;
  v_like := replace(replace(v_q, '%', '\%'), '_', '\_');
  return query
    select public._profile_json(p, v_uid) from public.profiles p
    where p.status = 'active'
      and (p.username like v_like || '%' or lower(p.display_name) like '%' || v_like || '%')
      and not public._is_blocked(v_uid, p.id)
    order by (p.username = v_q) desc, p.followers_count desc, p.username
    limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
end $$;

create function public.popular_creators(p_limit int default 12) returns setof jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public._profile_json(p, auth.uid()) from public.profiles p
  where p.status = 'active' and p.posts_count > 0 and not public._is_blocked(auth.uid(), p.id)
  order by p.followers_count desc, p.posts_count desc
  limit least(greatest(p_limit, 1), 50)
$$;

create function public.list_follows(
  p_user_id uuid, p_direction text default 'followers', p_limit int default 30, p_offset int default 0
) returns setof jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if p_direction not in ('followers', 'following') then
    perform public._err(422, 'INVALID_DIRECTION');
  end if;
  return query
    select public._profile_json(p, v_uid)
    from public.follows f
    join public.profiles p on p.id = case when p_direction = 'followers' then f.follower_id else f.followee_id end
    where (case when p_direction = 'followers' then f.followee_id else f.follower_id end) = p_user_id
      and p.status = 'active'
      and not public._is_blocked(v_uid, p.id)
    order by f.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.update_profile(
  p_display_name text default null,
  p_bio text default null,
  p_username text default null,
  p_avatar_path text default null,
  p_preferred_language text default null
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
    preferred_language = coalesce(p_preferred_language, preferred_language)
  where id = v_uid;
  return public.get_me();
end $$;

-- Onboarding: choose username/name, optionally apply a referral code once.
create function public.complete_onboarding(
  p_username text, p_display_name text, p_referral_code text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_me public.profiles;
  v_referrer public.profiles;
begin
  perform public.update_profile(p_display_name => p_display_name, p_username => p_username);
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
    -- Referral rewards always require admin review (anti-fraud: multi-account abuse).
    insert into public.earnings (user_id, type, amount_paise, status, reference, note)
    values (v_referrer.id, 'referral', public._setting_int('rewards.referral_paise', 1000), 'pending',
            'referral:' || v_uid, 'Referral: @' || v_me.username)
    on conflict (reference) do nothing;
  end if;

  update public.profiles set onboarded = true, last_active_at = now() where id = v_uid;
  return public.get_me();
end $$;

-- ---------------------------------------------------------------------------
-- Posts (creation happens in the create-post edge function after the media
-- bytes are verified; internal_create_post is service_role only).
-- ---------------------------------------------------------------------------

create function public.internal_create_post(p_user_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_author public.profiles;
  v_post_id uuid;
  v_kind text := p ->> 'kind';
  v_category text := p ->> 'category';
  v_cta_type text := nullif(p ->> 'cta_type', '');
  v_cta_url text := nullif(btrim(p ->> 'cta_url'), '');
  v_cta public.cta_types;
  v_status text;
  -- JSON null (sent by clients for non-complaint posts) must count as "no complaint".
  v_complaint jsonb := nullif(p -> 'complaint', 'null'::jsonb);
  v_authority uuid;
begin
  select * into v_author from public.profiles where id = p_user_id;
  if not found or v_author.status <> 'active' then
    perform public._err(403, 'ACCOUNT_SUSPENDED', 'Your account is currently restricted.');
  end if;
  if public._setting_bool('platform.maintenance_mode', false) then
    perform public._err(503, 'MAINTENANCE', 'Uploads are paused during maintenance.');
  end if;
  perform public._rate_limit('post:' || p_user_id, public._setting_int('uploads.max_posts_per_day', 30)::int, 86400);

  if v_kind not in ('video', 'poster') then
    perform public._err(422, 'INVALID_KIND');
  end if;
  if (p ->> 'media_path') !~ ('^' || p_user_id::text || '/[A-Za-z0-9._-]{1,160}$') then
    perform public._err(422, 'INVALID_MEDIA_PATH');
  end if;
  if p ->> 'thumbnail_path' is not null
     and (p ->> 'thumbnail_path') !~ ('^' || p_user_id::text || '/[A-Za-z0-9._-]{1,160}$') then
    perform public._err(422, 'INVALID_THUMBNAIL_PATH');
  end if;

  -- CTA validation: URL shape must match the CTA type's target kind.
  if v_cta_type is not null then
    select * into v_cta from public.cta_types where id = v_cta_type and is_active;
    if not found then
      perform public._err(422, 'INVALID_CTA', 'Choose a valid call-to-action.');
    end if;
    if v_cta_url is null
       or (v_cta.target_kind = 'url' and v_cta_url !~ '^https://[^\s/$.?#][^\s]*$')
       or (v_cta.target_kind = 'phone' and v_cta_url !~ '^\+?[0-9]{8,15}$')
       or (v_cta.target_kind = 'whatsapp' and v_cta_url !~ '^\+?[0-9]{8,15}$')
       or (v_cta.target_kind = 'email' and v_cta_url !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
      perform public._err(422, 'INVALID_CTA_TARGET', 'The call-to-action link is not valid for this type.');
    end if;
  elsif v_cta_url is not null then
    perform public._err(422, 'INVALID_CTA', 'Choose a call-to-action type.');
  end if;

  v_status := case
    when v_category = 'public_complaint' and public._setting_bool('content.complaints_require_review', true) then 'pending_review'
    when public._setting_bool('content.require_review', false) then 'pending_review'
    else 'published' end;

  insert into public.posts (
    author_id, kind, media_path, thumbnail_path, mime_type, size_bytes, width, height, duration_ms,
    caption, category, language, location, cta_type, cta_url, cta_label, status
  ) values (
    p_user_id, v_kind, p ->> 'media_path', nullif(p ->> 'thumbnail_path', ''), p ->> 'mime_type',
    (p ->> 'size_bytes')::bigint, (p ->> 'width')::int, (p ->> 'height')::int, (p ->> 'duration_ms')::int,
    coalesce(btrim(p ->> 'caption'), ''), v_category, coalesce(nullif(p ->> 'language', ''), 'en'),
    nullif(btrim(p ->> 'location'), ''), v_cta_type, v_cta_url, nullif(btrim(p ->> 'cta_label'), ''), v_status
  ) returning id into v_post_id;

  if v_category = 'public_complaint' then
    if v_complaint is null then
      perform public._err(422, 'COMPLAINT_DETAILS_REQUIRED', 'Complaint details are required.');
    end if;
    v_authority := nullif(v_complaint ->> 'authority_id', '')::uuid;
    if v_authority is not null and not exists (select 1 from public.authorities where id = v_authority and is_active) then
      perform public._err(422, 'INVALID_AUTHORITY', 'Choose a valid authority.');
    end if;
    insert into public.complaints (
      post_id, subcategory, description, location, legal_assistance_requested,
      forward_requested, authority_id, forward_status
    ) values (
      v_post_id, v_complaint ->> 'subcategory', btrim(v_complaint ->> 'description'),
      btrim(v_complaint ->> 'location'), coalesce((v_complaint ->> 'legal_assistance_requested')::boolean, false),
      coalesce((v_complaint ->> 'forward_requested')::boolean, false), v_authority,
      case when coalesce((v_complaint ->> 'forward_requested')::boolean, false) then 'pending' else 'not_requested' end
    );
  elsif v_complaint is not null then
    perform public._err(422, 'UNEXPECTED_COMPLAINT', 'Complaint details only apply to Public Complaint posts.');
  end if;

  update public.profiles set posts_count = posts_count + 1, last_active_at = now() where id = p_user_id;
  return v_post_id;
end $$;

create function public.update_post(
  p_post_id uuid, p_caption text default null, p_location text default null, p_language text default null
) returns setof public.post_card
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  update public.posts set
    caption = coalesce(btrim(p_caption), caption),
    location = coalesce(nullif(btrim(p_location), ''), location),
    language = coalesce(p_language, language)
  where id = p_post_id and author_id = v_uid and status not in ('deleted', 'removed');
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Post not found.');
  end if;
  return query select * from public.get_post(p_post_id);
end $$;

create function public.delete_post(p_post_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  update public.posts set status = 'deleted'
  where id = p_post_id and author_id = v_uid and status <> 'deleted';
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Post not found.');
  end if;
  update public.profiles set posts_count = greatest(posts_count - 1, 0) where id = v_uid;
end $$;

create function public.record_view(p_post_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  -- Views are counted once per signed-in viewer per post per 6h. Views never pay out.
  if v_uid is null then return; end if;
  if public._rate_allow('view:' || v_uid || ':' || p_post_id, 1, 21600) then
    update public.posts set views_count = views_count + 1 where id = p_post_id and status = 'published';
  end if;
end $$;

create function public.record_share(p_post_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  if public._rate_allow('share:' || v_uid || ':' || p_post_id, 1, 3600) then
    update public.posts set shares_count = shares_count + 1 where id = p_post_id and status = 'published';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Engagement: HOT → SPEAK → VIRAL → earning
-- ---------------------------------------------------------------------------

create function public.toggle_engagement(p_post_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_post public.posts;
  v_eng public.engagements;
  v_new_row boolean := false;
  v_on boolean;
  v_hot_th bigint := public._setting_int('engagement.hot_threshold', 100);
  v_speak_th bigint := public._setting_int('engagement.speak_threshold', 50);
  v_viral_th bigint := public._setting_int('engagement.viral_threshold', 25);
  v_auto boolean := public._setting_bool('rewards.auto_approve', false);
  v_reward bigint := public._setting_int('rewards.viral_paise', 5000);
  v_earning_id uuid;
begin
  perform public._assert_not_maintenance();
  if p_kind not in ('hot', 'speak', 'viral') then
    perform public._err(422, 'INVALID_ENGAGEMENT');
  end if;
  perform public._rate_limit('engage:' || v_uid, 90, 60);

  -- Row lock serialises concurrent engagement on the same post (threshold checks + reward).
  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post.status <> 'published' then
    perform public._err(404, 'NOT_FOUND', 'This post is not available.');
  end if;
  if v_post.author_id = v_uid then
    perform public._err(422, 'SELF_ENGAGEMENT', 'You cannot engage with your own post.');
  end if;
  if public._is_blocked(v_uid, v_post.author_id) then
    perform public._err(403, 'BLOCKED', 'You cannot interact with this creator.');
  end if;

  insert into public.engagements (user_id, post_id) values (v_uid, p_post_id)
  on conflict do nothing
  returning true into v_new_row;
  select * into v_eng from public.engagements where user_id = v_uid and post_id = p_post_id for update;

  if p_kind = 'hot' then
    v_on := not v_eng.hot;
    update public.engagements set hot = v_on where user_id = v_uid and post_id = p_post_id;
    update public.posts set hot_count = hot_count + case when v_on then 1 else -1 end where id = p_post_id;
  elsif p_kind = 'speak' then
    v_on := not v_eng.speak;
    update public.engagements set speak = v_on where user_id = v_uid and post_id = p_post_id;
    update public.posts set speak_count = speak_count + case when v_on then 1 else -1 end where id = p_post_id;
  else
    -- VIRAL votes are irreversible and unlock only once HOT and SPEAK thresholds are met.
    if not v_eng.viral then
      if v_post.hot_count < v_hot_th or v_post.speak_count < v_speak_th then
        perform public._err(422, 'VIRAL_NOT_ELIGIBLE', 'VIRAL unlocks once this post reaches its HOT and SPEAK goals.');
      end if;
      update public.engagements set viral = true where user_id = v_uid and post_id = p_post_id;
      update public.posts set viral_count = viral_count + 1 where id = p_post_id;
    end if;
    v_on := true;
  end if;

  select * into v_post from public.posts where id = p_post_id;

  if not v_post.is_viral
     and v_post.hot_count >= v_hot_th and v_post.speak_count >= v_speak_th and v_post.viral_count >= v_viral_th then
    update public.posts set is_viral = true, viral_at = now() where id = p_post_id;
    v_post.is_viral := true;
    -- Unique reference guarantees one viral reward per post, ever.
    insert into public.earnings (user_id, type, post_id, amount_paise, status, reference, note)
    values (v_post.author_id, 'viral', p_post_id, v_reward,
            case when v_auto then 'approved' else 'pending' end, 'viral:' || p_post_id, 'Viral reward')
    on conflict (reference) do nothing
    returning id into v_earning_id;
    if v_earning_id is not null then
      perform public._notify(v_post.author_id, 'reward', null, p_post_id, 'Your post went VIRAL 🎉',
        case when v_auto then 'A viral reward was added to your balance.'
             else 'A viral reward is pending review.' end, '/earnings');
    end if;
  end if;

  if coalesce(v_new_row, false) and v_on then
    perform public._notify(v_post.author_id, 'engagement', v_uid, p_post_id,
      'New ' || upper(p_kind) || ' on your post', left(v_post.caption, 80), '/post/' || p_post_id);
  end if;

  select * into v_eng from public.engagements where user_id = v_uid and post_id = p_post_id;
  return jsonb_build_object(
    'post_id', p_post_id,
    'my_hot', v_eng.hot, 'my_speak', v_eng.speak, 'my_viral', v_eng.viral,
    'hot_count', v_post.hot_count, 'speak_count', v_post.speak_count, 'viral_count', v_post.viral_count,
    'is_viral', v_post.is_viral,
    'viral_eligible', v_post.hot_count >= v_hot_th and v_post.speak_count >= v_speak_th
  );
end $$;

-- ---------------------------------------------------------------------------
-- Follow / block
-- ---------------------------------------------------------------------------

create function public.toggle_follow(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_deleted int;
  v_following boolean;
begin
  if p_user_id = v_uid then
    perform public._err(422, 'SELF_FOLLOW', 'You cannot follow yourself.');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active')
     or public._is_blocked(v_uid, p_user_id) then
    perform public._err(404, 'NOT_FOUND', 'This profile is not available.');
  end if;
  perform public._rate_limit('follow:' || v_uid, 60, 60);

  delete from public.follows where follower_id = v_uid and followee_id = p_user_id;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = p_user_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = v_uid;
    v_following := false;
  else
    insert into public.follows (follower_id, followee_id) values (v_uid, p_user_id) on conflict do nothing;
    update public.profiles set followers_count = followers_count + 1 where id = p_user_id;
    update public.profiles set following_count = following_count + 1 where id = v_uid;
    v_following := true;
    -- One follow notification per pair per day (prevents follow/unfollow spam).
    if public._rate_allow('follow-notify:' || v_uid || ':' || p_user_id, 1, 86400) then
      perform public._notify(p_user_id, 'follow', v_uid, null, 'New follower',
        '@' || (select username from public.profiles where id = v_uid) || ' started following you',
        '/profile/' || (select username from public.profiles where id = v_uid));
    end if;
  end if;

  return jsonb_build_object(
    'following', v_following,
    'followers_count', (select followers_count from public.profiles where id = p_user_id)
  );
end $$;

create function public.block_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  if p_user_id = v_uid then
    perform public._err(422, 'SELF_BLOCK', 'You cannot block yourself.');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform public._err(404, 'NOT_FOUND', 'User not found.');
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_user_id) on conflict do nothing;
  -- Blocking severs follows in both directions, keeping counters consistent.
  perform public._unfollow_pair(v_uid, p_user_id);
  perform public._unfollow_pair(p_user_id, v_uid);
end $$;

create function public._unfollow_pair(p_follower uuid, p_followee uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_deleted int;
begin
  delete from public.follows where follower_id = p_follower and followee_id = p_followee;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = p_follower;
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = p_followee;
  end if;
end $$;

create function public.unblock_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  delete from public.blocks where blocker_id = v_uid and blocked_id = p_user_id;
end $$;

create function public.my_blocks() returns setof jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  return query
    select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                              'avatar_path', p.avatar_path, 'blocked_at', b.created_at)
    from public.blocks b join public.profiles p on p.id = b.blocked_id
    where b.blocker_id = v_uid
    order by b.created_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- Bookmarks
-- ---------------------------------------------------------------------------

create function public.toggle_bookmark(p_post_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_deleted int;
  v_on boolean;
begin
  if not exists (select 1 from public.get_post(p_post_id) where status = 'published') then
    perform public._err(404, 'NOT_FOUND', 'This post is not available.');
  end if;
  perform public._rate_limit('bookmark:' || v_uid, 60, 60);
  delete from public.bookmarks where user_id = v_uid and post_id = p_post_id;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    update public.posts set bookmarks_count = greatest(bookmarks_count - 1, 0) where id = p_post_id;
    v_on := false;
  else
    insert into public.bookmarks (user_id, post_id) values (v_uid, p_post_id);
    update public.posts set bookmarks_count = bookmarks_count + 1 where id = p_post_id;
    v_on := true;
  end if;
  return jsonb_build_object('bookmarked', v_on,
    'bookmarks_count', (select bookmarks_count from public.posts where id = p_post_id));
end $$;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

create function public._comment_json(c public.comments, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', c.id, 'post_id', c.post_id, 'body', c.body, 'created_at', c.created_at,
    'author', jsonb_build_object('id', a.id, 'username', a.username, 'display_name', a.display_name,
                                 'avatar_path', a.avatar_path, 'is_verified', a.is_verified),
    'can_delete', c.author_id = p_viewer
                  or exists (select 1 from public.posts where id = c.post_id and author_id = p_viewer)
                  or public.is_staff(p_viewer)
  )
  from public.profiles a where a.id = c.author_id
$$;

create function public.list_comments(p_post_id uuid, p_before timestamptz default null, p_limit int default 20)
returns setof jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.get_post(p_post_id)) then
    perform public._err(404, 'NOT_FOUND', 'This post is not available.');
  end if;
  return query
    select public._comment_json(c, v_uid)
    from public.comments c
    join public.profiles a on a.id = c.author_id
    where c.post_id = p_post_id and c.status = 'visible' and a.status = 'active'
      and (p_before is null or c.created_at < p_before)
      and not public._is_blocked(v_uid, c.author_id)
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 50);
end $$;

create function public.add_comment(p_post_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_post public.posts;
  v_comment public.comments;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform public._assert_not_maintenance();
  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    perform public._err(422, 'INVALID_COMMENT', 'Comments must be 1–1000 characters.');
  end if;
  perform public._rate_limit('comment:' || v_uid, 10, 60);
  perform public._rate_limit('comment-day:' || v_uid, 300, 86400);

  select * into v_post from public.posts where id = p_post_id;
  if not found or v_post.status <> 'published' then
    perform public._err(404, 'NOT_FOUND', 'This post is not available.');
  end if;
  if public._is_blocked(v_uid, v_post.author_id) then
    perform public._err(403, 'BLOCKED', 'You cannot comment on this post.');
  end if;

  insert into public.comments (post_id, author_id, body) values (p_post_id, v_uid, v_body)
  returning * into v_comment;
  update public.posts set comments_count = comments_count + 1 where id = p_post_id;
  perform public._notify(v_post.author_id, 'comment', v_uid, p_post_id, 'New comment', left(v_body, 120),
                         '/post/' || p_post_id);
  return public._comment_json(v_comment, v_uid);
end $$;

create function public.delete_comment(p_comment_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_c public.comments;
  v_post_author uuid;
begin
  select * into v_c from public.comments where id = p_comment_id and status = 'visible' for update;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Comment not found.');
  end if;
  select author_id into v_post_author from public.posts where id = v_c.post_id;
  if v_c.author_id <> v_uid and v_post_author <> v_uid and not public.is_staff(v_uid) then
    perform public._err(403, 'FORBIDDEN', 'You can only delete your own comments.');
  end if;
  update public.comments set status = case when v_c.author_id = v_uid then 'deleted' else 'removed' end
  where id = p_comment_id;
  update public.posts set comments_count = greatest(comments_count - 1, 0) where id = v_c.post_id;
  if v_c.author_id <> v_uid and v_post_author <> v_uid then
    perform public._log_admin(v_uid, 'comment.remove', 'comment', p_comment_id::text,
                              to_jsonb(v_c), jsonb_build_object('status', 'removed'), null);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reports (reported user is resolved server-side — never trusted from the client)
-- ---------------------------------------------------------------------------

create function public.create_report(
  p_target_type text, p_target_id uuid, p_reason text, p_description text default ''
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_reported uuid;
  v_id uuid;
begin
  if p_reason not in ('spam', 'harassment', 'illegal', 'copyright', 'misinformation',
                      'adult', 'violence', 'child_safety', 'other') then
    perform public._err(422, 'INVALID_REASON', 'Choose a reason for your report.');
  end if;
  if char_length(coalesce(p_description, '')) > 1000 then
    perform public._err(422, 'INVALID_DESCRIPTION', 'Description can be at most 1000 characters.');
  end if;
  perform public._rate_limit('report:' || v_uid, 20, 3600);

  v_reported := case p_target_type
    when 'post' then (select author_id from public.posts where id = p_target_id)
    when 'comment' then (select author_id from public.comments where id = p_target_id)
    when 'user' then (select id from public.profiles where id = p_target_id)
    when 'message' then (
      select m.sender_id from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = p_target_id and v_uid in (c.user_a, c.user_b))
    else null end;
  if v_reported is null then
    perform public._err(404, 'NOT_FOUND', 'The reported item could not be found.');
  end if;
  if v_reported = v_uid then
    perform public._err(422, 'SELF_REPORT', 'You cannot report yourself.');
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reported_user_id, reason, description)
  values (v_uid, p_target_type, p_target_id, v_reported, p_reason, btrim(coalesce(p_description, '')))
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    perform public._err(409, 'ALREADY_REPORTED', 'You have already reported this. Our team is reviewing it.');
  end if;
  return v_id;
end $$;
