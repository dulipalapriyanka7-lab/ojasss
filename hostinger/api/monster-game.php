<?php
declare(strict_types=1);
require_once __DIR__.'/monster-rewards.php';
require_once __DIR__.'/monster-entry.php';
require_once __DIR__.'/monster-chat.php';

function monster_game_state(): array {
    return setting('monster.game', ['mode'=>'private','revision'=>'initial','changed_at'=>null]);
}

/** Battle-coin economy (admin, versioned). Battle coins are virtual, never withdrawable;
 *  paid entry stays locked until a legal review approves it, so every match is free entry. */
function monster_economy_defaults(): array {
    return ['version'=>1,'entry_fee_rupees'=>20,'coins_per_10'=>8,'starting_coins'=>16,'coins_per_hit'=>2,
        'start_hp'=>100,'match_minutes'=>20,'min_players'=>1,'max_players'=>50,'coin_elimination'=>true,
        'win_rule'=>'objective','paid_entry'=>false,'withdrawals'=>false,'changed_at'=>null];
}
function monster_economy(): array { return array_replace(monster_economy_defaults(), setting('monster.economy', [])); }
function monster_live_players(): int {
    $since=gmdate('Y-m-d\TH:i:s.v\Z',time()-90);
    return (int)q("SELECT COUNT(*) FROM oj_records WHERE kind='monster_game_presence' AND updated_at>=?",[$since])->fetchColumn();
}

/** Battle coins held right now by players seen in a match in the last 90 seconds (as reported by their game). */
function monster_active_coins(): int {
    $since=gmdate('Y-m-d\TH:i:s.v\Z',time()-90);
    return (int)q("SELECT COALESCE(SUM(CAST(JSON_EXTRACT(data,'$.coins') AS UNSIGNED)),0) FROM oj_records WHERE kind='monster_game_presence' AND updated_at>=?",[$since])->fetchColumn();
}

function monster_game_access(array $state, ?array $viewer): bool {
    if ($state['mode']==='live') return !monster_paid_entry_on() || (($viewer['status']??null)==='active' && (($viewer['role']??null)==='admin' || monster_pass($viewer)!==null));
    return ($viewer['status']??null)==='active'
        && (($viewer['role']??null)==='admin' || rec('monster_game_grants',$viewer['id'])!==null);
}

function monster_game_ticket(array $state, ?array $viewer): string {
    global $config;
    $grant=$viewer && $state['mode']==='private' && ($viewer['role']??null)!=='admin'
        ? rec('monster_game_grants',$viewer['id']) : null;
    $payload=b64(json_encode([
        'revision'=>$state['revision'],'member'=>$viewer['id']??null,
        'grant'=>$grant['version']??null,'expires'=>time()+1800,
    ],JSON_THROW_ON_ERROR));
    return $payload.'.'.hash_hmac('sha256','monster-game:'.$payload,$config['secret']);
}

function monster_game_ticket_allowed(string $ticket): bool {
    global $config;
    if (!preg_match('/^([A-Za-z0-9_-]{1,512})\.([a-f0-9]{64})$/D',$ticket,$parts)) return false;
    $expected=hash_hmac('sha256','monster-game:'.$parts[1],$config['secret']);
    if (!hash_equals($expected,$parts[2])) return false;
    $claims=json_decode(base64_decode(strtr($parts[1],'-_','+/'),true)?:'',true);
    $state=monster_game_state();
    if (!is_array($claims) || ($claims['expires']??0)<=time() || ($claims['revision']??null)!==$state['revision']) return false;
    if ($state['mode']==='live') return true;
    $viewer=isset($claims['member']) ? rec('profiles',$claims['member']) : null;
    if (($viewer['status']??null)!=='active') return false;
    if (($viewer['role']??null)==='admin') return true;
    $grant=rec('monster_game_grants',$viewer['id']);
    return $grant!==null && $grant['version']===($claims['grant']??null);
}

function monster_game_rpc(string $name, array $args): array {
    global $actor,$config;
    if (str_starts_with($name,'monster_game_reward_')) return monster_rewards_rpc($name,$args);
    if (str_starts_with($name,'monster_game_entry_')) return monster_entry_rpc($name,$args);
    if (in_array($name,['monster_game_room','monster_game_chat_send','monster_game_voice_poll','monster_game_voice_signal'],true)) return monster_chat_rpc($name,$args);
    $state=monster_game_state();
    if ($name==='monster_game_status') {
        $can=monster_game_access($state,$actor);
        if ($can && $actor && !empty($args['playing'])) {
            $c=$args['coins']??null;
            $row=['id'=>$actor['id'],'seen'=>now()];
            if (is_int($c) && $c>=0 && $c<=100000) { $row['coins']=$c; put('monster_game_balance',['id'=>$actor['id'],'coins'=>$c],$actor['id']); }
            put('monster_game_presence',$row,$actor['id']);
        }
        $mine=$actor ? rec('monster_game_balance',$actor['id']) : null;
        $e=monster_economy();
        return ['mode'=>$state['mode'],'can_play'=>$can,'live_players'=>monster_live_players(),'active_coins'=>monster_active_coins(),'my_coins'=>isset($mine['coins'])?(int)$mine['coins']:null,
            'economy'=>['starting_coins'=>$e['starting_coins'],'entry_fee_rupees'=>$e['entry_fee_rupees'],'paid_entry'=>monster_paid_entry_on(),'match_minutes'=>$e['match_minutes']],'entry_required'=>$state['mode']==='live'&&monster_paid_entry_on()&&!$can,'entry_fee_paise'=>monster_entry_fee_paise()];
    }
    // Wallet coins from a match: only coins EARNED above the starting stack, once per launch, capped.
    if ($name==='monster_game_coins_claim') {
        $u=need_user(); rate('monster-claim:'.$u['id'],30,3600);
        $m=owned('monster_game_matches',text($args['match_id']??'',36));
        if (!empty($m['credited'])) return ['credited'=>0,'already'=>true,'balance'=>coin_balance($u['id'])];
        $age=time()-strtotime($m['created_at']);
        check($age>=90&&$age<=4*3600,'This match cannot be claimed.');
        $c=$args['coins']??null; check(is_int($c)&&$c>=0&&$c<=100000,'Invalid coins.');
        $gain=max(0,min(40,$c-(int)$m['starting_coins']));
        $m['credited']=true;$m['final_coins']=$c;$m['gain']=$gain;put('monster_game_matches',$m,$u['id']);
        if ($gain>0) coin_move($u['id'],$gain,'game',$m['id'],'Monster Fight · coins earned in match');
        return ['credited'=>$gain,'balance'=>coin_balance($u['id'])];
    }
    // Unlock a locked gun mid-match for 10 wallet coins (once per gun per match).
    if ($name==='monster_game_unlock_pay') {
        $u=need_user();
        $m=owned('monster_game_matches',text($args['match_id']??'',36));
        check(time()-strtotime($m['created_at'])<=4*3600,'This match has ended.');
        $w=$args['weapon']??null; check(is_int($w)&&$w>=0&&$w<=10,'Invalid weapon.');
        check(coin_balance($u['id'])>=10,'Not enough wallet coins.',402);
        $new=coin_move($u['id'],-10,'game_unlock',$m['id'].':'.$w,'Monster Fight · gun unlock');
        return ['ok'=>true,'charged'=>$new?10:0,'balance'=>coin_balance($u['id'])];
    }
    if ($name==='monster_game_play') {
        if (!monster_game_access($state,$actor)) fail(403,'GAME_PRIVATE','Monster Fight is in private preview.');
        check(is_file($config['private_dir'].'/monster-fight/index.html'),'The game build is unavailable.',503);
        $round=monster_reward_round($actor);
        if ($actor) put('monster_game_presence',['id'=>$actor['id'],'seen'=>now()],$actor['id']);
        $e=monster_economy();
        $match=$actor?put('monster_game_matches',['user_id'=>$actor['id'],'starting_coins'=>(int)$e['starting_coins'],'credited'=>false],$actor['id']):null;
        return [
            'match_id'=>$match['id']??null,
            'path'=>'/play-game/'.monster_game_ticket($state,$actor).'/index.html',
            'round_id'=>$round['id']??null,'rate_paise'=>$round['rate_paise']??0,
            // snapshot: settings saved later never change a match already running
            'economy'=>['version'=>$e['version'],'starting_coins'=>$e['starting_coins'],'coins_per_hit'=>$e['coins_per_hit'],'start_hp'=>$e['start_hp'],'match_minutes'=>$e['match_minutes'],'coin_elimination'=>$e['coin_elimination'],'win_rule'=>$e['win_rule']],
        ];
    }
    $admin=staff(true);
    if ($name==='monster_game_manage') {
        $members=[];
        foreach (rows('monster_game_grants') as $grant) {
            $profile=rec('profiles',$grant['id']);
            $members[]=[
                'id'=>$grant['id'],'username'=>$profile['username']??$grant['username'],
                'name'=>$profile['display_name']??'','active'=>($profile['status']??null)==='active',
            ];
        }
        return ['state'=>$state,'members'=>$members];
    }
    if ($name==='monster_game_economy') return ['economy'=>monster_economy(),'live_players'=>monster_live_players()];
    if ($name==='monster_game_economy_save') {
        $v=$args['economy']??null; check(is_array($v),'Invalid settings.');
        $int=function(string $k,int $lo,int $hi) use($v): int { $n=$v[$k]??null; check(is_int($n)&&$n>=$lo&&$n<=$hi,'Check the value for '.str_replace('_',' ',$k).'.'); return $n; };
        $old=monster_economy();
        $next=['version'=>$old['version']+1,'entry_fee_rupees'=>$int('entry_fee_rupees',0,10000),'coins_per_10'=>$int('coins_per_10',1,1000),
            'starting_coins'=>$int('starting_coins',1,10000),'coins_per_hit'=>$int('coins_per_hit',1,1000),'start_hp'=>$int('start_hp',10,1000),
            'match_minutes'=>$int('match_minutes',3,60),'min_players'=>$int('min_players',1,100),'max_players'=>$int('max_players',1,100),
            'coin_elimination'=>(bool)($v['coin_elimination']??true),'win_rule'=>enum_value($v['win_rule']??'objective',['objective','last_standing','most_coins']),
            // paid entry and withdrawals stay locked until a legal review approves them
            'paid_entry'=>false,'withdrawals'=>false,'changed_at'=>now(),'changed_by'=>$admin['username']??null];
        check($next['min_players']<=$next['max_players'],'Minimum players cannot exceed maximum players.');
        put('settings',['id'=>'monster.economy','key'=>'monster.economy','value'=>$next,'is_public'=>false]);
        log_action($name,'monster_game',null,$old,$next);
        return $next;
    }
    if ($name==='monster_game_mode') {
        $mode=enum_value($args['mode']??'', ['private','live']);
        if ($mode==='live') {
            check(is_file($config['private_dir'].'/monster-fight/index.html'),'The game build is unavailable.',503);
        }
        if ($state['mode']!==$mode) {
            $next=['mode'=>$mode,'revision'=>uid(),'changed_at'=>now()];
            put('settings',['id'=>'monster.game','key'=>'monster.game','value'=>$next,'is_public'=>false]);
            log_action($name,'monster_game',null,$state,$next);
            $state=$next;
        }
        return $state;
    }
    if ($name==='monster_game_grant') {
        $username=mb_strtolower(ltrim(text($args['username']??'',64),'@'));
        check($username!=='','Enter an OJASSS username.');
        $id=q("SELECT id FROM oj_records WHERE kind='profiles' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.username'))=? LIMIT 1",[$username])->fetchColumn();
        $profile=$id ? rec('profiles',$id) : null;
        check(($profile['status']??null)==='active','No active member has that username.',404);
        check(($profile['role']??null)!=='admin','Admins already have preview access.');
        if (!rec('monster_game_grants',$id)) {
            $grant=put('monster_game_grants',['id'=>$id,'username'=>$profile['username'],'granted_by'=>$admin['id'],'version'=>uid()],$id);
            log_action($name,'monster_game',$id,null,$grant);
        }
        return ['ok'=>true];
    }
    if ($name==='monster_game_revoke') {
        $id=text($args['user_id']??'',36);
        $grant=rec('monster_game_grants',$id);
        if ($grant) {
            del('monster_game_grants',$id);
            log_action($name,'monster_game',$id,$grant,null);
        }
        return ['ok'=>true];
    }
    fail(404,'NOT_FOUND','Game operation not found.');
}
