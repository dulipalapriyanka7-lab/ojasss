<?php
declare(strict_types=1);
function custom_push_draft(array $b):array {
 global $config;$admin=staff(true);$title=text($b['title']??'',100);$body=text($b['body']??'',300);check($title!==''&&$body!=='','Enter a title and message.');
 $category=text($b['category']??'',40);check($category===''||category_available($category),'Choose an available category.');
 $audience=enum_value($b['audience']??'all',['all','interested']);check($audience!=='interested'||$category!=='','Choose a category for this audience.');
 $delivery=enum_value($b['delivery']??'android',['android','all']);$image=$b['imagePath']??null;
 if($image!==null){check(is_string($image),'Invalid image.');$object=rec('objects',object_key('media',$image));check($object&&$object['user_id']===$admin['id']&&in_array($object['mime_type'],['image/jpeg','image/png','image/webp'],true)&&$object['size']<=1048576,'Upload an image under 1 MB from this account.');}
 $labels=setting('categories.config',[]);$label=$category!==''?($labels[$category]['label']??(['news'=>'News Reporter · 48hrs','part_time_jobs'=>'Part Time · 48hrs'][$category]??ucwords(str_replace('_',' ',$category)))):'';
 return ['title'=>$title,'body'=>$body,'category'=>$category,'category_label'=>$label,'audience'=>$audience,'delivery'=>$delivery,'image_path'=>$image,'image_url'=>$image?rtrim($config['site_url'],'/').'/api/storage/v1/object/public/media/'.implode('/',array_map('rawurlencode',explode('/',$image))):null,'link'=>$category==='one_chance'?'/one-chance':($category!==''?'/?category='.rawurlencode($category):'/'),'test'=>($b['test']??false)===true];
}
function custom_push_matches(array $u,array $campaign):bool {
 if(($u['status']??'')!=='active')return false;
 if(!empty($campaign['test']))return $u['id']===$campaign['admin_id'];
 if($campaign['audience']==='all')return true;
 $preferences=$u['category_preferences']??[];return !empty($preferences['show_all'])||in_array($campaign['category'],$preferences['selected']??[],true);
}
function custom_push_route(string $action,array $b):array {
 global $actor;staff(true);
 if($action==='history'){
  $list=array_slice(rows('push_campaigns'),0,15);foreach($list as &$c){$counts=q("SELECT JSON_UNQUOTE(JSON_EXTRACT(data,'$.status')) AS state,COUNT(*) AS total FROM oj_records WHERE kind='push_queue' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.campaign_id'))=? GROUP BY state",[$c['id']])->fetchAll(PDO::FETCH_KEY_PAIR);$c['dispatched']=(int)($counts['sent']??0);$c['failed']=(int)($counts['failed']??0);$c['pending']=(int)($counts['pending']??0);}return $list;
 }
 $draft=custom_push_draft($b);$draft['admin_id']=$actor['id'];$eligible=0;foreach(rows('profiles') as $u)if(custom_push_matches($u,$draft))$eligible++;
 if($action==='preview')return ['recipients'=>$eligible,'link'=>$draft['link'],'configured'=>is_file($GLOBALS['config']['private_dir'].'/firebase-service-account.json')];
 check($action==='send','Invalid operation.',404);check($eligible>0,'No active users match this audience.');check(is_file($GLOBALS['config']['private_dir'].'/firebase-service-account.json'),'Configure Firebase before sending.',409);
 $request=text($b['requestId']??'',36);check((bool)preg_match('/^[a-f0-9-]{36}$/',$request),'Invalid send request.');$id=hash('sha256',$actor['id'].':'.$request);$existing=rec('push_campaigns',$id);if($existing)return ['id'=>$id,'recipients'=>$existing['recipients'],'duplicate'=>true];
 rate('custom-push:'.$actor['id'],20,3600);$campaign=put('push_campaigns',$draft+['id'=>$id,'status'=>'queued','after_user'=>'','queued'=>0,'recipients'=>$eligible],$actor['id']);log_action('custom_push_send','push_campaign',$id,null,$campaign);return ['id'=>$id,'recipients'=>$eligible];
}
function process_custom_push_jobs(int $batch=100):int {
 global $db;$owned=!$db->inTransaction();if($owned)$db->beginTransaction();
 try{
  q('SELECT id FROM oj_mutex WHERE id=1 FOR UPDATE');$serialized=q("SELECT data FROM oj_records WHERE kind='push_campaigns' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.status'))='queued' ORDER BY created_at,id LIMIT 1")->fetchColumn();$count=0;
  if($serialized!==false){$c=json_decode($serialized,true);$users=q("SELECT data FROM oj_records WHERE kind='profiles' AND id>? AND created_at<=? ORDER BY id LIMIT ".max(1,min(1000,$batch)),[$c['after_user'],$c['created_at']])->fetchAll(PDO::FETCH_COLUMN);
   foreach($users as $value){$u=json_decode($value,true);$c['after_user']=$u['id'];if(!custom_push_matches($u,$c))continue;$id=hash('sha256','campaign:'.$c['id'].':'.$u['id']);if(rec('notifications',$id))continue;
    put('notifications',['id'=>$id,'type'=>'announcement','title'=>$c['title'],'body'=>$c['body'],'link'=>$c['link'],'post_id'=>null,'read_at'=>null,'actor'=>null,'post_thumbnail_path'=>null,'image_url'=>$c['image_url'],'category'=>$c['category'],'category_label'=>$c['category_label'],'campaign_id'=>$c['id'],'delivery'=>$c['delivery']],$u['id']);
    put('push_queue',['id'=>$id,'notification_id'=>$id,'user_id'=>$u['id'],'campaign_id'=>$c['id'],'attempts'=>0,'status'=>'pending','next_attempt_at'=>time()],$u['id'],$id);$c['queued']++;$count++;
   }
   if(count($users)<max(1,min(1000,$batch)))$c['status']='complete';put('push_campaigns',$c,$c['admin_id']);
  }
  if($owned)$db->commit();return $count;
 }catch(Throwable $e){if($owned&&$db->inTransaction())$db->rollBack();throw $e;}
}
