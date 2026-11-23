-- OJASSS — messaging, notifications, announcements, push tokens, business inquiries.

-- ---------------------------------------------------------------------------
-- Messaging (1:1). Participants only; blocked pairs cannot start or continue chats.
-- ---------------------------------------------------------------------------

create function public.get_or_create_conversation(p_other uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_a uuid := least(v_uid, p_other);
  v_b uuid := greatest(v_uid, p_other);
  v_id uuid;
begin
  if p_other = v_uid then
    perform public._err(422, 'SELF_MESSAGE', 'You cannot message yourself.');
  end if;
  if not exists (select 1 from public.profiles where id = p_other and status = 'active') then
    perform public._err(404, 'NOT_FOUND', 'This profile is not available.');
  end if;
  if public._is_blocked(v_uid, p_other) then
    perform public._err(403, 'BLOCKED', 'You cannot message this user.');
  end if;
  insert into public.conversations (user_a, user_b) values (v_a, v_b) on conflict (user_a, user_b) do nothing;
  select id into v_id from public.conversations where user_a = v_a and user_b = v_b;
  return v_id;
end $$;

create function public.send_message(p_conversation_id uuid, p_body text) returns public.messages
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
    perform public._err(422, 'INVALID_MESSAGE', 'Messages must be 1–2000 characters.');
  end if;
  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if not found or v_uid not in (v_conv.user_a, v_conv.user_b) then
    perform public._err(404, 'NOT_FOUND', 'Conversation not found.');
  end if;
  v_other := case when v_conv.user_a = v_uid then v_conv.user_b else v_conv.user_a end;
  if public._is_blocked(v_uid, v_other) then
    perform public._err(403, 'BLOCKED', 'You cannot message this user.');
  end if;
  if not exists (select 1 from public.profiles where id = v_other and status = 'active') then
    perform public._err(403, 'RECIPIENT_UNAVAILABLE', 'This user cannot receive messages right now.');
  end if;
  perform public._rate_limit('msg:' || v_uid, 30, 60);
  perform public._rate_limit('msg-day:' || v_uid, 1000, 86400);

  insert into public.messages (conversation_id, sender_id, body) values (p_conversation_id, v_uid, v_body)
  returning * into v_msg;
  update public.conversations set last_message_at = v_msg.created_at, last_message_preview = left(v_body, 120)
  where id = p_conversation_id;

  -- One unread "message" notification per sender at a time (drives push; avoids flooding).
  if not exists (select 1 from public.notifications
                 where user_id = v_other and type = 'message' and actor_id = v_uid and read_at is null) then
    perform public._notify(v_other, 'message', v_uid, null,
      'New message from @' || (select username from public.profiles where id = v_uid),
      left(v_body, 120), '/messages/' || p_conversation_id);
  end if;
  return v_msg;
end $$;

create function public.list_conversations(p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, other_id uuid, other_username text, other_display_name text, other_avatar_path text,
  other_verified boolean, last_message_at timestamptz, last_message_preview text, unread_count int,
  is_blocked boolean
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  return query
    select c.id, o.id, o.username, o.display_name, o.avatar_path, o.is_verified,
           c.last_message_at, c.last_message_preview,
           (select count(*)::int from public.messages m
             where m.conversation_id = c.id and m.sender_id <> v_uid and m.read_at is null),
           public._is_blocked(v_uid, o.id)
    from public.conversations c
    join public.profiles o on o.id = case when c.user_a = v_uid then c.user_b else c.user_a end
    where v_uid in (c.user_a, c.user_b)
      and c.last_message_at is not null
      and not exists (select 1 from public.blocks where blocker_id = o.id and blocked_id = v_uid)
    order by c.last_message_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

create function public.get_conversation(p_conversation_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_conv public.conversations;
  v_other public.profiles;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found or v_uid not in (v_conv.user_a, v_conv.user_b) then
    perform public._err(404, 'NOT_FOUND', 'Conversation not found.');
  end if;
  select * into v_other from public.profiles
  where id = case when v_conv.user_a = v_uid then v_conv.user_b else v_conv.user_a end;
  return jsonb_build_object('id', v_conv.id, 'other', public._profile_json(v_other, v_uid),
                            'can_message', not public._is_blocked(v_uid, v_other.id) and v_other.status = 'active');
end $$;

create function public.mark_conversation_read(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  if not exists (select 1 from public.conversations where id = p_conversation_id and v_uid in (user_a, user_b)) then
    perform public._err(404, 'NOT_FOUND', 'Conversation not found.');
  end if;
  update public.messages set read_at = now()
  where conversation_id = p_conversation_id and sender_id <> v_uid and read_at is null;
  update public.notifications set read_at = now()
  where user_id = v_uid and type = 'message' and read_at is null and link = '/messages/' || p_conversation_id;
end $$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create function public.list_notifications(p_before timestamptz default null, p_limit int default 30, p_unread_only boolean default false)
returns setof jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  return query
    select jsonb_build_object(
      'id', n.id, 'type', n.type, 'title', n.title, 'body', n.body, 'link', n.link,
      'post_id', n.post_id, 'read_at', n.read_at, 'created_at', n.created_at,
      'actor', case when a.id is null then null else jsonb_build_object(
        'id', a.id, 'username', a.username, 'display_name', a.display_name, 'avatar_path', a.avatar_path) end,
      'post_thumbnail_path', p.thumbnail_path)
    from public.notifications n
    left join public.profiles a on a.id = n.actor_id
    left join public.posts p on p.id = n.post_id
    where n.user_id = v_uid
      and (p_before is null or n.created_at < p_before)
      and (not p_unread_only or n.read_at is null)
    order by n.created_at desc
    limit least(greatest(p_limit, 1), 100);
end $$;

create function public.mark_notifications_read(p_ids uuid[] default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_count int;
begin
  update public.notifications set read_at = now()
  where user_id = v_uid and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create function public.unread_counts() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  return jsonb_build_object(
    'notifications', (select count(*) from public.notifications where user_id = v_uid and read_at is null and type <> 'message'),
    'messages', (select count(*) from public.messages m
                 join public.conversations c on c.id = m.conversation_id
                 where v_uid in (c.user_a, c.user_b) and m.sender_id <> v_uid and m.read_at is null
                   and not public._is_blocked(v_uid, m.sender_id))
  );
end $$;

-- Heartbeat used for the "active users" metric (throttled to once per 5 minutes).
create function public.touch_presence() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  update public.profiles set last_active_at = now()
  where id = v_uid and (last_active_at is null or last_active_at < now() - interval '5 minutes');
end $$;

-- ---------------------------------------------------------------------------
-- Announcements & push tokens
-- ---------------------------------------------------------------------------

create function public.active_announcements() returns setof public.announcements
language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.announcements
  where is_active and starts_at <= now() and (ends_at is null or ends_at > now())
  order by starts_at desc
  limit 5
$$;

create function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  if p_platform not in ('android', 'web') or char_length(coalesce(p_token, '')) not between 10 and 4096 then
    perform public._err(422, 'INVALID_TOKEN');
  end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, v_uid, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;

create function public.unregister_push_token(p_token text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
end $$;

-- Service role: resolve tokens for push dispatch.
create function public.internal_push_targets(p_notification_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'notification', to_jsonb(n),
    'tokens', coalesce((select jsonb_agg(t.token) from public.push_tokens t where t.user_id = n.user_id), '[]'::jsonb))
  from public.notifications n where n.id = p_notification_id
$$;

create function public.internal_drop_push_token(p_token text) returns void
language sql security definer set search_path = public, pg_temp as $$
  delete from public.push_tokens where token = p_token
$$;

-- ---------------------------------------------------------------------------
-- Public reference lists
-- ---------------------------------------------------------------------------

create function public.list_authorities() returns table (id uuid, name text, department text, jurisdiction text)
language sql stable security definer set search_path = public, pg_temp as $$
  select id, name, department, jurisdiction from public.authorities where is_active order by name
$$;

create function public.public_settings() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings where is_public
$$;

-- ---------------------------------------------------------------------------
-- Business inquiries
-- ---------------------------------------------------------------------------

create function public.submit_business_inquiry(
  p_type text, p_business_name text, p_contact_name text, p_phone text, p_email text, p_message text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_id uuid;
begin
  perform public._rate_limit('inquiry:' || v_uid, 5, 86400);
  begin
    insert into public.business_inquiries (user_id, type, business_name, contact_name, phone, email, message)
    values (v_uid, p_type, btrim(p_business_name), btrim(p_contact_name), btrim(p_phone), lower(btrim(p_email)), btrim(p_message))
    returning id into v_id;
  exception when check_violation then
    perform public._err(422, 'INVALID_INQUIRY', 'Please check the form fields and try again.');
  end;
  return v_id;
end $$;

create function public.my_business_inquiries() returns setof jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := public._require_user();
begin
  -- admin_note is internal and deliberately excluded.
  return query
    select jsonb_build_object('id', id, 'type', type, 'business_name', business_name,
                              'status', status, 'created_at', created_at)
    from public.business_inquiries where user_id = v_uid order by created_at desc limit 50;
end $$;
