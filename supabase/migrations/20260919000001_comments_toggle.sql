-- Admin-controlled comments switch. Off by default: the comment option is hidden from
-- users and new comments are refused. Staff (admins/moderators) keep access so they can
-- review and moderate existing comments; admins turn it on from Admin → System → Settings.

insert into public.app_settings (key, value, description, is_public, is_dangerous) values
  ('content.comments_enabled', 'false', 'Show the comment option to users and allow new comments', true, false)
on conflict (key) do nothing;

create or replace function public.add_comment(p_post_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public._require_user();
  v_post public.posts;
  v_comment public.comments;
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform public._assert_not_maintenance();
  if not public._setting_bool('content.comments_enabled', false) and not public.is_staff(v_uid) then
    perform public._err(403, 'COMMENTS_DISABLED', 'Comments are turned off right now.');
  end if;
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
