<?php
declare(strict_types=1);
// Monster Fight room: who is playing right now (presence seen in the last 60 s) and a short text chat.

function monster_room_players(): array {
    $cut=gmdate('Y-m-d\TH:i:s.v\Z',time()-60);$out=[];
    foreach (rows('monster_game_presence') as $p) {
        if (($p['seen']??'')<$cut) continue;
        $u=rec('profiles',$p['id']);if(!$u||($u['status']??'')!=='active')continue;
        $out[]=['id'=>$u['id'],'username'=>$u['username'],'avatar_path'=>$u['avatar_path']??null];
    }
    return $out;
}

function monster_chat_rpc(string $name,array $args): array {
    global $actor;
    $state=monster_game_state();
    if (!monster_game_access($state,$actor)) fail(403,'GAME_LOCKED','Get a game pass to join the room.');
    if ($name==='monster_game_room') {
        $cut=gmdate('Y-m-d\TH:i:s.v\Z',time()-900);
        $msgs=array_reverse(array_slice(array_values(array_filter(rows('monster_game_chat'),fn($m)=>$m['created_at']>=$cut)),0,40));
        return ['players'=>monster_room_players(),'messages'=>array_map(fn($m)=>array_intersect_key($m,array_flip(['id','username','text','created_at'])),$msgs)];
    }
    if ($name==='monster_game_chat_send') {
        $u=need_user();rate('monster-chat:'.$u['id'],20,60);
        $t=text($args['text']??'',160);check($t!=='','Type a message.');
        put('monster_game_chat',['user_id'=>$u['id'],'username'=>$u['username'],'text'=>$t],$u['id']);
        put('monster_game_presence',['id'=>$u['id'],'seen'=>now()],$u['id']);
        return ['ok'=>true];
    }
    // Voice: players who turned their mic on, plus WebRTC offer/answer/ice messages relayed between them.
    if ($name==='monster_game_voice_poll') {
        $u=need_user();
        if (array_key_exists('on',$args)) put('monster_game_voice',['id'=>$u['id'],'username'=>$u['username'],'on'=>(bool)$args['on'],'seen'=>time()],$u['id']);
        $me=rec('monster_game_voice',$u['id']);if($me&&$me['on']){$me['seen']=time();put('monster_game_voice',$me,$u['id']);}
        $peers=[];foreach(rows('monster_game_voice') as $v)if($v['id']!==$u['id']&&$v['on']&&$v['seen']>time()-20)$peers[]=['id'=>$v['id'],'username'=>$v['username']];
        $sig=[];foreach(rows('monster_game_voice_sig',null,$u['id']) as $s){if($s['at']>time()-60)$sig[]=['from'=>$s['from'],'type'=>$s['type'],'data'=>$s['data']];del('monster_game_voice_sig',$s['id']);}
        return ['me'=>$u['id'],'peers'=>$peers,'signals'=>array_reverse($sig)];
    }
    if ($name==='monster_game_voice_signal') {
        $u=need_user();rate('monster-voice:'.$u['id'],240,60);
        $to=text($args['to']??'',36);$type=enum_value($args['type']??'',['offer','answer','ice','bye']);
        $data=$args['data']??null;check(strlen(json_encode($data))<=12000,'Signal too large.');
        $peer=rec('monster_game_voice',$to);check($peer!==null&&$peer['on'],'That player is not on voice.',404);
        put('monster_game_voice_sig',['from'=>$u['id'],'to'=>$to,'type'=>$type,'data'=>$data,'at'=>time()],$u['id'],$to);
        return ['ok'=>true];
    }
    fail(404,'NOT_FOUND','Unknown function.');
}
