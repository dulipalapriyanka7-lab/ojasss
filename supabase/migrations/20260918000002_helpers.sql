-- OJASSS — shared helpers used by every API function.
--
-- Errors: raised with SQLSTATE 'PTxxx' so PostgREST returns HTTP status xxx.
-- The message is a stable machine code (e.g. RATE_LIMITED); detail is user-safe text.

create function public._err(p_status int, p_code text, p_detail text default null) returns void
language plpgsql as $$
begin
  raise exception '%', p_code using errcode = 'PT' || p_status::text, detail = coalesce(p_detail, p_code);
end $$;

-- ---------------------------------------------------------------------------
-- Identity & authorization (role comes from the database, never from JWT claims)
-- ---------------------------------------------------------------------------

create function public._role_of(p_uid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.profiles where id = p_uid and status = 'active'
$$;

create function public.is_admin(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public._role_of(p_uid) = 'admin', false)
$$;

create function public.is_staff(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public._role_of(p_uid) in ('admin', 'moderator'), false)
$$;

create function public._require_user() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    perform public._err(401, 'AUTH_REQUIRED', 'Please sign in to continue.');
  end if;
  select status into v_status from public.profiles where id = v_uid;
  if v_status is null then
    perform public._err(401, 'PROFILE_MISSING', 'Your profile is not set up yet.');
  elsif v_status <> 'active' then
    perform public._err(403, 'ACCOUNT_SUSPENDED', 'Your account is currently restricted.');
  end if;
  return v_uid;
end $$;

create function public._require_staff() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  if not public.is_staff(v_uid) then
    perform public._err(403, 'FORBIDDEN', 'You do not have permission to do that.');
  end if;
  return v_uid;
end $$;

create function public._require_admin() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  if not public.is_admin(v_uid) then
    perform public._err(403, 'FORBIDDEN', 'You do not have permission to do that.');
  end if;
  return v_uid;
end $$;

create function public._is_blocked(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  )
$$;

-- Best-effort client IP from PostgREST request headers (null outside HTTP context).
create function public._request_ip() returns text
language plpgsql stable as $$
declare v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  return nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', v_headers ->> 'x-real-ip', ''), ',', 1), '');
end $$;

-- ---------------------------------------------------------------------------
-- Database-backed fixed-window rate limiting
-- ---------------------------------------------------------------------------

-- Returns true if the hit is allowed (and records it), false when over the limit.
create function public._rate_allow(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hits int;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

create function public._rate_limit(p_key text, p_max int, p_window_seconds int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public._rate_allow(p_key, p_max, p_window_seconds) then
    perform public._err(429, 'RATE_LIMITED', 'You are doing that too often. Please wait a moment.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

create function public._setting(p_key text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select value from public.app_settings where key = p_key
$$;

create function public._setting_int(p_key text, p_default bigint) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_settings where key = p_key), p_default)
$$;

create function public._setting_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = p_key), p_default)
$$;

create function public._assert_not_maintenance() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public._setting_bool('platform.maintenance_mode', false) and not public.is_staff(auth.uid()) then
    perform public._err(503, 'MAINTENANCE', 'OJASSS is undergoing maintenance. Please try again shortly.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Notifications & audit
-- ---------------------------------------------------------------------------

create function public._notify(
  p_user uuid, p_type text, p_actor uuid, p_post uuid, p_title text, p_body text, p_link text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user is null or p_user = p_actor or public._is_blocked(p_user, p_actor) then
    return;
  end if;
  insert into public.notifications (user_id, type, actor_id, post_id, title, body, link)
  values (p_user, p_type, p_actor, p_post, left(p_title, 140), left(coalesce(p_body, ''), 500), p_link);
end $$;

create function public._log_admin(
  p_admin uuid, p_action text, p_target_type text, p_target_id text,
  p_prev jsonb, p_new jsonb, p_reason text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.admin_logs (admin_id, action, target_type, target_id, previous_state, new_state, reason, ip)
  values (p_admin, p_action, p_target_type, p_target_id, p_prev, p_new, nullif(btrim(p_reason), ''), public._request_ip());
end $$;

-- ---------------------------------------------------------------------------
-- New auth user → profile
-- ---------------------------------------------------------------------------

create function public._random_code(p_len int) returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, p_len)
$$;

create function public._is_reserved_username(p_username text) returns boolean
language sql immutable as $$
  select lower(p_username) in (
    'admin', 'administrator', 'ojasss', 'support', 'help', 'root', 'system', 'moderator', 'official',
    'staff', 'security', 'safety', 'payouts', 'grievance', 'privacy', 'api', 'www', 'null', 'undefined')
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_base text;
  v_username text;
  v_name text;
  v_try int := 0;
begin
  v_base := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-zA-Z0-9_.]', '', 'g'));
  v_base := left(coalesce(nullif(v_base, ''), 'user'), 16);
  if char_length(v_base) < 3 then v_base := v_base || 'user'; end if;
  v_name := left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 50);

  loop
    v_username := v_base || case when v_try = 0 then '' else '_' || floor(random() * 90000 + 10000)::text end;
    exit when not public._is_reserved_username(v_username)
      and not exists (select 1 from public.profiles where username = v_username);
    v_try := v_try + 1;
    if v_try > 20 then
      v_username := 'user_' || replace(left(new.id::text, 12), '-', '');
      exit;
    end if;
  end loop;

  insert into public.profiles (id, username, display_name, referral_code)
  values (new.id, v_username, v_name, public._random_code(8));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();
