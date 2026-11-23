-- OJASSS — earnings, CTA rewards, payout details, withdrawals.
-- All money is integer paise. Every balance is derived from auditable rows; there is
-- no mutable "balance" column a bug or a client could corrupt.

create function public._wallet(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with e as (
    select
      coalesce(sum(amount_paise) filter (where status = 'approved'), 0) as approved,
      coalesce(sum(amount_paise) filter (where status = 'pending'), 0) as pending,
      coalesce(sum(amount_paise) filter (where status in ('approved', 'pending')
                                          and created_at >= date_trunc('month', now())), 0) as this_month
    from public.earnings where user_id = p_uid
  ), w as (
    select
      coalesce(sum(amount_paise) filter (where status = 'paid'), 0) as withdrawn,
      coalesce(sum(amount_paise) filter (where status in ('requested', 'approved')), 0) as in_process
    from public.withdrawals where user_id = p_uid
  )
  select jsonb_build_object(
    'available_paise', e.approved - w.withdrawn - w.in_process,
    'pending_paise', e.pending,
    'lifetime_paise', e.approved,
    'withdrawn_paise', w.withdrawn,
    'in_process_paise', w.in_process,
    'this_month_paise', e.this_month,
    'min_withdrawal_paise', public._setting_int('withdrawals.min_paise', 10000),
    'max_withdrawal_paise', public._setting_int('withdrawals.max_paise', 5000000)
  ) from e, w
$$;

create function public.get_wallet() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  return public._wallet(v_uid);
end $$;

create function public.list_my_earnings(p_limit int default 30, p_offset int default 0, p_type text default null)
returns setof jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  return query
    select jsonb_build_object(
      'id', e.id, 'type', e.type, 'amount_paise', e.amount_paise, 'status', e.status,
      'reference', left(e.id::text, 8), 'note', e.note, 'created_at', e.created_at, 'reviewed_at', e.reviewed_at,
      'post', case when p.id is null then null else jsonb_build_object(
        'id', p.id, 'caption', left(p.caption, 80), 'thumbnail_path', p.thumbnail_path, 'kind', p.kind) end)
    from public.earnings e
    left join public.posts p on p.id = e.post_id
    where e.user_id = v_uid and (p_type is null or e.type = p_type)
    order by e.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- Daily/weekly/monthly series of approved + pending earnings for charts.
create function public.earnings_series(p_bucket text default 'day', p_periods int default 30)
returns table (bucket_start date, approved_paise bigint, pending_paise bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_step interval;
  v_periods int := least(greatest(coalesce(p_periods, 30), 1), 366);
begin
  if p_bucket not in ('day', 'week', 'month') then
    perform public._err(422, 'INVALID_BUCKET');
  end if;
  v_step := ('1 ' || p_bucket)::interval;
  return query
    with buckets as (
      select generate_series(
        date_trunc(p_bucket, now()) - v_step * (v_periods - 1),
        date_trunc(p_bucket, now()), v_step) as b
    )
    select b.b::date,
      coalesce(sum(e.amount_paise) filter (where e.status = 'approved'), 0)::bigint,
      coalesce(sum(e.amount_paise) filter (where e.status = 'pending'), 0)::bigint
    from buckets b
    left join public.earnings e on e.user_id = v_uid and date_trunc(p_bucket, e.created_at) = b.b
    group by b.b order by b.b;
end $$;

-- ---------------------------------------------------------------------------
-- CTA clicks. Anyone can click; only signed-in, non-author, first-time clickers on
-- reward-eligible CTAs generate a (pending) reward, capped per post per day.
-- ---------------------------------------------------------------------------

create function public.record_cta_click(p_post_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_post public.posts;
  v_cta public.cta_types;
  v_author_status text;
  v_rewarded boolean := false;
  v_today_rewards int;
  v_target text;
begin
  select * into v_post from public.posts where id = p_post_id;
  if not found or v_post.status <> 'published' or v_post.cta_type is null then
    perform public._err(404, 'NOT_FOUND', 'This link is not available.');
  end if;
  select * into v_cta from public.cta_types where id = v_post.cta_type;
  select status into v_author_status from public.profiles where id = v_post.author_id;

  if v_uid is not null then
    perform public._rate_limit('cta:' || v_uid, 30, 60);
  end if;

  update public.posts set cta_clicks_count = cta_clicks_count + 1 where id = p_post_id;

  if v_uid is not null and v_uid <> v_post.author_id and v_cta.reward_eligible and v_author_status = 'active'
     and not public._is_blocked(v_uid, v_post.author_id)
     and exists (select 1 from public.profiles where id = v_uid and status = 'active')
     and not exists (select 1 from public.cta_clicks where post_id = p_post_id and user_id = v_uid and rewarded) then
    select count(*) into v_today_rewards from public.cta_clicks
    where post_id = p_post_id and rewarded and created_at > now() - interval '1 day';
    if v_today_rewards < public._setting_int('rewards.cta_daily_cap_per_post', 200) then
      begin
        insert into public.cta_clicks (post_id, user_id, rewarded) values (p_post_id, v_uid, true);
        insert into public.earnings (user_id, type, post_id, amount_paise, status, reference, note)
        values (v_post.author_id, 'cta_click', p_post_id, public._setting_int('rewards.cta_click_paise', 50),
                case when public._setting_bool('rewards.auto_approve', false) then 'approved' else 'pending' end,
                'cta:' || p_post_id || ':' || v_uid, v_cta.label || ' click')
        on conflict (reference) do nothing;
        v_rewarded := true;
      exception when unique_violation then
        v_rewarded := false;
      end;
    end if;
  end if;
  if not v_rewarded then
    insert into public.cta_clicks (post_id, user_id, rewarded) values (p_post_id, v_uid, false);
  end if;

  v_target := case v_cta.target_kind
    when 'url' then v_post.cta_url
    when 'phone' then 'tel:' || v_post.cta_url
    when 'whatsapp' then 'https://wa.me/' || regexp_replace(v_post.cta_url, '[^0-9]', '', 'g')
    when 'email' then 'mailto:' || v_post.cta_url
  end;
  return jsonb_build_object('url', v_target, 'kind', v_cta.target_kind);
end $$;

-- ---------------------------------------------------------------------------
-- Payout details (owner sees a masked view; full values are admin/service only)
-- ---------------------------------------------------------------------------

create function public._mask_payout(d public.payout_details) returns text
language sql immutable as $$
  select case d.method
    when 'upi' then regexp_replace(split_part(d.upi_id, '@', 1), '^(.{2}).*$', '\1****') || '@' || split_part(d.upi_id, '@', 2)
    else coalesce(d.bank_name || ' ', '') || '••••' || right(d.account_number, 4) || ' (' || d.ifsc || ')'
  end
$$;

create function public.get_my_payout_detail() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_d public.payout_details;
begin
  select * into v_d from public.payout_details where user_id = v_uid;
  if not found then return null; end if;
  return jsonb_build_object('method', v_d.method, 'masked', public._mask_payout(v_d),
                            'account_holder_name', v_d.account_holder_name, 'updated_at', v_d.updated_at);
end $$;

create function public.upsert_payout_detail(
  p_method text, p_upi_id text default null, p_account_holder_name text default null,
  p_account_number text default null, p_ifsc text default null, p_bank_name text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  perform public._rate_limit('payout-detail:' || v_uid, 5, 86400);
  if exists (select 1 from public.withdrawals where user_id = v_uid and status in ('requested', 'approved')) then
    perform public._err(409, 'WITHDRAWAL_IN_PROGRESS', 'Payout details cannot change while a withdrawal is in progress.');
  end if;
  begin
    insert into public.payout_details (user_id, method, upi_id, account_holder_name, account_number, ifsc, bank_name)
    values (
      v_uid, p_method,
      case when p_method = 'upi' then lower(btrim(p_upi_id)) end,
      nullif(btrim(p_account_holder_name), ''),
      case when p_method = 'bank' then regexp_replace(coalesce(p_account_number, ''), '\s', '', 'g') end,
      case when p_method = 'bank' then upper(btrim(p_ifsc)) end,
      case when p_method = 'bank' then nullif(btrim(p_bank_name), '') end)
    on conflict (user_id) do update set
      method = excluded.method, upi_id = excluded.upi_id, account_holder_name = excluded.account_holder_name,
      account_number = excluded.account_number, ifsc = excluded.ifsc, bank_name = excluded.bank_name,
      updated_at = now();
  exception when check_violation then
    perform public._err(422, 'INVALID_PAYOUT_DETAILS', 'Please check your UPI ID or bank details.');
  end;
  return public.get_my_payout_detail();
end $$;

-- ---------------------------------------------------------------------------
-- Withdrawals: requestWithdrawal
-- ---------------------------------------------------------------------------

create function public.request_withdrawal(p_amount_paise bigint, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_existing public.withdrawals;
  v_detail public.payout_details;
  v_wallet jsonb;
  v_min bigint := public._setting_int('withdrawals.min_paise', 10000);
  v_max bigint := public._setting_int('withdrawals.max_paise', 5000000);
  v_w public.withdrawals;
begin
  perform public._assert_not_maintenance();
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 80 then
    perform public._err(422, 'INVALID_REQUEST');
  end if;

  -- Serialise all withdrawal requests for this user.
  perform 1 from public.profiles where id = v_uid for update;

  -- Idempotent replay: same key returns the original request, never a second one.
  select * into v_existing from public.withdrawals where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', v_existing.id, 'status', v_existing.status,
                              'amount_paise', v_existing.amount_paise, 'replayed', true);
  end if;

  perform public._rate_limit('withdraw:' || v_uid, 5, 86400);

  if p_amount_paise is null or p_amount_paise <= 0 then
    perform public._err(422, 'INVALID_AMOUNT', 'Enter a valid amount.');
  end if;
  if p_amount_paise < v_min then
    perform public._err(422, 'BELOW_MINIMUM', 'The minimum withdrawal is ₹' || (v_min / 100.0)::numeric(12,2) || '.');
  end if;
  if p_amount_paise > v_max then
    perform public._err(422, 'ABOVE_MAXIMUM', 'The maximum withdrawal is ₹' || (v_max / 100.0)::numeric(12,2) || '.');
  end if;
  if exists (select 1 from public.withdrawals where user_id = v_uid and status in ('requested', 'approved')) then
    perform public._err(409, 'WITHDRAWAL_IN_PROGRESS', 'You already have a withdrawal in progress.');
  end if;

  select * into v_detail from public.payout_details where user_id = v_uid;
  if not found then
    perform public._err(422, 'PAYOUT_DETAILS_REQUIRED', 'Add your UPI or bank details first.');
  end if;

  v_wallet := public._wallet(v_uid);
  if p_amount_paise > (v_wallet ->> 'available_paise')::bigint then
    perform public._err(422, 'INSUFFICIENT_BALANCE', 'This amount is more than your available balance.');
  end if;

  insert into public.withdrawals (user_id, amount_paise, payout_method, payout_masked, payout_snapshot, idempotency_key)
  values (v_uid, p_amount_paise, v_detail.method, public._mask_payout(v_detail),
          to_jsonb(v_detail) - 'user_id' - 'updated_at', p_idempotency_key)
  returning * into v_w;
  insert into public.withdrawal_events (withdrawal_id, from_status, to_status, actor_id, note)
  values (v_w.id, null, 'requested', v_uid, 'Requested by user');
  perform public._notify(v_uid, 'withdrawal', null, null, 'Withdrawal requested',
    '₹' || (p_amount_paise / 100.0)::numeric(12,2) || ' is being reviewed.', '/earnings');

  return jsonb_build_object('id', v_w.id, 'status', v_w.status, 'amount_paise', v_w.amount_paise, 'replayed', false);
end $$;

create function public.cancel_withdrawal(p_withdrawal_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  update public.withdrawals set status = 'cancelled', processed_at = now()
  where id = p_withdrawal_id and user_id = v_uid and status = 'requested';
  if not found then
    perform public._err(409, 'CANNOT_CANCEL', 'Only requests awaiting review can be cancelled.');
  end if;
  insert into public.withdrawal_events (withdrawal_id, from_status, to_status, actor_id, note)
  values (p_withdrawal_id, 'requested', 'cancelled', v_uid, 'Cancelled by user');
end $$;

create function public.list_my_withdrawals(p_limit int default 30, p_offset int default 0) returns setof jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  return query
    select jsonb_build_object(
      'id', w.id, 'amount_paise', w.amount_paise, 'status', w.status, 'payout_method', w.payout_method,
      'payout_masked', w.payout_masked, 'payment_reference', w.payment_reference,
      'note', case when w.status = 'rejected' then w.admin_note end,
      'created_at', w.created_at, 'processed_at', w.processed_at, 'paid_at', w.paid_at)
    from public.withdrawals w
    where w.user_id = v_uid
    order by w.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;
