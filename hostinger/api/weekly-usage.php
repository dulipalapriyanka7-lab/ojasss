<?php
declare(strict_types=1);

function usage_window(DateTimeImmutable $instant, int $weeks = 0): array {
    $local = $instant->setTimezone(new DateTimeZone('Asia/Kolkata'));
    $monday = $local->modify('monday this week')->setTime(6, 0);
    if ($local < $monday) $monday = $monday->modify('-1 week');
    $start = $monday->modify("-$weeks weeks");
    return [$start, $start->modify('+5 days')->setTime(12, 0)];
}

function usage_route(string $name, array $params): array {
    $user = $name === 'weekly_usage_report' ? staff(true) : need_user();
    $weeks = filter_var($params['weeks_ago'] ?? 0, FILTER_VALIDATE_INT);
    check($weeks !== false && $weeks >= 0 && $weeks <= 52, 'Invalid report week.');
    $instant = new DateTimeImmutable();
    [$start, $end] = usage_window($instant, $name === 'weekly_usage_heartbeat' ? 0 : $weeks);
    $week = $start->format('Y-m-d');
    if ($name === 'weekly_usage_heartbeat') {
        $activityDuration=filter_var($params['seconds']??0,FILTER_VALIDATE_INT);
        check($activityDuration!==false&&$activityDuration>=1&&$activityDuration<=15,'Invalid activity duration.');
        competition_activity($user['id'],$activityDuration,intdiv(time(),60));
        $second = $instant->getTimestamp() - 1;
        if ($second < $start->getTimestamp() || $second >= $end->getTimestamp()) return [];
        $pending = [];
        $duration = filter_var($params['seconds'] ?? 0, FILTER_VALIDATE_INT);
        check($duration !== false && $duration >= 1 && $duration <= 15, 'Invalid activity duration.');
        for ($i = $second; $i > $second - $duration && $i >= $start->getTimestamp(); $i--) {
            $minute = intdiv($i, 60);
            $id = substr(hash('sha256', $user['id'].':'.$minute), 0, 36);
            $row = $pending[$id] ?? rec('weekly_usage_minutes', $id) ?? ['id'=>$id, 'mask'=>0, 'seconds'=>0];
            $bit = 1 << ($i % 60);
            if (!($row['mask'] & $bit)) $row['seconds']++;
            $row['mask'] |= $bit;
            $pending[$id] = $row;
        }
        foreach ($pending as $row) put('weekly_usage_minutes', $row, $user['id'], $week);
        return [];
    }

    $result = ['start'=>$start->format(DATE_ATOM), 'end'=>$end->format(DATE_ATOM)];
    $sum = "SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(data,'$.seconds')) AS UNSIGNED))";
    if ($name === 'weekly_usage_total') {
        return $result + ['seconds'=>(int)q("SELECT $sum FROM oj_records WHERE kind='weekly_usage_minutes' AND parent_id=? AND user_id=?", [$week,$user['id']])->fetchColumn()];
    }
    $offset = max(0, (int)($params['offset'] ?? 0));
    $sql = "SELECT p.id, JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.username')) username, COALESCE(u.seconds,0) seconds
        FROM oj_records p LEFT JOIN (
            SELECT user_id,$sum seconds FROM oj_records WHERE kind='weekly_usage_minutes' AND parent_id=? GROUP BY user_id
        ) u ON p.id=u.user_id WHERE p.kind='profiles'
        ORDER BY seconds DESC,p.id LIMIT 51 OFFSET ".$offset;
    $users = q($sql, [$week])->fetchAll(PDO::FETCH_ASSOC);
    return $result + ['users'=>array_slice($users,0,50), 'has_more'=>count($users)>50];
}


