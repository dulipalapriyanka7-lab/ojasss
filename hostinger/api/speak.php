<?php
declare(strict_types=1);
function visible_voice(string $id): array {
 global $actor;$c=rec('comments',$id);check($c!==null,'This voice was not found.',404);visible_post($c['post_id']);check(!blocked($actor['id']??'',$c['user_id']),'This voice was not found.',404);return $c;
}
function speak_route(string $name,array $p): mixed {
 global $actor;$id=$actor['id']??'';
 if($name==='list_comments'){
  $post=(string)($p['p_post_id']??'');visible_post($post);$parent=$p['p_parent_id']??null;
  if($parent){$root=visible_voice((string)$parent);check($root['post_id']===$post&&empty($root['parent_id']),'Invalid reply thread.');}
  $items=array_values(array_filter(rows('comments',null,$post),fn($r)=>($r['parent_id']??null)===$parent&&!blocked($id,$r['user_id'])));
  usort($items,fn($a,$b)=>((int)!empty($b['pinned_at'])<=>(int)!empty($a['pinned_at']))?:strcmp($b['created_at'],$a['created_at'])?:strcmp($b['id'],$a['id']));
  if(!empty($p['p_cursor'])){$index=array_search((string)$p['p_cursor'],array_column($items,'id'),true);$items=$index===false?[]:array_slice($items,$index+1);}else{$items=before($items,$p);}
  return page(array_map('comment_card',$items),$p);
 }
 need_user();
 if($name==='add_comment'){
  check((bool)setting('content.comments_enabled',true),'Speak is currently disabled.');rate('speak:'.$id,30,60);
  $post=(string)($p['p_post_id']??'');$r=visible_post($post);$body=text($p['p_body']??'',1000);$parent=$p['p_parent_id']??null;$root=null;$replyTo=null;$attachment=null;
  if($parent){$root=visible_voice((string)$parent);check($root['post_id']===$post&&empty($root['parent_id']),'Invalid reply thread.');}
  if(!empty($p['p_reply_to_id'])){$replyTo=visible_voice((string)$p['p_reply_to_id']);check($root&&$replyTo['post_id']===$post&&($replyTo['id']===$root['id']||($replyTo['parent_id']??null)===$root['id']),'Invalid reply recipient.');}
  if(!empty($p['p_media_path'])){$path=text($p['p_media_path'],200);$object=rec('objects',object_key('voices',$path));check($object&&$object['user_id']===$id&&$object['bucket']==='voices','Upload your own attachment first.');$attachment=['path'=>$path,'mime_type'=>$object['mime_type'],'size'=>$object['size']];}
  check($body!==''||$attachment!==null,'Add your voice or an attachment first.');
  $c=put('comments',['post_id'=>$post,'user_id'=>$id,'body'=>$body,'parent_id'=>$parent,'reply_to_id'=>$replyTo['id']??null,'attachment'=>$attachment,'language'=>text($p['p_language']??'en',30)],$id,$post);
  notification($replyTo['user_id']??$root['user_id']??$r['author_id'],'comment',$root?'Someone replied to your voice':'A new voice on your post',$body?:'Shared an attachment','/post/'.$post,$post);return comment_card($c);
 }
 $c=visible_voice((string)($p['p_comment_id']??''));
 if($name==='update_comment'){
  check((bool)setting('content.comments_enabled',true),'Speak is currently disabled.');check($c['user_id']===$id,'Only the author can edit this voice.',403);$body=text($p['p_body']??'',1000);check($body!==''||!empty($c['attachment']),'Add your voice first.');$c['body']=$body;$c['edited_at']=now();put('comments',$c,$id,$c['post_id']);return comment_card($c);
 }
 if($name==='pin_comment'){
  $post=visible_post($c['post_id']);check($post['author_id']===$id||($actor['role']??'')==='admin','Only the post creator or an admin can pin a voice.',403);check(empty($c['parent_id']),'Pin a main voice rather than a reply.');$pin=empty($c['pinned_at']);
  foreach(rows('comments',null,$c['post_id']) as $other)if(!empty($other['pinned_at'])){$other['pinned_at']=null;put('comments',$other,$other['user_id'],$other['post_id']);}
  $c['pinned_at']=$pin?now():null;put('comments',$c,$c['user_id'],$c['post_id']);return comment_card($c);
 }
 if($name==='toggle_comment_fire'){
  check((bool)setting('content.comments_enabled',true),'Speak is currently disabled.');rate('voice-fire:'.$id,120,60);
  $key=hash('sha256',$id.':'.$c['id']);if(rec('comment_fires',$key))del('comment_fires',$key);else put('comment_fires',['id'=>$key,'user_id'=>$id,'comment_id'=>$c['id']],$id,$c['id']);return comment_card($c);
 }
 owned('comments',$c['id'],true);$remove=[$c];if(empty($c['parent_id']))$remove=array_merge($remove,array_values(array_filter(rows('comments',null,$c['post_id']),fn($r)=>($r['parent_id']??null)===$c['id'])));
 foreach($remove as $voice){foreach(rows('comment_fires',null,$voice['id']) as $fire)del('comment_fires',$fire['id']);del('comments',$voice['id']);}return ['removed_count'=>count($remove)];
}
