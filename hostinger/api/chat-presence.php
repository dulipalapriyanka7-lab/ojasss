<?php
declare(strict_types=1);
function chat_presence_rpc(string $name,array $p): array {
 $user=need_user();$room=conversation(text($p['conversation_id']??'',100));check(!empty($room['is_group']),'Choose a group.');
 $key=relation_id($user['id'],$room['id']);
 if($name==='chat_presence_update'){
  rate('chat-presence:'.$user['id'],30,60);$typing=($p['typing']??false)===true;
  put('chat_members',['id'=>$key,'user_id'=>$user['id'],'conversation_id'=>$room['id'],'joined_at'=>rec('chat_members',$key)['joined_at']??now()],$user['id'],$room['id']);
  put('chat_presence',['id'=>$key,'user_id'=>$user['id'],'online_until'=>($p['online']??true)?time()+35:0,'typing_until'=>$typing?time()+6:0],$user['id'],$room['id']);
 }
 $members=rows('chat_members',null,$room['id']);$online=[];$typing=[];
 foreach(rows('chat_presence',null,$room['id']) as $presence){if($presence['online_until']<time())continue;$profile=rec('profiles',$presence['user_id']);if(!$profile||$profile['status']!=='active'||blocked($user['id'],$profile['id']))continue;$card=array_intersect_key($profile,array_flip(['id','username','display_name','avatar_path','role']));$online[]=$card;if($presence['typing_until']>time()&&$profile['id']!==$user['id'])$typing[]=$card;}
 return ['member_count'=>count($members),'online_count'=>count($online),'members'=>array_slice($online,0,50),'typing'=>$typing];
}
