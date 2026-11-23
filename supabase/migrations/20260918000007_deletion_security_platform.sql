-- OJASSS — account-deletion OTP storage, access control lockdown, storage, realtime, reference data.

-- ---------------------------------------------------------------------------
-- Account deletion (called only by the two edge functions via service_role).
-- Hashing/HMAC happens in the edge function with DELETION_FLOW_SECRET; the
-- database only ever sees HMAC digests.
-- ---------------------------------------------------------------------------

create function public.internal_deletion_start(p_email text, p_email_hash text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
-- Returns { allowed, user_id }. The caller must respond identically whether or not
-- user_id is null (no account enumeration).
declare v_user uuid;
begin
  if not public._rate_allow('del-email:' || p_email_hash, 3, 3600)
     or (p_ip is not null and not public._rate_allow('del-ip:' || p_ip, 10, 3600)) then
    return jsonb_build_object('allowed', false);
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  return jsonb_build_object('allowed', true, 'user_id', v_user);
end $$;

create function public.internal_deletion_store(
  p_id uuid, p_email_hash text, p_code_hmac text, p_user_id uuid, p_email text, p_reason text, p_source text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Invalidate earlier unconsumed codes for this email: only the newest code works.
  update public.deletion_verifications set consumed_at = now()
  where email_hash = p_email_hash and consumed_at is null;
  insert into public.deletion_verifications (id, email_hash, code_hmac, user_id, email, reason, source, expires_at)
  values (p_id, p_email_hash, p_code_hmac, p_user_id,
          case when p_user_id is not null then lower(btrim(p_email)) end,
          left(p_reason, 1000),
          case when p_source in ('web', 'android', 'in_app') then p_source else 'web' end,
          now() + interval '15 minutes');
end $$;

-- Records an attempt BEFORE comparison (committed even if the code is wrong) and returns the
-- stored digest, or null when the verification is unknown / expired / consumed / locked.
create function public.internal_deletion_attempt(p_id uuid, p_email_hash text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.deletion_verifications;
begin
  update public.deletion_verifications set attempts = attempts + 1
  where id = p_id and email_hash = p_email_hash and consumed_at is null and expires_at > now() and attempts < 5
  returning * into v_row;
  if not found then
    return null;
  end if;
  return jsonb_build_object('code_hmac', v_row.code_hmac, 'attempts', v_row.attempts);
end $$;

-- Single use: the consumed_at guard makes a concurrent second verification fail.
create function public.internal_deletion_consume(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.deletion_verifications;
  v_request uuid;
begin
  update public.deletion_verifications set consumed_at = now()
  where id = p_id and consumed_at is null and expires_at > now()
  returning * into v_row;
  if not found then
    return jsonb_build_object('ok', false);
  end if;
  if v_row.user_id is not null and exists (select 1 from auth.users where id = v_row.user_id) then
    select id into v_request from public.account_deletion_requests
    where user_id = v_row.user_id and status in ('pending', 'processing');
    if v_request is null then
      insert into public.account_deletion_requests (user_id, email, reason, source)
      values (v_row.user_id, v_row.email, v_row.reason, v_row.source)
      returning id into v_request;
    end if;
  end if;
  -- Identical response shape whether or not an account existed.
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- Lockdown. Supabase grants ALL on new objects to anon/authenticated by default;
-- revoke everything and grant back only what clients need.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- RLS on every table (defense in depth; direct table access is only granted below).
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Direct reads clients need (realtime subscriptions require SELECT + RLS).
grant select on public.messages to authenticated;
create policy messages_participants on public.messages for select to authenticated using (
  exists (select 1 from public.conversations c
          where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b))
);

grant select on public.conversations to authenticated;
create policy conversations_participants on public.conversations for select to authenticated
  using (auth.uid() in (user_a, user_b));

grant select on public.notifications to authenticated;
create policy notifications_own on public.notifications for select to authenticated
  using (user_id = auth.uid());

grant select on public.cta_types to anon, authenticated;
create policy cta_types_active on public.cta_types for select to anon, authenticated using (is_active);

-- Service role bypasses RLS in Supabase; policies here make that explicit for other environments.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create policy service_all on public.%I for all to service_role using (true) with check (true)', t);
  end loop;
end $$;

-- Function allow-list. Anything not listed is unreachable from clients.
grant execute on function
  public.feed(text, int, int, timestamptz, text, text, text),
  public.trending_posts(text, text, text, int, int, int),
  public.get_post(uuid),
  public.user_posts(uuid, text, int, int),
  public.search_posts(text, text, text, text, int, int),
  public.search_users(text, int, int),
  public.popular_creators(int),
  public.get_profile(text),
  public.list_follows(uuid, text, int, int),
  public.list_comments(uuid, timestamptz, int),
  public.record_view(uuid),
  public.record_share(uuid),
  public.record_cta_click(uuid),
  public.active_announcements(),
  public.list_authorities(),
  public.public_settings()
to anon, authenticated;

grant execute on function
  public.is_admin(uuid),
  public.is_staff(uuid),
  public.get_me(),
  public.update_profile(text, text, text, text, text),
  public.complete_onboarding(text, text, text),
  public.update_post(uuid, text, text, text),
  public.delete_post(uuid),
  public.my_bookmarks(int, int),
  public.toggle_engagement(uuid, text),
  public.toggle_follow(uuid),
  public.toggle_bookmark(uuid),
  public.block_user(uuid),
  public.unblock_user(uuid),
  public.my_blocks(),
  public.add_comment(uuid, text),
  public.delete_comment(uuid),
  public.create_report(text, uuid, text, text),
  public.get_or_create_conversation(uuid),
  public.send_message(uuid, text),
  public.list_conversations(int, int),
  public.get_conversation(uuid),
  public.mark_conversation_read(uuid),
  public.list_notifications(timestamptz, int, boolean),
  public.mark_notifications_read(uuid[]),
  public.unread_counts(),
  public.touch_presence(),
  public.register_push_token(text, text),
  public.unregister_push_token(text),
  public.submit_business_inquiry(text, text, text, text, text, text),
  public.my_business_inquiries(),
  public.get_wallet(),
  public.list_my_earnings(int, int, text),
  public.earnings_series(text, int),
  public.get_my_payout_detail(),
  public.upsert_payout_detail(text, text, text, text, text, text),
  public.request_withdrawal(bigint, text),
  public.cancel_withdrawal(uuid),
  public.list_my_withdrawals(int, int),
  public.request_my_account_deletion(text, text),
  -- Admin functions authorize internally against profiles.role.
  public.admin_dashboard(timestamptz, timestamptz),
  public.admin_timeseries(text, timestamptz, timestamptz, text),
  public.admin_breakdowns(timestamptz, timestamptz),
  public.admin_list_users(text, text, text, int, int),
  public.admin_user_detail(uuid),
  public.admin_manage_user(uuid, text, text, text),
  public.admin_list_posts(text, text, text, text, int, int),
  public.admin_moderate_post(uuid, text, text),
  public.admin_list_complaints(text, text, text, int, int),
  public.admin_complaint_detail(uuid),
  public.admin_update_complaint(uuid, text, text, uuid, text),
  public.admin_add_complaint_note(uuid, text),
  public.admin_list_authorities(),
  public.admin_upsert_authority(uuid, text, text, text, text, boolean),
  public.admin_list_reports(text, text, text, int, int),
  public.admin_review_report(uuid, text, text),
  public.admin_safety_overview(),
  public.admin_list_earnings(text, text, uuid, int, int),
  public.admin_review_earning(uuid, boolean, text),
  public.admin_reverse_earning(uuid, text),
  public.admin_grant_bonus(uuid, bigint, text),
  public.admin_list_withdrawals(text, int, int),
  public.admin_process_withdrawal(uuid, text, text, text),
  public.admin_withdrawal_events(uuid),
  public.admin_list_settings(),
  public.admin_update_setting(text, jsonb, text, boolean),
  public.admin_list_announcements(),
  public.admin_upsert_announcement(uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, boolean),
  public.admin_list_deletion_requests(text, int, int),
  public.admin_process_deletion_request(uuid, text, text),
  public.admin_list_inquiries(text, text, int, int),
  public.admin_update_inquiry(uuid, text, text),
  public.admin_list_logs(text, text, uuid, int, int)
to authenticated;

-- ---------------------------------------------------------------------------
-- Storage (Supabase only). Uploads go to <uid>/<file>; the create-post edge
-- function verifies magic bytes before a post can reference an object.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('media', 'media', true, 209715200,
        array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']),
      ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    execute $p$
      create policy "media: owner uploads into own folder" on storage.objects for insert to authenticated
      with check (bucket_id in ('media', 'avatars')
                  and (storage.foldername(name))[1] = auth.uid()::text
                  and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,160}$'
                  and lower(storage.extension(name)) in ('mp4', 'mov', 'webm', 'jpg', 'jpeg', 'png', 'webp'))
    $p$;
    execute $p$
      create policy "media: owner deletes own objects" on storage.objects for delete to authenticated
      using (bucket_id in ('media', 'avatars') and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime (Supabase only)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reference configuration (admin-editable at runtime; not user data)
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value, description, is_public, is_dangerous) values
  ('engagement.hot_threshold', '100', 'HOT reactions a post needs before SPEAK counts toward VIRAL eligibility', true, true),
  ('engagement.speak_threshold', '50', 'SPEAK reactions needed (with HOT) to unlock VIRAL voting', true, true),
  ('engagement.viral_threshold', '25', 'VIRAL votes that make a post viral and trigger the creator reward', true, true),
  ('rewards.viral_paise', '5000', 'Viral reward in paise (₹50.00)', true, true),
  ('rewards.cta_click_paise', '50', 'Reward per eligible unique CTA click in paise (₹0.50)', true, true),
  ('rewards.cta_daily_cap_per_post', '200', 'Maximum rewarded CTA clicks per post per 24h', false, true),
  ('rewards.referral_paise', '1000', 'Referral reward in paise (₹10.00), always admin-reviewed', true, true),
  ('rewards.auto_approve', 'false', 'Approve viral/CTA rewards automatically (referrals are always reviewed)', false, true),
  ('withdrawals.min_paise', '10000', 'Minimum withdrawal in paise (₹100.00)', true, true),
  ('withdrawals.max_paise', '5000000', 'Maximum single withdrawal in paise (₹50,000.00)', true, true),
  ('platform.maintenance_mode', 'false', 'Pause posting, engagement and messaging for non-staff users', true, true),
  ('uploads.max_video_mb', '100', 'Maximum video upload size in MB', true, false),
  ('uploads.max_image_mb', '10', 'Maximum poster upload size in MB', true, false),
  ('uploads.max_video_seconds', '180', 'Maximum video duration in seconds', true, false),
  ('uploads.max_posts_per_day', '30', 'Maximum posts per creator per 24h', false, false),
  ('content.require_review', 'false', 'Hold all new posts for moderator approval', false, true),
  ('content.complaints_require_review', 'true', 'Hold Public Complaint posts for moderator approval', true, false)
on conflict (key) do nothing;

insert into public.cta_types (id, label, icon, target_kind, reward_eligible, sort_order) values
  ('buy_now', 'Buy Now', 'shopping-bag', 'url', true, 1),
  ('visit_website', 'Visit Website', 'globe', 'url', true, 2),
  ('apply_now', 'Apply Now', 'briefcase', 'url', true, 3),
  ('get_quote', 'Get Quote', 'file-text', 'url', true, 4),
  ('learn_more', 'Learn More', 'info', 'url', true, 5),
  ('whatsapp', 'WhatsApp', 'message-circle', 'whatsapp', true, 6),
  ('call', 'Call', 'phone', 'phone', true, 7),
  ('contact', 'Contact', 'mail', 'email', true, 8)
on conflict (id) do nothing;
