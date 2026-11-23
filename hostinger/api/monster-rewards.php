<?php
declare(strict_types=1);

const MONSTER_MAX_ELIMINATIONS = 13; // 12 bots and one Titan

function monster_reward_rate(): int {
    return (int)setting('monster.reward_paise',0);
}

function monster_reward_round(?array $viewer): ?array {
    $rate=monster_reward_rate();
    if ($rate<=0 || (int)setting('monster.entry_fee_paise',0)>0 || ($viewer['status']??null)!=='active') return null;
    rate('monster-round:'.$viewer['id'],20,3600);
    return put('monster_game_rounds',[
        'id'=>uid(),'user_id'=>$viewer['id'],'rate_paise'=>$rate,
        'expires_at'=>time()+2700,'status'=>'open',
    ],$viewer['id']);
}

function monster_rewards_rpc(string $name,array $args): array {
    if ($name==='monster_game_reward_submit') {
        $viewer=need_user();
        $id=text($args['round_id']??'',36);
        $round=owned('monster_game_rounds',$id);
        if ($round['status']!=='open') return ['status'=>$round['status']];
        check($round['expires_at']>time(),'This match reward period has expired.',410);
        $coins=$args['coins']??null;
        check(is_int($coins)&&$coins>=1&&$coins<=MONSTER_MAX_ELIMINATIONS,'Invalid elimination count.');
        $round['reported_coins']=$coins;
        $round['status']='pending';
        put('monster_game_rounds',$round,$viewer['id']);
        return ['status'=>'pending'];
    }

    $admin=staff(true);
    if ($name==='monster_game_reward_queue') {
        $raw=q("SELECT data FROM oj_records WHERE kind=? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.status'))=? ORDER BY created_at,id LIMIT 50",['monster_game_rounds','pending'])->fetchAll(PDO::FETCH_COLUMN);
        $claims=array_map(static function ($value) {
            $row=json_decode($value,true,512,JSON_THROW_ON_ERROR);
            $profile=rec('profiles',$row['user_id']);
            return [
                'id'=>$row['id'],'username'=>$profile['username']??'Unknown member',
                'reported_coins'=>$row['reported_coins'],'rate_paise'=>$row['rate_paise'],
                'created_at'=>$row['created_at'],
            ];
        },$raw);
        return ['rate_paise'=>monster_reward_rate(),'claims'=>$claims];
    }
    if ($name==='monster_game_reward_rate') {
        $rate=$args['rate_paise']??null;
        check(is_int($rate)&&$rate>=0&&$rate<=10000,'Enter a rate from ₹0 to ₹100 per coin.');
        check($rate===0||(int)setting('monster.entry_fee_paise',0)===0,'Cash rewards cannot be turned on while the game charges an entry fee.');
        $previous=monster_reward_rate();
        if ($previous!==$rate) {
            put('settings',['id'=>'monster.reward_paise','key'=>'monster.reward_paise','value'=>$rate,'is_public'=>false]);
            log_action($name,'monster_game',null,$previous,$rate);
        }
        return ['rate_paise'=>$rate];
    }
    if ($name==='monster_game_reward_review') {
        $id=text($args['round_id']??'',36);
        $round=rec('monster_game_rounds',$id);
        check($round!==null,'Match not found.',404);
        check(in_array($round['status'],['pending','approved','rejected'],true),'This match has no reward claim.');
        if ($round['status']!=='pending') return ['status'=>$round['status']];
        $verified=$args['verified_coins']??null;
        check(is_int($verified)&&$verified>=0&&$verified<=$round['reported_coins'],'Enter a valid verified elimination count.');
        $note=text($args['note']??'',500);
        check(mb_strlen($note)>=3,'Record how this claim was reviewed.');
        $before=$round;
        if ($verified>0) {
            $profile=rec('profiles',$round['user_id']);
            check(($profile['status']??null)==='active','Only active accounts can receive a reward.');
            // Paid as game coins (1 coin = ₹1), spendable in Business and One Chance, never withdrawable.
            $coins=intdiv($verified*$round['rate_paise'],100);
            if ($coins>0) coin_move($round['user_id'],$coins,'game',$round['id'],'Monster Fight · '.$verified.' verified eliminations');
        }
        $round['status']=$verified>0?'approved':'rejected';
        $round['verified_coins']=$verified;
        $round['reviewed_at']=now();
        $round['reviewed_by']=$admin['id'];
        put('monster_game_rounds',$round,$round['user_id']);
        log_action($name,'monster_game',$id,$before,$round,$note);
        return ['status'=>$round['status']];
    }
    fail(404,'NOT_FOUND','Game reward operation not found.');
}
