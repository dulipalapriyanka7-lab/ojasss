<?php
declare(strict_types=1);
/** OJASSS game coins: 1 coin = ₹1. Earned only from admin-verified game results or admin credits.
 *  Never withdrawable; spendable on business products and One Chance (video voting) packages.
 *  Every movement is a ledger row with a unique id so the same reference can never apply twice. */

function coin_balance(string $userId): int { return (int)(rec('coin_wallets',$userId)['coins']??0); }

/** Apply a signed coin movement. Returns false if this ref was already applied. Fails on insufficient balance. */
function coin_move(string $userId,int $delta,string $type,string $ref,string $note=''): bool {
    check($delta!==0,'Coin amount must not be zero.');
    $id=hash('sha256','coin:'.$type.':'.$ref);
    if (rec('coin_ledger',$id)) return false;
    $bal=coin_balance($userId)+$delta;
    check($bal>=0,'Not enough game coins.',402);
    put('coin_wallets',['id'=>$userId,'user_id'=>$userId,'coins'=>$bal],$userId);
    put('coin_ledger',['id'=>$id,'user_id'=>$userId,'delta'=>$delta,'balance'=>$bal,'type'=>$type,'ref'=>$ref,'note'=>$note],$userId);
    return true;
}

function coin_history(?string $userId,int $limit=50): array {
    $sql="SELECT data FROM oj_records WHERE kind='coin_ledger'".($userId?" AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.user_id'))=?":'')." ORDER BY created_at DESC,id DESC LIMIT ".max(1,min(200,$limit));
    return array_map(fn($v)=>json_decode($v,true),q($sql,$userId?[$userId]:[])->fetchAll(PDO::FETCH_COLUMN));
}

function coins_rpc(string $name,array $p): array {
    if ($name==='coins_wallet') {
        $u=need_user();
        return ['coins'=>coin_balance($u['id']),'rupees_per_coin'=>1,'history'=>coin_history($u['id'],50)];
    }
    $admin=staff(true);
    if ($name==='coins_admin_ledger') {
        $rows=coin_history(null,200);
        $names=[];foreach($rows as &$r){$uid=$r['user_id'];$names[$uid]??=(rec('profiles',$uid)['username']??'Unknown');$r['username']=$names[$uid];}
        $total=(int)q("SELECT COALESCE(SUM(CAST(JSON_EXTRACT(data,'$.coins') AS SIGNED)),0) FROM oj_records WHERE kind='coin_wallets'")->fetchColumn();
        return ['total_coins'=>$total,'ledger'=>$rows];
    }
    if ($name==='coins_admin_adjust') {
        $username=ltrim(text($p['p_username']??'',40),'@');
        $userId=q("SELECT id FROM oj_records WHERE kind='profiles' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.username'))=? LIMIT 1",[$username])->fetchColumn();
        check($userId!==false,'Member not found.',404);
        $delta=$p['p_coins']??null;check(is_int($delta)&&$delta!==0&&abs($delta)<=100000,'Enter coins between -100000 and 100000.');
        $note=text($p['p_note']??'',200);check(mb_strlen($note)>=3,'Write a reason for this adjustment.');
        coin_move((string)$userId,$delta,'admin',uid(),$note.' · by '.$admin['username']);
        log_action($name,'coins',(string)$userId,null,['coins'=>$delta],$note);
        return ['username'=>$username,'coins'=>coin_balance((string)$userId)];
    }
    fail(404,'NOT_FOUND','Unknown coin operation.');
}
