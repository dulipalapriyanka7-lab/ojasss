<?php
declare(strict_types=1);

const VIRAL_CHALLENGES = 'viral_challenges';
const VIRAL_MEMBERS = 'viral_challenge_members';
const VIRAL_SUBMISSIONS = 'viral_challenge_submissions';

function viral_challenge_status(array $challenge, int $at): string {
    if (in_array($challenge['state'], ['draft', 'paused', 'completed'], true)) return $challenge['state'];
    if ($at >= strtotime($challenge['ends_at'])) return 'ended';
    return $at < strtotime($challenge['starts_at']) ? 'scheduled' : 'active';
}

function viral_challenge_visible(array $challenge, ?array $viewer): bool {
    return match ($challenge['audience']) {
        'all' => true,
        'users' => in_array($viewer['id'] ?? '', $challenge['user_ids'], true),
        'categories' => (bool)array_intersect($challenge['audience_categories'], $viewer['category_preferences']['selected'] ?? []),
    };
}

function viral_challenge_config(array $p, ?array $old, array $admin, int $at): array {
    $title = text($p['title'] ?? '', 100);
    $description = text($p['description'] ?? '', 3000);
    $category = text($p['category'] ?? '', 40);
    check($title !== '' && $description !== '', 'Enter a challenge name and description.');
    check($category !== 'one_chance' && category_available($category), 'Choose an available posting category.');
    $dates = [];
    foreach (['starts_at', 'ends_at'] as $field) {
        $value = text($p[$field] ?? '', 45);
        check((bool)preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/D', $value), 'Enter valid start and end dates with a time zone.');
        $date = date_parse($value);
        check(!$date['error_count'] && !$date['warning_count'], 'Enter valid calendar dates.');
        $dates[$field] = (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('UTC'))->format(DATE_ATOM);
    }
    check($dates['ends_at'] > $dates['starts_at'], 'End time must be after start time.');

    $audience = enum_value($p['audience'] ?? 'all', ['all', 'categories', 'users']);
    $categories = $p['audience_categories'] ?? [];
    $users = $p['user_ids'] ?? [];
    check(is_array($categories) && array_is_list($categories) && count($categories) <= 20, 'Choose up to 20 categories.');
    check(is_array($users) && array_is_list($users) && count($users) <= 500, 'Choose up to 500 users.');
    if ($audience === 'categories') {
        check(count($categories) > 0, 'Choose at least one audience category.');
        foreach ($categories as $item) check(is_string($item) && category_available($item), 'Choose available audience categories.');
    } else $categories = [];
    if ($audience === 'users') {
        check(count($users) > 0, 'Select at least one user.');
        foreach ($users as $item) check(is_string($item) && strlen($item) === 36 && (rec('profiles', $item) !== null), 'Choose existing user profiles.');
    } else $users = [];

    $state = enum_value($p['state'] ?? 'draft', ['draft', 'published', 'paused', 'completed']);
    if ($old && in_array(viral_challenge_status($old, $at), ['ended', 'completed'], true)) {
        check($state === 'completed', 'A finished challenge cannot be reopened.', 409);
    }
    if ($state === 'published') check(strtotime($dates['ends_at']) > $at, 'Publishing requires a future end time.');
    if ($old && rows(VIRAL_MEMBERS, null, $old['id'])) {
        check(!in_array($state, ['draft'], true), 'A challenge with participants cannot return to draft.', 409);
        check($old['category'] === $category, 'The upload category is fixed after members join.', 409);
    }
    $values = [];
    foreach (['hots', 'shares', 'target'] as $field) {
        $value = $p[$field] ?? ($field === 'target' ? 1 : 0);
        check(is_int($value) && $value >= ($field === 'target' ? 1 : 0) && $value <= 1000000, 'Enter valid whole-number goals.');
        $values[$field] = $value;
    }
    foreach (['banner_path', 'icon_path'] as $field) {
        $path = text($p[$field] ?? '', 220);
        if ($path !== '' && $path !== ($old[$field] ?? null)) {
            $object = rec('objects', object_key('media', $path));
            check($object && $object['user_id'] === $admin['id'] &&
                in_array($object['mime_type'], ['image/png', 'image/jpeg', 'image/webp'], true), 'Upload a PNG, JPEG or WebP image.');
        }
        $values[$field] = $path;
    }
    return $dates + $values + [
        'id' => $old['id'] ?? uid(), 'created_at' => $old['created_at'] ?? now(),
        'title' => $title, 'description' => $description, 'category' => $category,
        'rules' => text($p['rules'] ?? '', 2000), 'reward' => text($p['reward'] ?? '', 500),
        'state' => $state, 'audience' => $audience,
        'audience_categories' => array_values(array_unique($categories)), 'user_ids' => array_values(array_unique($users)),
        'created_by' => $old['created_by'] ?? $admin['id'],
    ];
}

function viral_challenge_get($id): array {
    $challenge = rec(VIRAL_CHALLENGES, text($id, 64));
    if (!$challenge) fail(404, 'NOT_FOUND', 'Challenge was not found.');
    return $challenge;
}

function viral_challenge_member(array $challenge, ?array $viewer): ?array {
    return $viewer ? rec(VIRAL_MEMBERS, relation_id($viewer['id'], $challenge['id'])) : null;
}

function viral_challenge_can_join(array $challenge, ?array $viewer, int $at): bool {
    return viral_challenge_status($challenge, $at) === 'active' &&
        category_available($challenge['category']) &&
        ($viewer === null || $viewer['status'] === 'active') &&
        viral_challenge_visible($challenge, $viewer);
}

function viral_challenge_validate_upload($id, array $viewer, string $kind, string $category, string $visibility): array {
    $challenge = viral_challenge_get($id);
    check(viral_challenge_member($challenge, $viewer) !== null, 'Join the challenge before submitting a video.', 403);
    check(viral_challenge_visible($challenge, $viewer), 'You are no longer eligible for this challenge.', 403);
    check(viral_challenge_status($challenge, time()) === 'active', 'This challenge is closed for entries.', 409);
    check($kind === 'video' && $category === $challenge['category'] && $visibility === 'public', 'Submit a public video in the challenge category.');
    return $challenge;
}

function viral_challenge_submission(array $challenge, array $entry): array {
    $post = rec('posts', $entry['post_id']);
    $hots = 0;
    if ($post) foreach (rows('engagements', null, $post['id']) as $reaction) {
        if ($reaction['kind'] === 'hot') $hots++;
    }
    $shares = (int)($post['shares_count'] ?? 0);
    $author = $post ? rec('profiles', $post['author_id']) : null;
    $eligible = $post && ($author['status'] ?? '') === 'active' &&
        $post['status'] === 'published' && ($post['visibility'] ?? 'public') === 'public';
    return $entry + [
        'caption' => $post['caption'] ?? '', 'media_path' => $eligible ? ($post['media_path'] ?? '') : '',
        'username' => $author['username'] ?? '', 'display_name' => $author['display_name'] ?? '',
        'hots' => $hots, 'shares' => $shares, 'available' => (bool)$eligible,
        'qualified' => $eligible && $entry['moderation'] !== 'excluded' && $hots >= $challenge['hots'] && $shares >= $challenge['shares'],
    ];
}

function viral_challenge_public_row(array $challenge, ?array $viewer, int $at): array {
    unset($challenge['user_ids'], $challenge['audience_categories'], $challenge['created_by']);
    return $challenge + ['status' => viral_challenge_status($challenge, $at),
        'joined' => viral_challenge_member($challenge, $viewer) !== null];
}

function viral_challenge_route(string $name, array $p): array {
    global $actor;
    $at = time();
    if ($name === 'viral_challenge_feed') {
        $items = [];
        foreach (rows(VIRAL_CHALLENGES) as $challenge) {
            if (viral_challenge_status($challenge, $at) === 'active' &&
                viral_challenge_visible($challenge, $actor) && category_available($challenge['category'])) {
                $items[] = viral_challenge_public_row($challenge, $actor, $at);
            }
        }
        return ['items' => page($items, $p), 'server_time' => gmdate(DATE_ATOM, $at)];
    }
    if (in_array($name, ['viral_challenge_detail', 'viral_challenge_join'], true)) {
        $challenge = viral_challenge_get($p['id'] ?? '');
        $member = viral_challenge_member($challenge, $actor);
        check($challenge['state'] !== 'draft' && ($member || viral_challenge_visible($challenge, $actor)), 'Challenge was not found.', 404);
        $canJoin = viral_challenge_can_join($challenge, $actor, $at);
        if ($name === 'viral_challenge_join') {
            $viewer = need_user();
            if (!$member) {
                check($canJoin, 'You cannot join this challenge at this time.', 403);
                $member = put(VIRAL_MEMBERS, [
                    'id' => relation_id($viewer['id'], $challenge['id']),
                    'user_id' => $viewer['id'], 'challenge_id' => $challenge['id'],
                ], $viewer['id'], $challenge['id']);
            }
        }
        $entries = !$member ? [] : array_map(fn($entry) => viral_challenge_submission($challenge, $entry), rows(VIRAL_SUBMISSIONS, $actor['id'], $challenge['id']));
        return ['challenge' => viral_challenge_public_row($challenge, $actor, $at),
            'can_join' => $canJoin && !$member, 'joined' => $member !== null,
            'can_upload' => $member !== null && ($actor['status'] ?? '') === 'active' &&
                $canJoin,
            'server_time' => gmdate(DATE_ATOM, $at),
            'submitted' => count($entries), 'qualified' => count(array_filter($entries, fn($entry) => $entry['qualified'])),
            'submissions' => page($entries, $p)];
    }
    $admin = staff(true);
    if ($name === 'viral_challenge_admin_users') {
        $query = mb_strtolower(text($p['query'] ?? '', 100));
        $selected = $p['selected'] ?? [];
        check(is_array($selected) && count($selected) <= 500, 'Invalid selected profiles.');
        $users = [];
        $chosen = [];
        foreach (rows('profiles') as $profile) {
            $row = array_intersect_key($profile, array_flip(['id', 'username', 'display_name', 'avatar_path', 'status'])) +
                ['categories' => $profile['category_preferences']['selected'] ?? [], 'eligible' => $profile['status'] === 'active'];
            if (in_array($profile['id'], $selected, true)) $chosen[] = $row;
            if ($query === '' || str_contains(mb_strtolower($profile['username'].' '.$profile['display_name']), ltrim($query, '@'))) $users[] = $row;
        }
        return ['items' => page($users, $p), 'selected' => $chosen, 'total' => count($users)];
    }
    if ($name === 'viral_challenge_admin_list') {
        $summary = array_fill_keys(['total', 'active', 'scheduled', 'completed', 'participants', 'videos', 'qualified'], 0);
        $items = [];
        $query = mb_strtolower(text($p['query'] ?? '', 100));
        $filter = enum_value($p['status'] ?? '', ['', 'draft', 'active', 'scheduled', 'paused', 'ended', 'completed']);
        foreach (rows(VIRAL_CHALLENGES) as $challenge) {
            $status = viral_challenge_status($challenge, $at);
            $participants = count(rows(VIRAL_MEMBERS, null, $challenge['id']));
            $entries = array_map(fn($entry) => viral_challenge_submission($challenge, $entry), rows(VIRAL_SUBMISSIONS, null, $challenge['id']));
            $qualified = count(array_filter($entries, fn($entry) => $entry['qualified']));
            $summary['total']++;
            if (in_array($status, ['active', 'scheduled'], true)) $summary[$status]++;
            if (in_array($status, ['ended', 'completed'], true)) $summary['completed']++;
            $summary['participants'] += $participants;
            $summary['videos'] += count($entries);
            $summary['qualified'] += $qualified;
            if (($filter === '' || $status === $filter) && str_contains(mb_strtolower($challenge['title']), $query)) {
                $items[] = $challenge + ['status' => $status, 'participants' => $participants, 'videos' => count($entries), 'qualified' => $qualified];
            }
        }
        return ['items' => page($items, $p), 'summary' => $summary, 'total' => count($items)];
    }
    if ($name === 'viral_challenge_admin_save') {
        $old = empty($p['id']) ? null : viral_challenge_get($p['id']);
        $saved = viral_challenge_config($p, $old, $admin, $at);
        $saved = put(VIRAL_CHALLENGES, $saved, $saved['created_by']);
        foreach (array_unique(array_filter([$saved['banner_path'], $saved['icon_path']])) as $path) {
            $asset = object_key('media', $path);
            put('viral_challenge_assets', ['id' => relation_id($saved['id'], $asset), 'challenge_id' => $saved['id']], null, $asset);
        }
        log_action('save_viral_challenge', VIRAL_CHALLENGES, $saved['id'], $old, $saved);
        return $saved;
    }
    $challenge = viral_challenge_get($p['id'] ?? '');
    if ($name === 'viral_challenge_admin_close') {
        check($challenge['state'] !== 'draft', 'Publish the challenge before closing it.');
        $saved = put(VIRAL_CHALLENGES, array_replace($challenge, ['state' => 'completed']), $challenge['created_by']);
        log_action('close_viral_challenge', VIRAL_CHALLENGES, $saved['id'], $challenge, $saved);
        return $saved;
    }
    if ($name === 'viral_challenge_admin_review') {
        $entry = rec(VIRAL_SUBMISSIONS, text($p['submission_id'] ?? '', 64));
        check($entry && $entry['challenge_id'] === $challenge['id'], 'Submission was not found.', 404);
        $state = enum_value($p['moderation'] ?? '', ['included', 'excluded']);
        $reason = text($p['reason'] ?? '', 300);
        check($state !== 'excluded' || $reason !== '', 'Enter a reason for excluding the submission.');
        $saved = put(VIRAL_SUBMISSIONS, array_replace($entry, ['moderation' => $state, 'moderation_reason' => $reason]),
            $entry['user_id'], $entry['challenge_id']);
        log_action('review_viral_submission', VIRAL_SUBMISSIONS, $saved['id'], $entry, $saved, $reason);
        return viral_challenge_submission($challenge, $saved);
    }
    if (!in_array($name, ['viral_challenge_admin_submissions', 'viral_challenge_admin_participants'], true)) fail(404, 'NOT_FOUND', 'Operation not found.');
    $entries = array_map(fn($entry) => viral_challenge_submission($challenge, $entry), rows(VIRAL_SUBMISSIONS, null, $challenge['id']));
    $query = mb_strtolower(text($p['query'] ?? '', 100));
    $filter = enum_value($p['filter'] ?? '', ['', 'qualified', 'pending', 'excluded', 'joined', 'completed']);
    if ($name === 'viral_challenge_admin_participants') {
        $byUser = [];
        foreach ($entries as $entry) $byUser[$entry['user_id']][] = $entry;
        $entries = [];
        foreach (rows(VIRAL_MEMBERS, null, $challenge['id']) as $member) {
            $user = rec('profiles', $member['user_id']);
            $videos = $byUser[$member['user_id']] ?? [];
            $qualified = count(array_filter($videos, fn($entry) => $entry['qualified']));
            $entries[] = $member + ['display_name' => $user['display_name'] ?? 'Unavailable account', 'username' => $user['username'] ?? '',
                'avatar_path' => $user['avatar_path'] ?? '', 'category' => $challenge['category'], 'videos' => count($videos),
                'qualified' => $qualified, 'hots' => array_sum(array_column($videos, 'hots')), 'shares' => array_sum(array_column($videos, 'shares')),
                'status' => $qualified >= $challenge['target'] ? 'completed' : (count($videos) ? 'pending' : 'joined')];
        }
    }
    $entries = array_values(array_filter($entries, function ($row) use ($query, $filter) {
        $status = $row['status'] ?? ($row['moderation'] === 'excluded' ? 'excluded' : ($row['qualified'] ? 'qualified' : 'pending'));
        return (!$filter || $status === $filter) && str_contains(mb_strtolower($row['display_name'].' '.$row['username'].' '.($row['caption'] ?? '')), $query);
    }));
    return ['items' => page($entries, $p), 'total' => count($entries)];
}
