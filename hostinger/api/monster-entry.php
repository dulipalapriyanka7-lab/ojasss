<?php
declare(strict_types=1);
// Monster Fight paid entry: Rs 20 by UPI, admin verifies the UTR, the player gets a 24-hour game pass.
// Paid entry is only allowed while cash elimination rewards are off (monster.reward_paise = 0),
// so no money can be won back. Coins inside the game have no cash value and cannot be withdrawn.

const MONSTER_PASS_SECONDS = 86400;

function monster_entry_fee_paise(): int { return (int)setting('monster.entry_fee_paise',0); }
function monster_paid_entry_on(): bool { return monster_entry_fee_paise()>0 && (int)setting('monster.reward_paise',0)===0; }
function monster_pass(?array $viewer): ?array {
    if (!$viewer) return null;
    $best=null;
    foreach (rows('monster_game_entries',$viewer['id']) as $e) if (($e['status']??'')==='approved' && ($e['expires_at']??0)>time() && (!$best || $e['expires_at']>$best['expires_at'])) $best=$e;
    return $best;
}
function monster_entry_public(array $e): array { return array_intersect_key($e,array_flip(['id','status','amount_paise','utr','created_at','expires_at','reason'])); }

function monster_entry_rpc(string $name,array $args): array {
    if ($name==='monster_game_entry_status') {
        $u=need_user();$mine=array_map('monster_entry_public',array_slice(rows('monster_game_entries',$u['id']),0,5));$pass=monster_pass($u);
        return ['fee_paise'=>monster_entry_fee_paise(),'active'=>monster_paid_entry_on(),'upi_id'=>setting('one_chance.upi_id',''),'pass_until'=>$pass?gmdate(DATE_ATOM,$pass['expires_at']):null,'requests'=>$mine];
    }
    if ($name==='monster_game_entry_submit') {
        $u=need_user();check(monster_paid_entry_on(),'Paid entry is not open.');
        rate('monster-entry:'.$u['id'],6,3600);
        $utr=strtoupper(text($args['utr']??'',40));check((bool)preg_match('/^[A-Z0-9]{8,30}$/',$utr),'Enter the 12-digit UPI reference (UTR) from your payment.');
        foreach (rows('monster_game_entries') as $e) check(($e['utr']??'')!==$utr,'This payment reference was already submitted.');
        foreach (rows('monster_game_entries',$u['id']) as $e) check(($e['status']??'')!=='pending','Your previous payment is still being checked.');
        return monster_entry_public(put('monster_game_entries',['user_id'=>$u['id'],'username'=>$u['username'],'amount_paise'=>monster_entry_fee_paise(),'utr'=>$utr,'status'=>'pending','expires_at'=>0],$u['id']));
    }
    $admin=staff(true);
    if ($name==='monster_game_entry_queue') {
        $r=array_values(array_filter(rows('monster_game_entries'),fn($e)=>($e['status']??'')==='pending'));
        $recent=array_slice(array_values(array_filter(rows('monster_game_entries'),fn($e)=>($e['status']??'')!=='pending')),0,20);
        return ['fee_paise'=>monster_entry_fee_paise(),'active'=>monster_paid_entry_on(),'reward_paise'=>(int)setting('monster.reward_paise',0),'pending'=>$r,'recent'=>$recent];
    }
    if ($name==='monster_game_entry_review') {
        $e=rec('monster_game_entries',text($args['id']??'',36));check($e!==null,'Payment not found.',404);check($e['status']==='pending','This payment was already reviewed.');
        $ok=(bool)($args['approve']??false);$e['status']=$ok?'approved':'rejected';$e['reviewed_at']=now();$e['reviewed_by']=$admin['username']??null;
        $e['reason']=$ok?null:text($args['reason']??'',200);if($ok)$e['expires_at']=time()+MONSTER_PASS_SECONDS;
        put('monster_game_entries',$e,$e['user_id']);log_action($name,'monster_game',$e['id'],null,['status'=>$e['status']]);return $e;
    }
    if ($name==='monster_game_entry_fee') {
        $rupees=$args['rupees']??null;check(is_int($rupees)&&$rupees>=0&&$rupees<=1000,'Enter a fee between 0 and 1000.');
        if ($rupees>0) check((int)setting('monster.reward_paise',0)===0,'Turn off cash elimination rewards before charging an entry fee.');
        put('settings',['id'=>'monster.entry_fee_paise','key'=>'monster.entry_fee_paise','value'=>$rupees*100,'is_public'=>false]);
        log_action($name,'monster_game',null,null,['fee_paise'=>$rupees*100]);return ['fee_paise'=>$rupees*100];
    }
    fail(404,'NOT_FOUND','Unknown function.');
}
