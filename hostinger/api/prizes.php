<?php
declare(strict_types=1);
/** Weekly leaderboard prize money (₹ per tier), set by admin and shown as "announced" on the leaderboard. */
const PRIZE_TIERS = ['gold','silver','platinum','emerald','bronze'];
function prizes_get(): array {
    $v = setting('leaderboard.prizes', null);
    $d = ['gold'=>0,'silver'=>0,'platinum'=>0,'emerald'=>0,'bronze'=>0,'announced'=>false,'note'=>'','updated_at'=>null];
    return is_array($v) ? array_merge($d, array_intersect_key($v, $d)) : $d;
}
function prizes_rpc(string $name, array $p): array {
    if ($name === 'leaderboard_prizes') return prizes_get();
    $admin = staff(true); $old = prizes_get(); $new = $old;
    foreach (PRIZE_TIERS as $t) { $v = $p['p_'.$t] ?? $old[$t]; check(is_int($v) && $v >= 0 && $v <= 10000000, 'Prize must be ₹0–₹1,00,00,000.'); $new[$t] = $v; }
    $new['announced'] = (bool)($p['p_announced'] ?? $old['announced']);
    $new['note'] = text($p['p_note'] ?? $old['note'], 160);
    $new['updated_at'] = now();
    put('settings', ['id'=>'leaderboard.prizes','key'=>'leaderboard.prizes','value'=>$new,'is_public'=>true,'description'=>'Weekly leaderboard prize money']);
    log_action($name, 'leaderboard_prizes', null, $old, $new);
    return $new;
}
