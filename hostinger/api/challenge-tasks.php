<?php
declare(strict_types=1);

const CHALLENGE_TASK = 'challenge_tasks';
const CHALLENGE_ASSIGNMENT = 'challenge_assignments';
const CHALLENGE_BANNER = 'challenge_banners';

function challenge_zone(): DateTimeZone { return new DateTimeZone('Asia/Kolkata'); }

function challenge_date(mixed $value): DateTimeImmutable {
    $value = text($value, 16);
    $date = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $value, challenge_zone());
    check($date !== false && $date->format('Y-m-d\TH:i') === $value, 'Enter valid dates and times (IST).');
    return $date;
}

function challenge_category_label(string $category): string {
    return setting('categories.config', [])[$category]['label'] ?? ucwords(str_replace('_', ' ', $category));
}

function challenge_profile_matches(array $profile, string $category): bool {
    return ($profile['status'] ?? '') === 'active' && in_array($category, $profile['category_preferences']['selected'] ?? [], true);
}

function challenge_window(array $task, DateTimeImmutable $at): ?array {
    $start = challenge_date($task['start']);
    $end = challenge_date($task['end']);
    if ($task['repeat'] === 'once') {
        return $at >= $start && $at < $end ? [$start, $end] : null;
    }
    $local = $at->setTimezone(challenge_zone());
    $today = (int)$local->format('N');
    if ($task['repeat'] === 'weekly' && $today !== (int)$start->format('N')) return null;
    if ($task['repeat'] === 'days' && !in_array($today, $task['days'], true)) return null;
    $open = $local->setTime((int)$start->format('H'), (int)$start->format('i'));
    $close = $local->setTime((int)$end->format('H'), (int)$end->format('i'));
    return $open >= $start && $close <= $end && $local >= $open && $local < $close ? [$open, $close] : null;
}

function challenge_sync(array $task, DateTimeImmutable $at, ?array $viewer = null): void {
    if ($task['status'] !== 'active' || (!$task['automatic'] && $task['repeat'] !== 'once')) return;
    $window = challenge_window($task, $at);
    if (!$window) return;
    [$start, $end] = $window;
    $occurrence = $start->format('c');
    if (!$viewer) {
        $existing = array_fill_keys(q(
            "SELECT id FROM oj_records WHERE kind=? AND parent_id=? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.occurrence'))=?",
            [CHALLENGE_ASSIGNMENT, $task['id'], $occurrence]
        )->fetchAll(PDO::FETCH_COLUMN), true);
    }
    $profiles = $viewer ? [$viewer] : rows('profiles');
    $assigned = array_fill_keys($task['users'], true);
    foreach ($profiles as $profile) {
        $id = $profile['id'];
        if (($profile['status'] ?? '') !== 'active') continue;
        $manual = isset($assigned[$id]);
        $category = $task['audience'] !== 'selected' && $task['include_new'] && challenge_profile_matches($profile, $task['category']);
        if (!$manual && !$category) continue;
        $key = hash('sha256', $task['id'].':'.$occurrence.':'.$id);
        if (($viewer ? rec(CHALLENGE_ASSIGNMENT, $key) : isset($existing[$key])) || rec('challenge_suppressions', $key)) continue;
        $effectiveStart = max($start->getTimestamp(), strtotime($task['published_at']));
        if (!$manual) $effectiveStart = $at->getTimestamp();
        $effectiveStart = max($effectiveStart, (int)($task['added_at'][$id] ?? 0));
        put(CHALLENGE_ASSIGNMENT, [
            'id'=>$key, 'task_id'=>$task['id'], 'user_id'=>$id, 'username'=>$profile['username'],
            'occurrence'=>$occurrence, 'starts_at'=>gmdate('c', $effectiveStart), 'deadline'=>$end->format('c'),
            'source'=>in_array($id, $task['manual_users'], true) ? 'manual' : 'category',
            'target'=>$task['target'], 'type'=>$task['type'], 'category'=>$task['category'],
            'manual_review'=>$task['manual_review'],
        ], $id, $task['id']);
        global $actor;
        $sender = $actor;
        try {
            if (($actor['id'] ?? '') === $id) $actor = null;
            notification($id, 'task', 'New task assigned', $task['title'], '/leaderboard');
        } finally { $actor = $sender; }
    }
}

function challenge_tick(): void {
    $at = new DateTimeImmutable('now', challenge_zone());
    foreach (rows(CHALLENGE_TASK) as $task) challenge_sync($task, $at);
}

function challenge_progress(array $assignment, array $task, ?array $posts = null): array {
    $status = $assignment['decision'] ?? '';
    $progress = 0;
    $submissions = [];
    $start = strtotime($assignment['starts_at']);
    $end = strtotime($assignment['deadline']);
    foreach ($posts ?? rows('posts', $assignment['user_id']) as $post) {
        $created = strtotime($post['created_at']);
        if ($created < $start || $created >= $end || ($post['kind'] ?? '') !== 'video' || $post['category'] !== $assignment['category']) continue;
        if ($assignment['type'] === 'original' && ($post['content_origin'] ?? '') !== 'new_content') continue;
        if (in_array($post['status'], ['published', 'pending_review'], true)) {
            $submissions[] = ['id'=>$post['id'], 'title'=>$post['caption'] ?? '', 'status'=>$post['status']];
            if ($post['status'] === 'published') $progress++;
        }
    }
    if ($assignment['type'] === 'engagement') {
        // Engagement is measured on validated qualifying video views within the assignment window.
        $progress = 0;
        foreach ($submissions as $post) {
            if ($post['status'] !== 'published') continue;
            foreach (rows('event_dedup', null, $post['id']) as $view) {
                if (($view['event'] ?? '') !== 'views_count' || ($view['viewer'] ?? '') === $assignment['user_id']) continue;
                $when = strtotime($view['created_at']);
                if ($when >= $start && $when < $end) $progress++;
            }
        }
    }
    if ($status === '') {
        $status = match (true) {
            $progress >= $assignment['target'] => $assignment['manual_review'] ? 'under_review' : 'completed',
            count($submissions) > $progress && $assignment['type'] !== 'engagement' => 'submitted',
            time() >= $end => 'expired',
            $progress > 0 => 'in_progress',
            default => 'not_started',
        };
    }
    return $assignment + ['title'=>$task['title'], 'description'=>$task['description'], 'category_label'=>challenge_category_label($assignment['category']),
        'status'=>$status, 'progress'=>min($progress, $assignment['target']), 'submissions'=>$submissions];
}

function challenge_public(array $p): array {
    global $actor;
    $now = time();
    $week = empty($p['week']) ? null : rec('weekly_competitions', text($p['week'], 64));
    $reference = $week ? strtotime($week['start']) : $now;
    $banner = null;
    foreach (rows(CHALLENGE_BANNER) as $item) {
        if (!$item['public']) continue;
        $start = strtotime($item['starts_at']); $end = strtotime($item['ends_at']);
        if ($week && ($end <= $reference || $start >= strtotime($week['end']))) continue;
        if ($banner === null || ($start <= $now && $end > $now)) $banner = $item;
        if ($week || ($start <= $now && $end > $now)) break;
    }
    if ($banner) {
        $banner['status'] = $banner['override'] === 'closed' || $now >= strtotime($banner['ends_at']) ? 'closed' : ($now < strtotime($banner['starts_at']) ? 'upcoming' : 'live');
        $banner = array_intersect_key($banner, array_flip(['name','category','starts_at','ends_at','schedule','min_prize','max_prize','status']));
    }
    $tasks = [];
    if (($actor['status'] ?? '') === 'active' && !$week) {
        $definitions = array_column(rows(CHALLENGE_TASK), null, 'id');
        $at = new DateTimeImmutable('now', challenge_zone());
        foreach ($definitions as $task) challenge_sync($task, $at, $actor);
        $posts = rows('posts', $actor['id']);
        $today = $at->format('Y-m-d');
        foreach (rows(CHALLENGE_ASSIGNMENT, $actor['id']) as $row) {
            $task = $definitions[$row['task_id']] ?? null;
            if (!$task || $task['status'] !== 'active' || !empty($row['removed'])) continue;
            if (!str_starts_with($row['occurrence'], $today) && strtotime($row['deadline']) <= $now) continue;
            $tasks[] = array_diff_key(challenge_progress($row, $task, $posts), array_flip(['submissions','username','user_id']));
        }
    }
    return ['banner'=>$banner, 'tasks'=>$tasks, 'server_time'=>gmdate('c', $now)];
}
function challenge_admin(string $name, array $p): array {
    $admin = staff(true);
    $at = new DateTimeImmutable('now', challenge_zone());
    if ($name === 'challenge_admin_list') {
        $counts = ['total'=>0,'assigned'=>0,'pending'=>0,'completed'=>0,'expired'=>0];
        $assignees = [];
        $deleted = ($p['deleted'] ?? false) === true;
        $tasks = array_column(array_filter(rows(CHALLENGE_TASK),fn($task)=>!empty($task['deleted_at']) === $deleted), null, 'id');
        $counts['total'] = count($tasks);
        $posts = [];
        foreach (rows(CHALLENGE_ASSIGNMENT) as $row) {
            if (!empty($row['removed']) || !isset($tasks[$row['task_id']])) continue;
            $user = $row['user_id'];
            $status = challenge_progress($row, $tasks[$row['task_id']], $posts[$user] ??= rows('posts', $user))['status'];
            $assignees[$user] = true;
            if ($status !== 'rejected') $counts[in_array($status, ['completed','expired'], true) ? $status : 'pending']++;
        }
        $counts['assigned'] = count($assignees);
        return ['tasks'=>page(array_values($tasks), $p), 'banners'=>page(rows(CHALLENGE_BANNER), ['p_limit'=>100]), 'counts'=>$counts];
    }
    if ($name === 'challenge_admin_users') {
        $category = text($p['category'] ?? '', 40);
        $search = mb_strtolower(text($p['search'] ?? '', 80));
        $onlyCategory = ($p['only_category'] ?? false) === true;
        $task = !empty($p['id']) ? rec(CHALLENGE_TASK, text($p['id'], 64)) : null;
        $existing = $task ? array_fill_keys($task['users'], true) : [];
        $requested = $p['selected_ids'] ?? [];
        check(is_array($requested) && count($requested) <= 500 && !array_filter($requested, fn($id)=>!is_string($id)), 'Invalid selection.');
        $selected = array_fill_keys($requested, true);
        $selectedOnly = ($p['selected_only'] ?? false) === true;
        $additionalCount = 0;
        $matches = [];
        $eligibleCount = 0;
        foreach (rows('profiles') as $profile) {
            if (($profile['status'] ?? '') !== 'active') continue;
            $eligible = challenge_profile_matches($profile, $category);
            if ($eligible) $eligibleCount++;
            if (isset($selected[$profile['id']]) && !$eligible) $additionalCount++;
            if ($selectedOnly ? !isset($selected[$profile['id']]) : ($onlyCategory && !$eligible)) continue;
            if ($search !== '' && !str_contains(mb_strtolower($profile['username'].' '.($profile['display_name'] ?? '')), ltrim($search, '@'))) continue;
            $matches[] = array_intersect_key($profile, array_flip(['id','username','display_name','avatar_path'])) + [
                'eligible'=>$eligible, 'selected'=>isset($existing[$profile['id']]),
                'categories'=>$profile['category_preferences']['selected'] ?? [],
            ];
        }
        return ['users'=>page($matches, $p), 'total'=>count($matches), 'eligible_count'=>$eligibleCount, 'additional_count'=>$additionalCount];
    }
    if ($name === 'challenge_admin_banner') {
        $id = text($p['id'] ?? '', 64);
        $old = $id !== '' ? rec(CHALLENGE_BANNER, $id) : null;
        check($id === '' || $old !== null, 'Challenge not found.', 404);
        $start = challenge_date($p['start'] ?? '');
        $end = challenge_date($p['end'] ?? '');
        $category = text($p['category'] ?? '', 40);
        $label = text($p['name'] ?? '', 72);
        $min = $p['min_prize'] ?? null;
        $max = $p['max_prize'] ?? null;
        check($label !== '' && category_available($category) && $end > $start, 'Enter a challenge name, category and valid schedule.');
        check(is_int($min) && is_int($max) && $min >= 0 && $min <= $max && $max <= 10000000, 'Enter a valid prize range in whole rupees.');
        $saved = put(CHALLENGE_BANNER, array_replace($old ?? [], [
            'name'=>$label, 'category'=>$category, 'start'=>$p['start'], 'end'=>$p['end'], 'starts_at'=>$start->format('c'), 'ends_at'=>$end->format('c'),
            'schedule'=>text($p['schedule'] ?? '', 96), 'min_prize'=>$min, 'max_prize'=>$max,
            'override'=>enum_value($p['override'] ?? 'schedule', ['schedule','closed']), 'public'=>($p['public'] ?? false) === true,
        ]));
        log_action('save_weekly_challenge', CHALLENGE_BANNER, $saved['id'], $old, $saved);
        return $saved;
    }
    $id = text($p['id'] ?? '', 64);
    $old = $id !== '' ? rec(CHALLENGE_TASK, $id) : null;
    check($id === '' || $old !== null, 'Task not found.', 404);
    if ($name === 'challenge_admin_delete') {
        check($old !== null, 'Task not found.', 404);
        $permanent = ($p['permanent'] ?? false) === true;
        if ($permanent) {
            foreach ([CHALLENGE_ASSIGNMENT,'challenge_suppressions'] as $kind) {
                q('DELETE FROM oj_records WHERE kind=? AND parent_id=?', [$kind,$id]);
            }
            del(CHALLENGE_TASK, $id);
        } elseif (empty($old['deleted_at'])) {
            put(CHALLENGE_TASK, array_replace($old,['status'=>'archived','deleted_at'=>now()]), $old['created_by']);
        }
        log_action($permanent ? 'purge_challenge_task' : 'delete_challenge_task', CHALLENGE_TASK, $id, null, null);
        return ['id'=>$id,'deleted'=>true];
    }
    if ($name === 'challenge_admin_save') {
        check(empty($old['deleted_at']), 'This task has been deleted.', 409);
        $title = text($p['title'] ?? '', 100);
        $category = text($p['category'] ?? '', 40);
        check($title !== '' && category_available($category), 'Enter a name and select an available category.');
        $type = enum_value($p['type'] ?? '', ['upload','original','engagement']);
        $target = $p['target'] ?? null;
        check(is_int($target) && $target >= 1 && $target <= 10000, 'Enter a target from 1 to 10,000.');
        $start = challenge_date($p['start'] ?? '');
        $end = challenge_date($p['end'] ?? '');
        $repeat = enum_value($p['repeat'] ?? '', ['once','daily','days','weekly']);
        $status = enum_value($p['status'] ?? '', ['draft','active','paused','archived']);
        $days = $p['days'] ?? [];
        $automatic = ($p['automatic'] ?? false) === true;
        check(is_array($days) && count($days) <= 7 && !array_diff($days, range(1,7)) && ($repeat !== 'days' || count($days) > 0), 'Select valid recurring days.');
        check($start < $end && ($status !== 'active' || $end > $at), 'The deadline must follow the start and be in the future when publishing.');
        check($repeat === 'once' || $start->format('H:i') < $end->format('H:i'), 'Recurring tasks must close later on the same day.');
        check($status !== 'active' || $repeat === 'once' || $automatic, 'Enable automatic assignment for a recurring active task.');
        $audience = enum_value($p['audience'] ?? '', ['selected','category','combined']);
        $manual = $p['manual_users'] ?? [];
        check(is_array($manual) && array_is_list($manual) && count($manual) <= 500, 'Choose up to 500 individual users.');
        $manual = array_values(array_unique(array_map(fn($userId)=>text($userId, 64), $manual)));
        if ($audience === 'category') $manual = [];
        $profiles = array_column(rows('profiles'), null, 'id');
        foreach ($manual as $userId) check(($profiles[$userId]['status'] ?? '') === 'active', 'A selected user is inactive or missing.');
        $include = ($p['include_new'] ?? false) === true;
        $baseline = $audience === 'selected' ? [] : array_keys(array_filter($profiles, fn($profile)=>challenge_profile_matches($profile, $category)));
        if (!empty($old['published_at']) && $old['category'] === $category && $old['audience'] === $audience) {
            $baseline = $old['category_users'] ?? array_values(array_diff($old['users'], $old['manual_users']));
        }
        $users = array_values(array_unique(array_merge($manual, $baseline)));
        check($status !== 'active' || $users !== [] || ($include && $audience !== 'selected'), 'Select at least one recipient.');
        $addedAt = $old['added_at'] ?? [];
        if (!empty($old['published_at'])) foreach (array_diff($users, $old['users']) as $addedId) $addedAt[$addedId] = $at->getTimestamp();
        $bannerId = text($p['banner_id'] ?? '', 64);
        $linkedBanner = $bannerId !== '' ? rec(CHALLENGE_BANNER, $bannerId) : null;
        check($bannerId === '' || $linkedBanner !== null, 'Choose an existing weekly challenge.');
        $definition = array_replace($old ?? [], [
            'title'=>$title, 'description'=>text($p['description'] ?? '', 500), 'category'=>$category, 'type'=>$type, 'target'=>$target,
            'start'=>$p['start'], 'end'=>$p['end'], 'repeat'=>$repeat, 'days'=>array_values(array_unique($days)), 'status'=>$status,
            'audience'=>$audience, 'users'=>$users, 'category_users'=>$baseline, 'manual_users'=>$manual, 'include_new'=>$include, 'automatic'=>$automatic,
            'added_at'=>$addedAt, 'banner_id'=>$bannerId,
            'manual_review'=>($p['manual_review'] ?? false) === true, 'created_by'=>$old['created_by'] ?? $admin['id'],
        ]);
        if ($status === 'active' && empty($definition['published_at'])) $definition['published_at'] = now();
        $saved = put(CHALLENGE_TASK, $definition, $admin['id']);
        challenge_sync($saved, $at);
        log_action('save_challenge_task', CHALLENGE_TASK, $saved['id'], $old, $saved);
        return $saved;
    }
    if ($name === 'challenge_admin_assignments') {
        $owner = empty($p['user_id']) ? null : text($p['user_id'],64);
        check($id !== '' || $owner !== null, 'Choose a task or user.');
        $definitions = $old ? [$id=>$old] : array_column(rows(CHALLENGE_TASK),null,'id');
        $deleted = ($p['deleted'] ?? false) === true;
        $rows = array_values(array_filter(rows(CHALLENGE_ASSIGNMENT,$owner,$id ?: null),fn($row)=>
            isset($definitions[$row['task_id']]) && empty($definitions[$row['task_id']]['deleted_at']) &&
            (!empty($row['removed']) === $deleted)
        ));
        $counts = [];
        $posts = [];
        foreach ($rows as &$row) {
            $user = $row['user_id'];
            $row = challenge_progress($row, $definitions[$row['task_id']], $posts[$user] ??= rows('posts', $user));
            $status = !empty($row['removed']) ? 'removed' : $row['status'];
            $counts[$status] = ($counts[$status] ?? 0) + 1;
        }
        unset($row);
        return ['assignments'=>page($rows,$p), 'total'=>count($rows), 'counts'=>$counts];
    }
    check($old !== null && empty($old['deleted_at']), 'Task not found.', 404);
    $assignment = rec(CHALLENGE_ASSIGNMENT, text($p['assignment'] ?? '', 64));
    check($assignment !== null && $assignment['task_id'] === $id, 'Assignment not found.', 404);
    $before = $assignment;
    $action = enum_value($p['action'] ?? '', ['approve','reject','remove','restore','extend','edit','purge']);
    $reason = text($p['reason'] ?? '', 400);
    if ($action === 'purge') {
        // Reserve the occurrence key so a recurring task cannot recreate this deleted assignment.
        put('challenge_suppressions',['id'=>$assignment['id']],null,$id);
        del(CHALLENGE_ASSIGNMENT,$assignment['id']);
        log_action('purge_challenge_assignment', CHALLENGE_ASSIGNMENT, $assignment['id'], null, null);
        return ['id'=>$assignment['id'],'deleted'=>true];
    }
    if ($action === 'approve' || $action === 'reject') {
        $progress = challenge_progress($assignment, $old);
        check(empty($assignment['removed']) && $progress['status'] === 'under_review', 'This assignment is not ready for review.');
        check($action !== 'reject' || $reason !== '', 'Enter a reason for rejecting the submission.');
        $assignment['decision'] = $action === 'approve' ? 'completed' : 'rejected';
        $assignment['review_reason'] = $reason;
        $assignment['reviewed_by'] = $admin['id'];
    } elseif ($action === 'extend' || $action === 'edit') {
        $deadline = challenge_date($p['deadline'] ?? '');
        if ($action === 'extend') check($deadline > $at && $deadline->getTimestamp() > strtotime($assignment['deadline']), 'Choose a later future deadline.');
        else {
            check(empty($assignment['removed']), 'Restore the assignment before editing.');
            check($deadline->getTimestamp() > strtotime($assignment['starts_at']), 'The deadline must follow the start.');
            $target = $p['target'] ?? null;
            check(is_int($target) && $target >= 1 && $target <= 10000, 'Enter a target from 1 to 10,000.');
            $assignment['target'] = $target;
        }
        $assignment['deadline'] = $deadline->format('c');
    } else {
        $assignment['removed'] = $action === 'remove';
    }
    $assignment = put(CHALLENGE_ASSIGNMENT, $assignment, $assignment['user_id'], $id);
    log_action($action.'_challenge_assignment', CHALLENGE_ASSIGNMENT, $assignment['id'], $before, $assignment, $reason ?: null);
    return challenge_progress($assignment, $old);
}
