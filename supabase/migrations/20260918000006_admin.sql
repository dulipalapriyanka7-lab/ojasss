-- OJASSS — admin API. Every function authorizes from the profiles table
-- (never JWT claims) and every sensitive mutation writes an admin_logs row.

-- ---------------------------------------------------------------------------
-- Dashboard & analytics (real aggregates only)
-- ---------------------------------------------------------------------------

create function public.admin_dashboard(p_from timestamptz default now() - interval '7 days', p_to timestamptz default now())
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_staff();
  return jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'total_users', (select count(*) from public.profiles),
    'active_users', (select count(*) from public.profiles where last_active_at between p_from and p_to),
    'new_users', (select count(*) from public.profiles where created_at between p_from and p_to),
    'suspended_users', (select count(*) from public.profiles where status <> 'active'),
    'videos', (select count(*) from public.posts where kind = 'video' and status <> 'deleted'),
    'posters', (select count(*) from public.posts where kind = 'poster' and status <> 'deleted'),
    'new_posts', (select count(*) from public.posts where created_at between p_from and p_to),
    'pending_review', (select count(*) from public.posts where status = 'pending_review'),
    'complaints_open', (select count(*) from public.complaints where status in ('submitted', 'under_review')),
    'complaints_total', (select count(*) from public.complaints),
    'reports_open', (select count(*) from public.reports where status in ('pending', 'under_review')),
    'child_safety_open', (select count(*) from public.reports where reason = 'child_safety' and status in ('pending', 'under_review')),
    'pending_withdrawals', (select count(*) from public.withdrawals where status in ('requested', 'approved')),
    'pending_withdrawals_paise', (select coalesce(sum(amount_paise), 0) from public.withdrawals where status in ('requested', 'approved')),
    'pending_earnings', (select count(*) from public.earnings where status = 'pending'),
    'total_earnings_paise', (select coalesce(sum(amount_paise), 0) from public.earnings where status = 'approved'),
    'range_earnings_paise', (select coalesce(sum(amount_paise), 0) from public.earnings
                             where status in ('approved', 'pending') and created_at between p_from and p_to),
    'paid_out_paise', (select coalesce(sum(amount_paise), 0) from public.withdrawals where status = 'paid'),
    'engagements', (select count(*) from public.engagements where created_at between p_from and p_to),
    'viral_posts', (select count(*) from public.posts where is_viral and viral_at between p_from and p_to),
    'cta_clicks', (select count(*) from public.cta_clicks where created_at between p_from and p_to),
    'deletion_requests_open', (select count(*) from public.account_deletion_requests where status in ('pending', 'processing'))
  );
end $$;

create function public.admin_timeseries(
  p_metric text, p_from timestamptz, p_to timestamptz, p_bucket text default 'day'
) returns table (bucket_start timestamptz, value numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_step interval;
begin
  perform public._require_staff();
  if p_bucket not in ('hour', 'day', 'week', 'month') then
    perform public._err(422, 'INVALID_BUCKET');
  end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then
    perform public._err(422, 'INVALID_RANGE', 'Choose a range of up to 400 days.');
  end if;
  v_step := ('1 ' || p_bucket)::interval;
  return query
    with b as (
      select generate_series(date_trunc(p_bucket, p_from), date_trunc(p_bucket, p_to), v_step) as s
    ), src as (
      select created_at as t, 1::numeric as v from public.profiles where p_metric = 'users' and created_at between p_from and p_to
      union all
      select created_at, 1 from public.posts where p_metric = 'posts' and created_at between p_from and p_to
      union all
      select created_at, 1 from public.posts where p_metric = 'videos' and kind = 'video' and created_at between p_from and p_to
      union all
      select created_at, 1 from public.posts where p_metric = 'posters' and kind = 'poster' and created_at between p_from and p_to
      union all
      select created_at, 1 from public.engagements where p_metric = 'engagements' and created_at between p_from and p_to
      union all
      select viral_at, 1 from public.posts where p_metric = 'viral' and is_viral and viral_at between p_from and p_to
      union all
      select created_at, amount_paise from public.earnings
        where p_metric = 'earnings_paise' and status in ('approved', 'pending') and created_at between p_from and p_to
      union all
      select paid_at, amount_paise from public.withdrawals
        where p_metric = 'withdrawals_paise' and status = 'paid' and paid_at between p_from and p_to
      union all
      select created_at, 1 from public.cta_clicks where p_metric = 'cta_clicks' and created_at between p_from and p_to
      union all
      select created_at, 1 from public.reports where p_metric = 'reports' and created_at between p_from and p_to
      union all
      select created_at, 1 from public.complaints where p_metric = 'complaints' and created_at between p_from and p_to
      union all
      select last_active_at, 1 from public.profiles where p_metric = 'active_users' and last_active_at between p_from and p_to
    )
    select b.s, coalesce(sum(src.v), 0)
    from b left join src on date_trunc(p_bucket, src.t) = b.s
    group by b.s order by b.s;
end $$;

create function public.admin_breakdowns(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_staff();
  return jsonb_build_object(
    'posts_by_category', (select coalesce(jsonb_object_agg(category, n), '{}') from
      (select category, count(*) n from public.posts where created_at between p_from and p_to and status <> 'deleted' group by 1) s),
    'reports_by_reason', (select coalesce(jsonb_object_agg(reason, n), '{}') from
      (select reason, count(*) n from public.reports where created_at between p_from and p_to group by 1) s),
    'complaints_by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from
      (select status, count(*) n from public.complaints where created_at between p_from and p_to group by 1) s),
    'earnings_by_type', (select coalesce(jsonb_object_agg(type, n), '{}') from
      (select type, sum(amount_paise) n from public.earnings
       where created_at between p_from and p_to and status in ('approved', 'pending') group by 1) s),
    'withdrawals_by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from
      (select status, count(*) n from public.withdrawals where created_at between p_from and p_to group by 1) s),
    'cta_by_type', (select coalesce(jsonb_object_agg(cta_type, n), '{}') from
      (select p.cta_type, count(*) n from public.cta_clicks c join public.posts p on p.id = c.post_id
       where c.created_at between p_from and p_to group by 1) s),
    'top_viral', (select coalesce(jsonb_agg(t), '[]') from (
      select p.id, left(p.caption, 60) caption, p.kind, p.viral_count, p.hot_count, p.speak_count, a.username
      from public.posts p join public.profiles a on a.id = p.author_id
      where p.is_viral and p.viral_at between p_from and p_to
      order by p.viral_count desc limit 10) t)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Users: manageUsers
-- ---------------------------------------------------------------------------

create function public.admin_list_users(
  p_q text default null, p_status text default null, p_role text default null,
  p_limit int default 25, p_offset int default 0
) returns table (
  id uuid, username text, display_name text, email text, avatar_path text, role text, status text,
  is_verified boolean, followers_count int, posts_count int, created_at timestamptz, last_active_at timestamptz,
  open_reports bigint, approved_paise bigint, total_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_like text := '%' || replace(replace(lower(btrim(coalesce(p_q, ''))), '%', '\%'), '_', '\_') || '%';
begin
  perform public._require_staff();
  return query
    select p.id, p.username, p.display_name, u.email::text, p.avatar_path, p.role, p.status, p.is_verified,
           p.followers_count, p.posts_count, p.created_at, p.last_active_at,
           (select count(*) from public.reports r where r.reported_user_id = p.id and r.status in ('pending', 'under_review')),
           (select coalesce(sum(e.amount_paise), 0)::bigint from public.earnings e where e.user_id = p.id and e.status = 'approved'),
           count(*) over ()
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (p_q is null or btrim(p_q) = '' or p.username like v_like or lower(p.display_name) like v_like
           or lower(u.email::text) like v_like or p.id::text = btrim(p_q))
      and (p_status is null or p.status = p_status)
      and (p_role is null or p.role = p_role)
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.admin_user_detail(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_p public.profiles;
begin
  perform public._require_staff();
  select * into v_p from public.profiles where id = p_user_id;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'User not found.');
  end if;
  return jsonb_build_object(
    'profile', to_jsonb(v_p) || jsonb_build_object(
      'email', (select email from auth.users where id = p_user_id),
      'last_sign_in_at', (select last_sign_in_at from auth.users where id = p_user_id)),
    'wallet', public._wallet(p_user_id),
    'reports_against', (select coalesce(jsonb_agg(r order by r.created_at desc), '[]') from (
      select id, target_type, reason, status, created_at from public.reports
      where reported_user_id = p_user_id order by created_at desc limit 20) r),
    'recent_posts', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
      select id, kind, left(caption, 80) caption, status, category, is_viral, created_at, thumbnail_path
      from public.posts where author_id = p_user_id order by created_at desc limit 12) x),
    'recent_earnings', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
      select id, type, amount_paise, status, created_at from public.earnings
      where user_id = p_user_id order by created_at desc limit 12) x),
    'admin_history', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
      select l.action, l.reason, l.created_at, a.username admin_username
      from public.admin_logs l left join public.profiles a on a.id = l.admin_id
      where l.target_type = 'user' and l.target_id = p_user_id::text
      order by l.created_at desc limit 20) x)
  );
end $$;

create function public.admin_manage_user(
  p_user_id uuid, p_action text, p_reason text default null, p_role text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_admin();
  v_before public.profiles;
  v_after public.profiles;
begin
  if p_user_id = v_admin then
    perform public._err(422, 'SELF_ACTION', 'You cannot change your own account from the admin panel.');
  end if;
  select * into v_before from public.profiles where id = p_user_id for update;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'User not found.');
  end if;
  if p_action in ('suspend', 'ban') and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform public._err(422, 'REASON_REQUIRED', 'Please record a reason.');
  end if;

  case p_action
    when 'suspend' then update public.profiles set status = 'suspended', status_reason = p_reason where id = p_user_id;
    when 'ban' then update public.profiles set status = 'banned', status_reason = p_reason where id = p_user_id;
    when 'unsuspend', 'unban', 'restore' then update public.profiles set status = 'active', status_reason = null where id = p_user_id;
    when 'verify' then update public.profiles set is_verified = true where id = p_user_id;
    when 'unverify' then update public.profiles set is_verified = false where id = p_user_id;
    when 'set_role' then
      if p_role not in ('user', 'moderator', 'admin') then
        perform public._err(422, 'INVALID_ROLE');
      end if;
      update public.profiles set role = p_role where id = p_user_id;
    else
      perform public._err(422, 'INVALID_ACTION');
  end case;

  select * into v_after from public.profiles where id = p_user_id;
  perform public._log_admin(v_admin, 'user.' || p_action, 'user', p_user_id::text,
    jsonb_build_object('status', v_before.status, 'role', v_before.role, 'is_verified', v_before.is_verified),
    jsonb_build_object('status', v_after.status, 'role', v_after.role, 'is_verified', v_after.is_verified),
    p_reason);
  if p_action in ('suspend', 'ban') then
    perform public._notify(p_user_id, 'moderation', null, null, 'Your account has been restricted',
                           coalesce(p_reason, ''), '/community-guidelines');
  end if;
  return to_jsonb(v_after);
end $$;

-- ---------------------------------------------------------------------------
-- Content moderation (videos & posters)
-- ---------------------------------------------------------------------------

create function public.admin_list_posts(
  p_kind text default null, p_status text default null, p_category text default null,
  p_q text default null, p_limit int default 25, p_offset int default 0
) returns table (
  id uuid, kind text, author_id uuid, author_username text, thumbnail_path text, media_path text,
  caption text, category text, language text, status text, moderation_reason text,
  views_count bigint, hot_count int, speak_count int, viral_count int, is_viral boolean,
  open_reports bigint, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_staff();
  return query
    select p.id, p.kind, p.author_id, a.username, p.thumbnail_path, p.media_path, p.caption, p.category,
           p.language, p.status, p.moderation_reason, p.views_count, p.hot_count, p.speak_count, p.viral_count,
           p.is_viral,
           (select count(*) from public.reports r where r.target_type = 'post' and r.target_id = p.id
              and r.status in ('pending', 'under_review')),
           p.created_at, count(*) over ()
    from public.posts p join public.profiles a on a.id = p.author_id
    where (p_kind is null or p.kind = p_kind)
      and (p_status is null or p.status = p_status)
      and (p_category is null or p.category = p_category)
      and (p_q is null or btrim(p_q) = '' or p.caption ilike '%' || btrim(p_q) || '%'
           or a.username ilike btrim(p_q) || '%' or p.id::text = btrim(p_q))
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.admin_moderate_post(p_post_id uuid, p_action text, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_staff();
  v_before public.posts;
  v_status text;
begin
  select * into v_before from public.posts where id = p_post_id for update;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Post not found.');
  end if;
  v_status := case p_action
    when 'approve' then 'published'
    when 'restore' then 'published'
    when 'remove' then 'removed'
    when 'flag' then 'flagged'
    else null end;
  if v_status is null then
    perform public._err(422, 'INVALID_ACTION');
  end if;
  if p_action in ('remove', 'flag') and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform public._err(422, 'REASON_REQUIRED', 'Please record a reason.');
  end if;
  if v_before.status = 'deleted' then
    perform public._err(409, 'DELETED_BY_OWNER', 'This post was deleted by its creator.');
  end if;

  update public.posts set status = v_status,
    moderation_reason = case when v_status = 'published' then null else p_reason end
  where id = p_post_id;

  -- Removing content voids rewards that have not been paid out yet.
  if v_status = 'removed' then
    update public.earnings set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(),
      note = coalesce(note, '') || ' — content removed'
    where post_id = p_post_id and status = 'pending';
  end if;

  perform public._log_admin(v_admin, 'post.' || p_action, 'post', p_post_id::text,
    jsonb_build_object('status', v_before.status), jsonb_build_object('status', v_status), p_reason);
  if v_status in ('removed', 'flagged') then
    perform public._notify(v_before.author_id, 'moderation', null, p_post_id,
      case when v_status = 'removed' then 'Your post was removed' else 'Your post is under review' end,
      coalesce(p_reason, ''), '/community-guidelines');
  elsif v_before.status = 'pending_review' then
    perform public._notify(v_before.author_id, 'system', null, p_post_id, 'Your post is live',
      left(v_before.caption, 80), '/post/' || p_post_id);
  end if;
  return jsonb_build_object('id', p_post_id, 'status', v_status);
end $$;

-- ---------------------------------------------------------------------------
-- Complaints
-- ---------------------------------------------------------------------------

create function public.admin_list_complaints(
  p_status text default null, p_forward_status text default null, p_q text default null,
  p_limit int default 25, p_offset int default 0
) returns table (
  post_id uuid, caption text, author_username text, subcategory text, location text, authority_name text,
  forward_requested boolean, forward_status text, forwarded_at timestamptz, legal_assistance_requested boolean,
  status text, post_status text, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_staff();
  return query
    select c.post_id, left(p.caption, 120), a.username, c.subcategory, c.location, au.name,
           c.forward_requested, c.forward_status, c.forwarded_at, c.legal_assistance_requested,
           c.status, p.status, c.created_at, count(*) over ()
    from public.complaints c
    join public.posts p on p.id = c.post_id
    join public.profiles a on a.id = p.author_id
    left join public.authorities au on au.id = c.authority_id
    where (p_status is null or c.status = p_status)
      and (p_forward_status is null or c.forward_status = p_forward_status)
      and (p_q is null or btrim(p_q) = '' or c.description ilike '%' || btrim(p_q) || '%'
           or c.location ilike '%' || btrim(p_q) || '%' or a.username ilike btrim(p_q) || '%')
    order by c.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.admin_complaint_detail(p_post_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_c public.complaints;
begin
  perform public._require_staff();
  select * into v_c from public.complaints where post_id = p_post_id;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Complaint not found.');
  end if;
  return jsonb_build_object(
    'complaint', to_jsonb(v_c),
    'post', (select to_jsonb(c) from public._cards(auth.uid()) c where c.id = p_post_id),
    'authority', (select to_jsonb(a) from public.authorities a where a.id = v_c.authority_id),
    'notes', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'note', n.note, 'created_at', n.created_at,
                'admin_username', p.username) order by n.created_at desc), '[]')
              from public.complaint_notes n left join public.profiles p on p.id = n.admin_id
              where n.post_id = p_post_id),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('action', l.action, 'reason', l.reason,
                  'created_at', l.created_at, 'admin_username', p.username) order by l.created_at desc), '[]')
                from public.admin_logs l left join public.profiles p on p.id = l.admin_id
                where l.target_type = 'complaint' and l.target_id = p_post_id::text)
  );
end $$;

create function public.admin_update_complaint(
  p_post_id uuid, p_action text, p_note text default null, p_authority_id uuid default null,
  p_response text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_staff();
  v_before public.complaints;
  v_after public.complaints;
  v_author uuid;
begin
  select * into v_before from public.complaints where post_id = p_post_id for update;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Complaint not found.');
  end if;
  select author_id into v_author from public.posts where id = p_post_id;

  case p_action
    when 'under_review' then
      update public.complaints set status = 'under_review' where post_id = p_post_id;
    when 'set_authority' then
      if not exists (select 1 from public.authorities where id = p_authority_id and is_active) then
        perform public._err(422, 'INVALID_AUTHORITY', 'Choose a valid authority.');
      end if;
      update public.complaints set authority_id = p_authority_id where post_id = p_post_id;
    when 'mark_forwarded' then
      -- Manual forwarding (e.g. by post/portal) recorded by staff.
      if char_length(btrim(coalesce(p_note, ''))) < 3 then
        perform public._err(422, 'REASON_REQUIRED', 'Describe how the complaint was forwarded.');
      end if;
      update public.complaints set forward_status = 'forwarded', forwarded_at = now(), status = 'forwarded'
      where post_id = p_post_id;
    when 'record_response' then
      if char_length(btrim(coalesce(p_response, ''))) < 3 then
        perform public._err(422, 'RESPONSE_REQUIRED', 'Enter the authority response.');
      end if;
      update public.complaints set authority_response = btrim(p_response), authority_responded_at = now()
      where post_id = p_post_id;
    when 'resolve' then
      update public.complaints set status = 'resolved' where post_id = p_post_id;
    when 'reject' then
      if char_length(btrim(coalesce(p_note, ''))) < 3 then
        perform public._err(422, 'REASON_REQUIRED', 'Please record a reason.');
      end if;
      update public.complaints set status = 'rejected' where post_id = p_post_id;
    else
      perform public._err(422, 'INVALID_ACTION');
  end case;

  if nullif(btrim(p_note), '') is not null then
    insert into public.complaint_notes (post_id, admin_id, note) values (p_post_id, v_admin, btrim(p_note));
  end if;
  select * into v_after from public.complaints where post_id = p_post_id;
  perform public._log_admin(v_admin, 'complaint.' || p_action, 'complaint', p_post_id::text,
    jsonb_build_object('status', v_before.status, 'forward_status', v_before.forward_status, 'authority_id', v_before.authority_id),
    jsonb_build_object('status', v_after.status, 'forward_status', v_after.forward_status, 'authority_id', v_after.authority_id),
    p_note);
  if v_after.status <> v_before.status or v_after.forward_status <> v_before.forward_status
     or p_action = 'record_response' then
    perform public._notify(v_author, 'complaint', null, p_post_id, 'Complaint update',
      'Status: ' || replace(v_after.status, '_', ' '), '/post/' || p_post_id);
  end if;
  return to_jsonb(v_after);
end $$;

create function public.admin_add_complaint_note(p_post_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_admin uuid := public._require_staff();
begin
  if char_length(btrim(coalesce(p_note, ''))) < 1 then
    perform public._err(422, 'NOTE_REQUIRED');
  end if;
  insert into public.complaint_notes (post_id, admin_id, note) values (p_post_id, v_admin, btrim(p_note));
  perform public._log_admin(v_admin, 'complaint.note', 'complaint', p_post_id::text, null, null, left(p_note, 200));
end $$;

create function public.admin_list_authorities() returns setof public.authorities
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_staff();
  return query select * from public.authorities order by is_active desc, name;
end $$;

create function public.admin_upsert_authority(
  p_id uuid, p_name text, p_department text, p_jurisdiction text, p_email text, p_is_active boolean default true
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_admin();
  v_before public.authorities;
  v_id uuid;
begin
  if p_id is not null then
    select * into v_before from public.authorities where id = p_id;
  end if;
  begin
    insert into public.authorities (id, name, department, jurisdiction, email, is_active)
    values (coalesce(p_id, gen_random_uuid()), btrim(p_name), coalesce(btrim(p_department), ''),
            coalesce(btrim(p_jurisdiction), ''), lower(btrim(p_email)), coalesce(p_is_active, true))
    on conflict (id) do update set name = excluded.name, department = excluded.department,
      jurisdiction = excluded.jurisdiction, email = excluded.email, is_active = excluded.is_active
    returning id into v_id;
  exception when check_violation then
    perform public._err(422, 'INVALID_AUTHORITY', 'Check the authority name and email.');
  end;
  perform public._log_admin(v_admin, 'authority.upsert', 'authority', v_id::text, to_jsonb(v_before),
    (select to_jsonb(a) from public.authorities a where a.id = v_id), null);
  return v_id;
end $$;

-- Service role (sendComplaintEmail): the recipient is resolved here, never from the client.
create function public.internal_complaint_forward_context(p_post_id uuid, p_admin_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_row jsonb;
begin
  if not public.is_staff(p_admin_id) then
    perform public._err(403, 'FORBIDDEN', 'You do not have permission to do that.');
  end if;
  select jsonb_build_object(
    'post_id', c.post_id, 'subcategory', c.subcategory, 'description', c.description, 'location', c.location,
    'legal_assistance_requested', c.legal_assistance_requested, 'status', c.status,
    'forward_status', c.forward_status, 'created_at', c.created_at,
    'post_status', p.status, 'caption', p.caption, 'author_username', a.username,
    'authority', case when au.id is null then null else jsonb_build_object(
      'id', au.id, 'name', au.name, 'department', au.department, 'email', au.email, 'is_active', au.is_active) end)
  into v_row
  from public.complaints c
  join public.posts p on p.id = c.post_id
  join public.profiles a on a.id = p.author_id
  left join public.authorities au on au.id = c.authority_id
  where c.post_id = p_post_id;
  if v_row is null then
    perform public._err(404, 'NOT_FOUND', 'Complaint not found.');
  end if;
  return v_row;
end $$;

create function public.internal_record_complaint_forward(
  p_post_id uuid, p_admin_id uuid, p_success boolean, p_error text default null, p_provider_id text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_before public.complaints;
  v_author uuid;
begin
  select * into v_before from public.complaints where post_id = p_post_id for update;
  if p_success then
    update public.complaints set forward_status = 'forwarded', forwarded_at = now(), status = 'forwarded',
      forward_attempts = forward_attempts + 1, last_forward_error = null
    where post_id = p_post_id;
    select author_id into v_author from public.posts where id = p_post_id;
    perform public._notify(v_author, 'complaint', null, p_post_id, 'Complaint forwarded',
      'Your complaint was forwarded to the selected authority.', '/post/' || p_post_id);
  else
    update public.complaints set forward_status = 'failed', forward_attempts = forward_attempts + 1,
      last_forward_error = left(p_error, 500)
    where post_id = p_post_id;
  end if;
  perform public._log_admin(p_admin_id, case when p_success then 'complaint.forward_email' else 'complaint.forward_failed' end,
    'complaint', p_post_id::text, jsonb_build_object('forward_status', v_before.forward_status),
    jsonb_build_object('forward_status', case when p_success then 'forwarded' else 'failed' end, 'provider_id', p_provider_id),
    p_error);
end $$;

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create function public.admin_list_reports(
  p_status text default null, p_target_type text default null, p_reason text default null,
  p_limit int default 25, p_offset int default 0
) returns table (
  id uuid, reporter_username text, reported_user_id uuid, reported_username text, target_type text,
  target_id uuid, target_preview text, reason text, description text, status text, admin_action text,
  admin_note text, reviewed_by_username text, reviewed_at timestamptz, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_staff();
  return query
    select r.id, rp.username, r.reported_user_id, ru.username, r.target_type, r.target_id,
           case r.target_type
             when 'post' then (select left(caption, 140) from public.posts where posts.id = r.target_id)
             when 'comment' then (select left(body, 140) from public.comments where comments.id = r.target_id)
             when 'message' then (select left(body, 140) from public.messages where messages.id = r.target_id)
             else null end,
           r.reason, r.description, r.status, r.admin_action, r.admin_note, rv.username, r.reviewed_at,
           r.created_at, count(*) over ()
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles ru on ru.id = r.reported_user_id
    left join public.profiles rv on rv.id = r.reviewed_by
    where (p_status is null or r.status = p_status)
      and (p_target_type is null or r.target_type = p_target_type)
      and (p_reason is null or r.reason = p_reason)
    order by (r.reason = 'child_safety') desc, r.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.admin_review_report(p_report_id uuid, p_action text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_staff();
  v_r public.reports;
  v_status text;
begin
  select * into v_r from public.reports where id = p_report_id for update;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Report not found.');
  end if;
  if v_r.status in ('resolved', 'rejected') and p_action <> 'reopen' then
    perform public._err(409, 'ALREADY_CLOSED', 'This report is already closed.');
  end if;

  case p_action
    when 'under_review' then v_status := 'under_review';
    when 'reopen' then v_status := 'pending';
    when 'dismiss' then v_status := 'rejected';
    when 'resolve' then v_status := 'resolved';
    when 'remove_content' then
      v_status := 'resolved';
      if v_r.target_type = 'post' then
        perform public.admin_moderate_post(v_r.target_id, 'remove', coalesce(p_note, 'Removed after report: ' || v_r.reason));
      elsif v_r.target_type = 'comment' then
        update public.comments set status = 'removed' where id = v_r.target_id and status = 'visible';
        if found then
          update public.posts set comments_count = greatest(comments_count - 1, 0)
          where id = (select post_id from public.comments where id = v_r.target_id);
        end if;
      else
        perform public._err(422, 'INVALID_ACTION', 'Only posts and comments can be removed.');
      end if;
    when 'suspend_user' then
      v_status := 'resolved';
      if not public.is_admin(v_admin) then
        perform public._err(403, 'FORBIDDEN', 'Only admins can suspend users.');
      end if;
      perform public.admin_manage_user(v_r.reported_user_id, 'suspend', coalesce(p_note, 'Report: ' || v_r.reason));
    else
      perform public._err(422, 'INVALID_ACTION');
  end case;

  update public.reports set status = v_status, admin_action = p_action, admin_note = coalesce(p_note, admin_note),
    reviewed_by = v_admin, reviewed_at = now()
  where id = p_report_id;
  perform public._log_admin(v_admin, 'report.' || p_action, 'report', p_report_id::text,
    jsonb_build_object('status', v_r.status), jsonb_build_object('status', v_status), p_note);
  return jsonb_build_object('id', p_report_id, 'status', v_status);
end $$;

create function public.admin_safety_overview() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_staff();
  return jsonb_build_object(
    'open_by_reason', (select coalesce(jsonb_object_agg(reason, n), '{}') from
      (select reason, count(*) n from public.reports where status in ('pending', 'under_review') group by 1) s),
    'child_safety_queue', (select coalesce(jsonb_agg(x), '[]') from (
      select r.id, r.target_type, r.target_id, r.description, r.status, r.created_at, ru.username reported_username
      from public.reports r left join public.profiles ru on ru.id = r.reported_user_id
      where r.reason in ('child_safety', 'illegal') and r.status in ('pending', 'under_review')
      order by (r.reason = 'child_safety') desc, r.created_at limit 50) x),
    'flagged_posts', (select count(*) from public.posts where status = 'flagged'),
    'removed_posts_30d', (select count(*) from public.admin_logs where action = 'post.remove' and created_at > now() - interval '30 days'),
    'suspended_users', (select count(*) from public.profiles where status = 'suspended'),
    'banned_users', (select count(*) from public.profiles where status = 'banned'),
    'repeat_offenders', (select coalesce(jsonb_agg(x), '[]') from (
      select p.id, p.username, p.status, count(*) reports
      from public.reports r join public.profiles p on p.id = r.reported_user_id
      where r.created_at > now() - interval '30 days'
      group by p.id, p.username, p.status having count(*) >= 3
      order by count(*) desc limit 20) x)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Earnings: approveReward
-- ---------------------------------------------------------------------------

create function public.admin_list_earnings(
  p_status text default null, p_type text default null, p_user_id uuid default null,
  p_limit int default 25, p_offset int default 0
) returns table (
  id uuid, user_id uuid, username text, type text, post_id uuid, post_caption text, amount_paise bigint,
  status text, reference text, note text, reviewed_by_username text, reviewed_at timestamptz,
  created_at timestamptz, user_open_reports bigint, total_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  return query
    select e.id, e.user_id, u.username, e.type, e.post_id, left(p.caption, 80), e.amount_paise, e.status,
           e.reference, e.note, rv.username, e.reviewed_at, e.created_at,
           (select count(*) from public.reports r where r.reported_user_id = e.user_id and r.status in ('pending', 'under_review')),
           count(*) over ()
    from public.earnings e
    left join public.profiles u on u.id = e.user_id
    left join public.posts p on p.id = e.post_id
    left join public.profiles rv on rv.id = e.reviewed_by
    where (p_status is null or e.status = p_status)
      and (p_type is null or e.type = p_type)
      and (p_user_id is null or e.user_id = p_user_id)
    order by e.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.admin_review_earning(p_earning_id uuid, p_approve boolean, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_admin();
  v_e public.earnings;
  v_status text := case when p_approve then 'approved' else 'rejected' end;
begin
  select * into v_e from public.earnings where id = p_earning_id for update;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Earning not found.');
  end if;
  if v_e.status <> 'pending' then
    perform public._err(409, 'ALREADY_REVIEWED', 'This reward has already been reviewed.');
  end if;
  if not p_approve and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform public._err(422, 'REASON_REQUIRED', 'Please record a reason.');
  end if;
  update public.earnings set status = v_status, reviewed_by = v_admin, reviewed_at = now(),
    note = case when p_approve then note else coalesce(note, '') || ' — ' || p_reason end
  where id = p_earning_id;
  perform public._log_admin(v_admin, case when p_approve then 'earning.approve' else 'earning.reject' end,
    'earning', p_earning_id::text, jsonb_build_object('status', v_e.status, 'amount_paise', v_e.amount_paise),
    jsonb_build_object('status', v_status), p_reason);
  perform public._notify(v_e.user_id, 'reward', null, v_e.post_id,
    case when p_approve then 'Reward approved' else 'Reward not approved' end,
    '₹' || (v_e.amount_paise / 100.0)::numeric(12,2) || ' ' || replace(v_e.type, '_', ' ') || ' reward' ||
      case when p_approve then ' is now available.' else coalesce(': ' || p_reason, '.') end,
    '/earnings');
  return jsonb_build_object('id', p_earning_id, 'status', v_status);
end $$;

-- Reverse an approved (not yet withdrawn) reward, e.g. confirmed fraud.
create function public.admin_reverse_earning(p_earning_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_admin();
  v_e public.earnings;
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform public._err(422, 'REASON_REQUIRED', 'Please record a reason.');
  end if;
  select * into v_e from public.earnings where id = p_earning_id for update;
  if not found or v_e.status <> 'approved' then
    perform public._err(409, 'NOT_REVERSIBLE', 'Only approved rewards can be reversed.');
  end if;
  update public.earnings set status = 'reversed', reviewed_by = v_admin, reviewed_at = now(),
    note = coalesce(note, '') || ' — reversed: ' || p_reason
  where id = p_earning_id;
  perform public._log_admin(v_admin, 'earning.reverse', 'earning', p_earning_id::text,
    jsonb_build_object('status', 'approved'), jsonb_build_object('status', 'reversed'), p_reason);
  return jsonb_build_object('id', p_earning_id, 'status', 'reversed');
end $$;

create function public.admin_grant_bonus(p_user_id uuid, p_amount_paise bigint, p_reason text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_admin();
  v_id uuid;
begin
  if p_user_id = v_admin then
    perform public._err(422, 'SELF_ACTION', 'Admins cannot grant bonuses to themselves.');
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 or p_amount_paise > 10000000 then
    perform public._err(422, 'INVALID_AMOUNT', 'Enter an amount between ₹0.01 and ₹1,00,000.');
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform public._err(422, 'REASON_REQUIRED', 'Please record a reason.');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    perform public._err(404, 'NOT_FOUND', 'User not found.');
  end if;
  insert into public.earnings (user_id, type, amount_paise, status, reference, note, reviewed_by, reviewed_at)
  values (p_user_id, 'bonus', p_amount_paise, 'approved', 'bonus:' || gen_random_uuid(), btrim(p_reason), v_admin, now())
  returning id into v_id;
  perform public._log_admin(v_admin, 'earning.bonus', 'earning', v_id::text, null,
    jsonb_build_object('user_id', p_user_id, 'amount_paise', p_amount_paise), p_reason);
  perform public._notify(p_user_id, 'reward', null, null, 'Bonus received',
    '₹' || (p_amount_paise / 100.0)::numeric(12,2) || ' bonus: ' || btrim(p_reason), '/earnings');
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Withdrawals: processWithdrawal
-- ---------------------------------------------------------------------------

create function public.admin_list_withdrawals(p_status text default null, p_limit int default 25, p_offset int default 0)
returns table (
  id uuid, user_id uuid, username text, email text, amount_paise bigint, status text, payout_method text,
  payout_snapshot jsonb, available_paise bigint, admin_note text, payment_reference text,
  processed_by_username text, processed_at timestamptz, paid_at timestamptz, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  return query
    select w.id, w.user_id, u.username, au.email::text, w.amount_paise, w.status, w.payout_method,
           w.payout_snapshot, (public._wallet(w.user_id) ->> 'available_paise')::bigint,
           w.admin_note, w.payment_reference, pb.username, w.processed_at, w.paid_at, w.created_at,
           count(*) over ()
    from public.withdrawals w
    left join public.profiles u on u.id = w.user_id
    left join auth.users au on au.id = w.user_id
    left join public.profiles pb on pb.id = w.processed_by
    where (p_status is null or w.status = p_status)
    order by (w.status in ('requested', 'approved')) desc, w.created_at
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.admin_process_withdrawal(
  p_withdrawal_id uuid, p_action text, p_note text default null, p_payment_reference text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_admin();
  v_w public.withdrawals;
  v_to text;
begin
  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Withdrawal not found.');
  end if;
  if v_w.user_id = v_admin then
    perform public._err(422, 'SELF_ACTION', 'Another admin must process your own withdrawal.');
  end if;

  -- Allowed transitions: requested→approved|rejected, approved→paid|rejected.
  v_to := case
    when p_action = 'approve' and v_w.status = 'requested' then 'approved'
    when p_action = 'reject' and v_w.status in ('requested', 'approved') then 'rejected'
    when p_action = 'mark_paid' and v_w.status = 'approved' then 'paid'
    else null end;
  if v_to is null then
    perform public._err(409, 'INVALID_TRANSITION',
      'Cannot ' || replace(p_action, '_', ' ') || ' a withdrawal that is ' || v_w.status || '.');
  end if;
  if v_to = 'rejected' and char_length(btrim(coalesce(p_note, ''))) < 3 then
    perform public._err(422, 'REASON_REQUIRED', 'Please record a reason for the user.');
  end if;
  if v_to = 'paid' and char_length(btrim(coalesce(p_payment_reference, ''))) < 4 then
    perform public._err(422, 'REFERENCE_REQUIRED', 'Enter the UTR / transaction reference.');
  end if;

  update public.withdrawals set
    status = v_to,
    admin_note = coalesce(nullif(btrim(p_note), ''), admin_note),
    payment_reference = case when v_to = 'paid' then btrim(p_payment_reference) else payment_reference end,
    processed_by = v_admin, processed_at = now(),
    paid_at = case when v_to = 'paid' then now() else paid_at end
  where id = p_withdrawal_id;
  insert into public.withdrawal_events (withdrawal_id, from_status, to_status, actor_id, note)
  values (p_withdrawal_id, v_w.status, v_to, v_admin, coalesce(p_note, p_payment_reference));
  perform public._log_admin(v_admin, 'withdrawal.' || p_action, 'withdrawal', p_withdrawal_id::text,
    jsonb_build_object('status', v_w.status), jsonb_build_object('status', v_to, 'payment_reference', p_payment_reference),
    p_note);
  perform public._notify(v_w.user_id, 'withdrawal', null, null,
    case v_to when 'approved' then 'Withdrawal approved' when 'paid' then 'Withdrawal paid' else 'Withdrawal rejected' end,
    '₹' || (v_w.amount_paise / 100.0)::numeric(12,2) ||
      case v_to when 'approved' then ' will be paid shortly.'
                when 'paid' then ' sent. Ref: ' || btrim(p_payment_reference)
                else ' returned to your balance: ' || btrim(p_note) end,
    '/earnings');
  return jsonb_build_object('id', p_withdrawal_id, 'status', v_to);
end $$;

create function public.admin_withdrawal_events(p_withdrawal_id uuid) returns setof jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  return query
    select jsonb_build_object('from_status', e.from_status, 'to_status', e.to_status, 'note', e.note,
                              'created_at', e.created_at, 'actor_username', p.username)
    from public.withdrawal_events e left join public.profiles p on p.id = e.actor_id
    where e.withdrawal_id = p_withdrawal_id order by e.created_at;
end $$;

-- ---------------------------------------------------------------------------
-- Settings (validated per key; dangerous keys need explicit confirmation)
-- ---------------------------------------------------------------------------

create function public.admin_list_settings() returns setof public.app_settings
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  return query select * from public.app_settings order by key;
end $$;

create function public.admin_update_setting(p_key text, p_value jsonb, p_reason text default null, p_confirm boolean default false)
returns public.app_settings
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_admin();
  v_before public.app_settings;
  v_after public.app_settings;
  v_num numeric;
begin
  select * into v_before from public.app_settings where key = p_key for update;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Unknown setting.');
  end if;
  if v_before.is_dangerous and not coalesce(p_confirm, false) then
    perform public._err(428, 'CONFIRMATION_REQUIRED', 'This setting needs explicit confirmation.');
  end if;

  if jsonb_typeof(v_before.value) = 'boolean' then
    if jsonb_typeof(p_value) <> 'boolean' then
      perform public._err(422, 'INVALID_VALUE', 'Expected on/off.');
    end if;
  elsif jsonb_typeof(v_before.value) = 'number' then
    if jsonb_typeof(p_value) <> 'number' then
      perform public._err(422, 'INVALID_VALUE', 'Expected a number.');
    end if;
    v_num := (p_value #>> '{}')::numeric;
    if v_num <> trunc(v_num) or v_num < 0 then
      perform public._err(422, 'INVALID_VALUE', 'Expected a whole number ≥ 0.');
    end if;
    if (p_key like 'engagement.%_threshold' and (v_num < 1 or v_num > 1000000))
       or (p_key like 'rewards.%_paise' and v_num > 10000000)
       or (p_key = 'withdrawals.min_paise' and (v_num < 100 or v_num > public._setting_int('withdrawals.max_paise', 5000000)))
       or (p_key = 'withdrawals.max_paise' and (v_num < public._setting_int('withdrawals.min_paise', 10000) or v_num > 100000000))
       or (p_key like 'uploads.max_%_mb' and (v_num < 1 or v_num > 2048))
       or (p_key = 'uploads.max_video_seconds' and (v_num < 5 or v_num > 3600))
       or (p_key = 'uploads.max_posts_per_day' and (v_num < 1 or v_num > 1000))
       or (p_key = 'rewards.cta_daily_cap_per_post' and v_num > 100000) then
      perform public._err(422, 'OUT_OF_RANGE', 'That value is outside the allowed range.');
    end if;
  elsif jsonb_typeof(p_value) <> jsonb_typeof(v_before.value) then
    perform public._err(422, 'INVALID_VALUE');
  end if;

  update public.app_settings set value = p_value, updated_by = v_admin, updated_at = now()
  where key = p_key returning * into v_after;
  perform public._log_admin(v_admin, 'setting.update', 'setting', p_key,
    jsonb_build_object('value', v_before.value), jsonb_build_object('value', p_value), p_reason);
  return v_after;
end $$;

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------

create function public.admin_list_announcements() returns setof public.announcements
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_staff();
  return query select * from public.announcements order by created_at desc limit 200;
end $$;

create function public.admin_upsert_announcement(
  p_id uuid, p_title text, p_message text, p_image_url text default null,
  p_cta_label text default null, p_cta_url text default null,
  p_starts_at timestamptz default now(), p_ends_at timestamptz default null,
  p_is_active boolean default true, p_notify boolean default false
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_admin();
  v_before public.announcements;
  v_id uuid;
begin
  if p_id is not null then
    select * into v_before from public.announcements where id = p_id;
  end if;
  begin
    insert into public.announcements (id, title, message, image_url, cta_label, cta_url, starts_at, ends_at, is_active, created_by)
    values (coalesce(p_id, gen_random_uuid()), btrim(p_title), btrim(p_message), nullif(btrim(p_image_url), ''),
            nullif(btrim(p_cta_label), ''), nullif(btrim(p_cta_url), ''), coalesce(p_starts_at, now()), p_ends_at,
            coalesce(p_is_active, true), v_admin)
    on conflict (id) do update set title = excluded.title, message = excluded.message, image_url = excluded.image_url,
      cta_label = excluded.cta_label, cta_url = excluded.cta_url, starts_at = excluded.starts_at,
      ends_at = excluded.ends_at, is_active = excluded.is_active
    returning id into v_id;
  exception when check_violation then
    perform public._err(422, 'INVALID_ANNOUNCEMENT', 'Check the title, message, dates and links (https only).');
  end;
  perform public._log_admin(v_admin, case when v_before.id is null then 'announcement.create' else 'announcement.update' end,
    'announcement', v_id::text, to_jsonb(v_before), (select to_jsonb(a) from public.announcements a where a.id = v_id), null);

  if coalesce(p_notify, false) and coalesce(p_is_active, true) then
    insert into public.notifications (user_id, type, title, body, link)
    select id, 'announcement', left(btrim(p_title), 140), left(btrim(p_message), 500), nullif(btrim(p_cta_url), '')
    from public.profiles where status = 'active';
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Account deletion requests
-- ---------------------------------------------------------------------------

create function public.admin_list_deletion_requests(p_status text default null, p_limit int default 25, p_offset int default 0)
returns table (
  id uuid, user_id uuid, username text, email text, reason text, source text, status text, admin_note text,
  processed_by_username text, processed_at timestamptz, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  return query
    select d.id, d.user_id, p.username, d.email, d.reason, d.source, d.status, d.admin_note, pb.username,
           d.processed_at, d.created_at, count(*) over ()
    from public.account_deletion_requests d
    left join public.profiles p on p.id = d.user_id
    left join public.profiles pb on pb.id = d.processed_by
    where (p_status is null or d.status = p_status)
    order by (d.status in ('pending', 'processing')) desc, d.created_at
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- 'complete' permanently deletes the auth user (cascading to profile, content, social
-- graph, messages). Financial and audit rows are retained with user_id = null.
create function public.admin_process_deletion_request(p_request_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_admin();
  v_d public.account_deletion_requests;
  v_status text;
begin
  select * into v_d from public.account_deletion_requests where id = p_request_id for update;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Request not found.');
  end if;
  if v_d.status in ('completed', 'rejected') then
    perform public._err(409, 'ALREADY_CLOSED', 'This request is already closed.');
  end if;
  if v_d.user_id = v_admin then
    perform public._err(422, 'SELF_ACTION', 'Another admin must process your own deletion request.');
  end if;

  case p_action
    when 'processing' then v_status := 'processing';
    when 'reject' then
      if char_length(btrim(coalesce(p_note, ''))) < 3 then
        perform public._err(422, 'REASON_REQUIRED', 'Please record a reason.');
      end if;
      v_status := 'rejected';
    when 'complete' then
      if exists (select 1 from public.withdrawals where user_id = v_d.user_id and status in ('requested', 'approved')) then
        perform public._err(409, 'WITHDRAWAL_IN_PROGRESS', 'Resolve the user''s open withdrawal first.');
      end if;
      v_status := 'completed';
      if v_d.user_id is not null then
        delete from auth.users where id = v_d.user_id;
      end if;
    else
      perform public._err(422, 'INVALID_ACTION');
  end case;

  update public.account_deletion_requests set status = v_status, admin_note = coalesce(p_note, admin_note),
    processed_by = v_admin, processed_at = now(),
    email = case when v_status = 'completed' then 'deleted-' || left(id::text, 8) || '@redacted.invalid' else email end
  where id = p_request_id;
  perform public._log_admin(v_admin, 'deletion.' || p_action, 'deletion_request', p_request_id::text,
    jsonb_build_object('status', v_d.status), jsonb_build_object('status', v_status), p_note);
  return jsonb_build_object('id', p_request_id, 'status', v_status);
end $$;

-- In-app request by a signed-in user (session already proves email ownership).
create function public.request_my_account_deletion(p_reason text default null, p_source text default 'in_app') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    perform public._err(401, 'AUTH_REQUIRED', 'Please sign in to continue.');
  end if;
  perform public._rate_limit('delete-req:' || v_uid, 3, 86400);
  select id into v_id from public.account_deletion_requests where user_id = v_uid and status in ('pending', 'processing');
  if v_id is not null then
    return v_id;
  end if;
  insert into public.account_deletion_requests (user_id, email, reason, source)
  values (v_uid, (select email from auth.users where id = v_uid), left(p_reason, 1000),
          case when p_source in ('web', 'android', 'in_app') then p_source else 'in_app' end)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Business inquiries (admin)
-- ---------------------------------------------------------------------------

create function public.admin_list_inquiries(p_status text default null, p_type text default null, p_limit int default 25, p_offset int default 0)
returns table (
  id uuid, username text, type text, business_name text, contact_name text, phone text, email text,
  message text, status text, admin_note text, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_staff();
  return query
    select i.id, p.username, i.type, i.business_name, i.contact_name, i.phone, i.email, i.message, i.status,
           i.admin_note, i.created_at, count(*) over ()
    from public.business_inquiries i left join public.profiles p on p.id = i.user_id
    where (p_status is null or i.status = p_status) and (p_type is null or i.type = p_type)
    order by i.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.admin_update_inquiry(p_id uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public._require_staff();
  v_before text;
begin
  if p_status not in ('new', 'in_progress', 'closed') then
    perform public._err(422, 'INVALID_STATUS');
  end if;
  select status into v_before from public.business_inquiries where id = p_id for update;
  if not found then
    perform public._err(404, 'NOT_FOUND', 'Inquiry not found.');
  end if;
  update public.business_inquiries set status = p_status, admin_note = coalesce(p_note, admin_note) where id = p_id;
  perform public._log_admin(v_admin, 'inquiry.update', 'inquiry', p_id::text,
    jsonb_build_object('status', v_before), jsonb_build_object('status', p_status), p_note);
end $$;

-- ---------------------------------------------------------------------------
-- Audit log (read-only)
-- ---------------------------------------------------------------------------

create function public.admin_list_logs(
  p_action text default null, p_target_type text default null, p_admin_id uuid default null,
  p_limit int default 50, p_offset int default 0
) returns table (
  id bigint, admin_id uuid, admin_username text, action text, target_type text, target_id text,
  previous_state jsonb, new_state jsonb, reason text, ip text, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public._require_admin();
  return query
    select l.id, l.admin_id, p.username, l.action, l.target_type, l.target_id, l.previous_state, l.new_state,
           l.reason, l.ip, l.created_at, count(*) over ()
    from public.admin_logs l left join public.profiles p on p.id = l.admin_id
    where (p_action is null or l.action like p_action || '%')
      and (p_target_type is null or l.target_type = p_target_type)
      and (p_admin_id is null or l.admin_id = p_admin_id)
    order by l.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;
