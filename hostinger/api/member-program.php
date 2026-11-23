<?php
declare(strict_types=1);

function withdrawal_schedule(): array {
    $slots = setting('withdrawals.schedule', null);
    $local = new DateTimeImmutable('now', new DateTimeZone('Asia/Kolkata'));
    $open = $slots === null;
    foreach ($slots ?? [] as $slot) {
        if ($slot['day'] === (int)$local->format('N') &&
            $slot['start'] <= $local->format('H:i') && $local->format('H:i') < $slot['end']) $open = true;
    }
    return ['open'=>$open, 'slots'=>$slots];
}

/** A withdrawal is a reward for participation or for a personal bonus approved by an administrator. */
function withdrawal_task_access(string $userId): bool {
    foreach (rows('member_tasks', $userId) as $task) {
        if (empty($task['archived'])) return true;
    }
    // An administrator can personally grant an approved bonus to any member.
    // That member may withdraw the approved balance without being assigned a task.
    foreach (rows('earnings', $userId) as $earning) {
        if (($earning['type'] ?? '') === 'bonus' && ($earning['status'] ?? '') === 'approved' && (int)($earning['amount_paise'] ?? 0) > 0) return true;
    }
    return false;
}

function member_task_credit(array &$task): void {
    $amount=(int)($task['reward_paise']??0);if(empty($task['completed_at'])||$amount<=0)return;
    $key=hash('sha256','member-task:'.$task['id']);
    if(!rec('earnings',$key))put('earnings',['id'=>$key,'user_id'=>$task['user_id'],'type'=>'bonus','post_id'=>null,'amount_paise'=>$amount,'status'=>'approved','reference'=>'member-task:'.$task['id'],'note'=>$task['title'],'reviewed_at'=>now(),'reviewed_by_username'=>'Task completion'],$task['user_id']);
    if(empty($task['reward_credited_at'])){$task['reward_credited_at']=now();put('member_tasks',$task,$task['user_id']);notification($task['user_id'],'task','Task reward credited','You earned ₹'.number_format($amount/100,2).' for '.$task['title'],'/earnings');}
}
function member_program(string $name, array $p): mixed {
    $user = need_user();
    if ($name === 'withdrawal_schedule') return withdrawal_schedule() + [
        'task_eligible' => withdrawal_task_access($user['id']),
    ];
    if ($name === 'save_withdrawal_schedule') {
        staff(true);
        $slots = $p['slots'] ?? null;
        check($slots === null || (is_array($slots) && array_is_list($slots) && count($slots)<=28), 'Invalid time slots.');
        foreach ($slots ?? [] as $slot) {
            check(is_array($slot) && in_array($slot['day']??null, range(1,7), true), 'Select a valid day.');
            $start = $slot['start'] ?? '';
            $end = $slot['end'] ?? '';
            check(is_string($start) && is_string($end) && preg_match('/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/D',$start) &&
                preg_match('/^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/D',$end) && $start < $end, 'Closing time must follow opening time.');
        }
        put('settings',['id'=>'withdrawals.schedule','value'=>$slots]);
        return withdrawal_schedule();
    }
    if ($name === 'save_member_task') {
        staff(true);
        $id = text($p['id']??'',36);
        $old = $id ? rec('member_tasks',$id) : null;
        if (in_array($p['action'] ?? '', ['delete','purge'], true)) {
            check($old !== null, 'Task not found.', 404);
            $permanent = $p['action'] === 'purge';
            if ($permanent) {
                del('member_tasks', $id);
            } elseif (empty($old['deleted_at'])) {
                put('member_tasks', array_replace($old, ['archived'=>true, 'deleted_at'=>now()]), $old['user_id']);
            }
            // Record the operation without keeping the contents of a purged task.
            log_action($permanent ? 'purge_member_task' : 'delete_member_task', 'member_tasks', $id, null, ['user_id'=>$old['user_id']]);
            return ['id'=>$id,'deleted'=>true];
        }
        check(empty($old['deleted_at']), 'This task has been deleted.', 409);
        if(($p['action']??'')==='approve_custom'){check($old&&$old['kind']==='custom'&&empty($old['archived'])&&empty($old['completed_at']),'This custom task cannot be approved.');$old['progress']=$old['target'];$old['completed_at']=now();$old['approved_by']=$user['id'];put('member_tasks',$old,$old['user_id']);member_task_credit($old);return $old;}
        check(!$id || ($old && empty($old['completed_at'])), 'Only unfinished tasks can be edited.');
        $owners = $old ? [rec('profiles',$old['user_id'])] : [];
        if (!$old) {
            $rawUsers = $p['usernames'] ?? $p['username'] ?? '';
            check(is_string($rawUsers), 'Enter one or more usernames.');
            $names = array_values(array_unique(array_filter(array_map(
                fn($name) => ltrim(text($name,40),'@'), preg_split('/[,\s]+/', $rawUsers)
            ))));
            check(count($names)>=1 && count($names)<=100, 'Enter between 1 and 100 usernames.');
            $profiles = [];
            foreach (rows('profiles') as $profile) $profiles[strtolower($profile['username'])] = $profile;
            foreach ($names as $name) {
                $owner = $profiles[strtolower($name)] ?? null;
                check($owner !== null && $owner['status']==='active', 'User @'.$name.' was not found or is inactive.');
                $owners[] = $owner;
            }
        }
        check($owners && $owners[0] !== null, 'User not found.');
        $kind = enum_value($p['kind']??'', ['referral','video','custom','invite_original','invite_network_video']);
        $category = $kind==='referral'?'':enum_value($p['category']??'', ['','entertainment','education','world_education','horror_stories','music_dance','business_promotion','public_complaint','news','part_time_jobs','full_time_jobs','technology','gaming','lifestyle']);
        if($kind==='video')check($category!=='','Select a target video category.');
        $origin=enum_value($p['content_origin']??'', ['','new_content','copy_paste']);
        $rewardPaise=$p['reward_paise']??0;check(is_int($rewardPaise)&&$rewardPaise>=0&&$rewardPaise<=100000000,'Enter a valid reward amount.');
        $target = $p['target']??null; $points = $p['points']??null;
        $combined=in_array($kind,['invite_original','invite_network_video'],true);
        $inviteTarget=$combined?($p['invite_target']??1):0;$videoTarget=$combined?($p['video_target']??1):0;$networkTarget=$kind==='invite_network_video'?($p['network_target']??2):0;
        foreach([$inviteTarget,$videoTarget,$networkTarget] as $goal)check(is_int($goal)&&$goal>=0&&$goal<=10000,'Invalid combined task target.');
        if($combined){check($inviteTarget>0&&$videoTarget>0,'Set both invite and video targets.');$target=$inviteTarget+$videoTarget+$networkTarget;$origin=$kind==='invite_original'?'new_content':'';}
        check(is_int($target)&&$target>=1&&$target<=10000&&is_int($points)&&$points>=0&&$points<=1000000,'Invalid target or points.');
        $deadline = text($p['deadline']??'',16);
        $zone = new DateTimeZone('Asia/Kolkata');
        $date = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i',$deadline,$zone);
        check($date && $date->format('Y-m-d\TH:i')===$deadline && $date->getTimestamp()>time(),'Enter a future deadline in IST.');
        $title = text($p['title']??'',100);
        check($title!=='','Enter a task title.');
        $challengeWeekId = $old['challenge_week_id'] ?? null;
        $challengeName = $challengeWeekId === null
            ? text($p['challenge_name'] ?? '', 80)
            : $old['challenge_name'];
        if ($challengeName !== '' && $challengeWeekId === null && empty($p['archived'])) {
            $week = competition_current();
            $names = $week['challenges'] ?? [];
            $normalized = mb_strtolower($challengeName);
            foreach ($names as $publishedName) {
                if (mb_strtolower($publishedName) === $normalized) {
                    $challengeName = $publishedName;
                    break;
                }
            }
            if (!in_array($challengeName, $names, true)) {
                $names[] = $challengeName;
                $week['challenges'] = $names;
                put('weekly_competitions', $week);
            }
            $challengeWeekId = $week['id'];
        }
        $template = [
            'kind'=>$kind,'category'=>$category,'title'=>$title,'reward'=>text($p['reward']??'',200),
            'points'=>$points,'target'=>$target,'deadline'=>$deadline,
            'reward_paise'=>$rewardPaise,'content_origin'=>$origin,'criteria'=>text($p['criteria']??'',1000),
            'invite_target'=>$inviteTarget,'video_target'=>$videoTarget,'network_target'=>$networkTarget,
            'deadline_utc'=>$date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z'),
            'archived'=>!empty($p['archived']),
            'challenge_name'=>$challengeWeekId === null ? '' : $challengeName,
            'challenge_week_id'=>$challengeWeekId,
        ];
        $saved = [];
        foreach ($owners as $owner) {
            $task = put('member_tasks', array_merge($old??[], $template, [
                'user_id'=>$owner['id'],'username'=>$owner['username'],
            ]), $owner['id']);
            $saved[] = $task;
            // A task must be visible even if the recipient has not opened Profile yet.
            // notification() also queues an FCM push for the recipient's registered devices.
            if (!$old && empty($task['archived'])) {
                $goal = $combined?'complete the invite, referral and video requirements':($task['kind']==='video' ? 'upload '.$task['target'].' eligible videos' : 'invite '.$task['target'].' new members');
                $benefit = '₹'.number_format($rewardPaise/100,2).($task['reward']!=='' ? ' + '.$task['reward'] : '');
                notification($owner['id'], 'task', 'New task assigned', $task['title'].': '.$goal.'. Complete it to unlock '.$benefit.'.', '/my-tasks');
            }
        }
        return $old ? $saved[0] : ['tasks'=>$saved,'assigned_count'=>count($saved)];
    }
    $admin = $name === 'admin_member_tasks';
    if ($admin) staff(true);
    $owner = $admin ? (empty($p['user_id']) ? null : text($p['user_id'],64)) : $user['id'];
    $deleted = $admin && ($p['deleted'] ?? false) === true;
    $tasks = array_values(array_filter(rows('member_tasks',$owner), fn($task)=>!empty($task['deleted_at']) === $deleted));
    if ($admin) $tasks = page($tasks, $p);
    $referrals = null;
    $posts = [];
    foreach ($tasks as &$task) {
        if (!empty($task['deleted_at'])) continue;
        if (!empty($task['completed_at'])) {member_task_credit($task);continue;}if($task['archived']||$task['kind']==='custom')continue;
        $owner = $task['user_id'];
        if(in_array($task['kind'],['invite_original','invite_network_video'],true)){
            $profiles=$referrals??=rows('profiles');$invited=[];$network=0;$videos=0;
            foreach($profiles as $profile){$at=$profile['referred_at']??'';if(($profile['referred_by']??null)===$owner&&!empty($profile['onboarded'])&&$at>=$task['created_at']&&$at<$task['deadline_utc'])$invited[$profile['id']]=true;}
            foreach($profiles as $profile){$at=$profile['referred_at']??'';if(isset($invited[$profile['referred_by']??''])&&!empty($profile['onboarded'])&&$profile['id']!==$owner&&$at>=$task['created_at']&&$at<$task['deadline_utc'])$network++;}
            foreach($posts[$owner]??=rows('posts',$owner) as $post){if($post['kind']==='video'&&$post['status']==='published'&&$post['created_at']>=$task['created_at']&&$post['created_at']<$task['deadline_utc'])$videos++;}
            $task['invite_progress']=min(count($invited),$task['invite_target']);$task['video_progress']=min($videos,$task['video_target']);$task['network_progress']=min($network,$task['network_target']);$task['progress']=$task['invite_progress']+$task['video_progress']+$task['network_progress'];
            if($task['progress']>=$task['target'])$task['completed_at']=now();put('member_tasks',$task,$owner);member_task_credit($task);continue;
        }
        $video = $task['kind']==='video';
        $records = $video ? ($posts[$owner] ??= rows('posts',$owner)) : ($referrals ??= rows('profiles'));
        $progress = 0;
        foreach ($records as $record) {
            $at = $video ? $record['created_at'] : ($record['referred_at']??'');
            if ($at < $task['created_at'] || $at >= $task['deadline_utc']) continue;
            if ($video ? ($record['kind']==='video' && $record['status']==='published' &&
                true) :
                (($record['referred_by']??null)===$owner && !empty($record['onboarded']))) $progress++;
        }
        $task['progress'] = min($progress,$task['target']);
        if ($progress >= $task['target']) {
            $task['completed_at'] = now();
            put('member_tasks',$task,$owner);
            member_task_credit($task);
        }
    }
    unset($task);
    // Show members which uploads counted and why the others did not.
    foreach ($tasks as &$task) {
        if (!empty($task['deleted_at']) || !in_array($task['kind'], ['video','invite_original','invite_network_video'], true)) continue;
        $needOrigin = $task['kind'] === 'invite_original' ? 'new_content' : ($task['kind'] === 'video' ? ($task['content_origin'] ?? '') : '');
        $since = gmdate('Y-m-dTH:i:s', strtotime($task['created_at']) - 3 * 86400);
        $checks = [];
        foreach ($posts[$task['user_id']] ??= rows('posts', $task['user_id']) as $post) {
            if (($post['kind'] ?? '') !== 'video' || $post['created_at'] < $since || $post['created_at'] >= $task['deadline_utc']) continue;
            $cat = $post['source_category'] ?? $post['category'];
            $reason = match (true) {
                $post['created_at'] < $task['created_at'] => 'Uploaded before the task started',
                ($post['status'] ?? '') !== 'published' => 'Not published yet',
                
                default => null,
            };
            $checks[] = ['id' => $post['id'], 'caption' => mb_substr((string)($post['caption'] ?? ''), 0, 60), 'thumbnail_path' => $post['thumbnail_path'] ?? null, 'category' => $cat, 'created_at' => $post['created_at'], 'counted' => $reason === null, 'reason' => $reason];
        }
        usort($checks, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));
        $task['video_checks'] = array_slice($checks, 0, 30);
    }
    unset($task);
    return $tasks;
}
