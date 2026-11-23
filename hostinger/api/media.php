<?php
declare(strict_types=1);
require_once __DIR__.'/city.php';
function object_key(string $bucket,string $path): string {return hash('sha256',$bucket.'/'.$path);}
function readable_post_media(array $post):bool {
 global $actor;$me=$actor['id']??'';$author=rec('profiles',$post['author_id']);
 if(!$author||($post['status']??'')==='deleted'||post_expired($post)||$author['status']!=='active'||blocked($me,$author['id']))return false;
 if($me===$author['id'])return true;
 if(($post['status']??'')!=='published')return false;
 $visibility=$post['visibility']??'public';return $visibility==='public'||($visibility==='followers'&&related('follows',$me,$author['id']));
}
function storage_route(string $path): never {
    global $config;
    check((bool)preg_match('~^/storage/v1/object/(public/)?(media|avatars|receipts|voices)/([a-f0-9-]{36})/([a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|mp4|webm|mov))$~i',$path,$m),'Invalid storage path.',400);
    $public=$m[1]!=='';$bucket=$m[2];$owner=$m[3];$key=$owner.'/'.$m[4];$recordId=object_key($bucket,$key);
    if($_SERVER['REQUEST_METHOD']==='POST'){
      $u=need_user();check(!$public&&$u['id']===$owner,'You cannot upload here.',403);check(!rec('objects',$recordId),'This object already exists.',409);
      $max=($bucket==='receipts'?3:($bucket==='voices'?20:($bucket==='avatars'?10:(int)setting('uploads.max_video_mb',100))))*1048576;$len=(int)($_SERVER['CONTENT_LENGTH']??0);check($len>0&&$len<=$max,'Upload exceeds the allowed size.',413);
      $dir=$config['private_dir'].'/uploads/'.$bucket.'/'.$owner;if(!is_dir($dir)&&!mkdir($dir,0700,true))fail(503,'STORAGE_UNAVAILABLE','Storage unavailable.');$disk=$dir.'/'.$m[4];
      $in=fopen('php://input','rb');$out=fopen($disk,'xb');check($out!==false,'Upload unavailable.');$n=stream_copy_to_stream($in,$out,$max+1);fclose($out);fclose($in);
      if($n!==$len||$n>$max){unlink($disk);fail(413,'TOO_LARGE','Upload exceeds the allowed size.');}
      $mime=(new finfo(FILEINFO_MIME_TYPE))->file($disk);$allowed=['image/jpeg'=>['jpg','jpeg'],'image/png'=>['png'],'image/webp'=>['webp'],'video/mp4'=>['mp4'],'video/webm'=>['webm'],'video/quicktime'=>['mov']];if($bucket==='voices')$allowed['image/gif']=['gif'];$ext=strtolower(pathinfo($disk,PATHINFO_EXTENSION));
      if(!isset($allowed[$mime])||!in_array($ext,$allowed[$mime],true)||(in_array($bucket,['avatars','receipts'],true)&&!str_starts_with($mime,'image/'))||str_starts_with($mime,'image/')&&$n>(int)setting('uploads.max_image_mb',10)*1048576){unlink($disk);fail(422,'INVALID_MEDIA','Unsupported media file or size.');}
      if(str_starts_with($mime,'image/')){$size=@getimagesize($disk);if(!$size||$size[0]>16000||$size[1]>16000){unlink($disk);fail(422,'INVALID_MEDIA','Invalid image dimensions.');}}
      put('objects',['id'=>$recordId,'user_id'=>$owner,'bucket'=>$bucket,'path'=>$key,'disk_path'=>$disk,'mime_type'=>$mime,'size'=>$n],$owner);json_out(['Key'=>$bucket.'/'.$key,'Id'=>$recordId]);
    }
    check(in_array($_SERVER['REQUEST_METHOD'],['GET','HEAD'],true),'Method not allowed.',405);$r=rec('objects',$recordId);if(!$r||!is_string($r['disk_path']??null)||!is_file($r['disk_path']))fail(404,'NOT_FOUND','File not found.');
    // Never expose an upload until it is referenced by a visible post/profile, except to its owner.
    global $actor;$visible=($actor['id']??'')===$owner||($bucket==='receipts'&&($actor['role']??'')==='admin');
    if(!$visible&&$bucket==='avatars'){foreach(rows('profiles') as $u)if($u['avatar_path']===$key&&$u['status']==='active'){$visible=true;break;}}
    if(!$visible&&$bucket==='media'){foreach(rows('posts',$owner) as $p)if(($p['media_path']===$key||$p['thumbnail_path']===$key)&&readable_post_media($p)){$visible=true;break;}}
    if(!$visible&&$bucket==='media'){foreach(rows('statuses',$owner) as $status)if(($status['media_path']??'')===$key&&strtotime((string)($status['expires_at']??''))>time()){$visible=true;break;}}
    if(!$visible&&$bucket==='voices'){foreach(rows('comments',$owner) as $voice)if(($voice['attachment']['path']??null)===$key&&!blocked($actor['id']??'',$owner)){ $post=rec('posts',$voice['post_id']);if($post&&readable_post_media($post)){$visible=true;break;} }}
    if(!$visible&&$bucket==='media')foreach(rows('demo_videos') as $demo)if(($demo['media_path']??null)===$key||($demo['thumbnail_path']??null)===$key){$visible=true;break;}
    if(!$visible&&$bucket==='media')foreach(rows('push_campaigns',$owner) as $campaign)if(($campaign['image_path']??null)===$key){$visible=true;break;}
    if(!$visible&&$bucket==='media'&&function_exists('viral_challenge_visible'))foreach(rows('viral_challenge_assets',null,$recordId) as $asset){
      $challenge=rec(VIRAL_CHALLENGES,$asset['challenge_id']);
      if($challenge&&$challenge['state']!=='draft'&&in_array($key,[$challenge['banner_path'],$challenge['icon_path']],true)&&
        (viral_challenge_visible($challenge,$actor)||viral_challenge_member($challenge,$actor)||($actor['role']??'')==='admin')){$visible=true;break;}
    }
    if(!$visible&&$bucket==='media')foreach(rows('biz_products') as $bp)if(str_ends_with((string)($bp['image_url']??''),'/media/'.$key)){$visible=true;break;}
    if(!$visible)fail(404,'NOT_FOUND','File not found.');
    $size=filesize($r['disk_path']);$modified=filemtime($r['disk_path']);$etag='"'.hash('sha256',$recordId.':'.$size.':'.$modified).'"';
    if($bucket!=='receipts'){header('ETag: '.$etag);header('Last-Modified: '.gmdate('D, d M Y H:i:s',$modified).' GMT');}
    if($bucket!=='receipts'&&!isset($_SERVER['HTTP_RANGE'])&&($_SERVER['HTTP_IF_NONE_MATCH']??'')===$etag){header('Cache-Control: private, max-age=86400');http_response_code(304);exit;}
    if(isset($_SERVER['HTTP_IF_RANGE'])&&$_SERVER['HTTP_IF_RANGE']!==$etag&&$_SERVER['HTTP_IF_RANGE']!==gmdate('D, d M Y H:i:s',$modified).' GMT')unset($_SERVER['HTTP_RANGE']);
    $start=0;$end=$size-1;$status=200;
    if(isset($_SERVER['HTTP_RANGE'])&&preg_match('/^bytes=(\d*)-(\d*)$/',$_SERVER['HTTP_RANGE'],$range)){
      if($range[1]===''){$start=max(0,$size-(int)$range[2]);}else{$start=(int)$range[1];$end=$range[2]===''?$end:min($end,(int)$range[2]);}
      if($start>$end||$start>=$size){header('Content-Range: bytes */'.$size);http_response_code(416);exit;}$status=206;
    }
    http_response_code($status);header('Content-Type: '.$r['mime_type']);header('X-Content-Type-Options: nosniff');header('Accept-Ranges: bytes');header($bucket==='receipts'?'Cache-Control: private, no-store':'Cache-Control: private, max-age=86400');header('Content-Length: '.($end-$start+1));if($status===206)header("Content-Range: bytes $start-$end/$size");
    if($_SERVER['REQUEST_METHOD']==='HEAD')exit;@set_time_limit(0);@ini_set('zlib.output_compression','0');header('X-Accel-Buffering: no');while(ob_get_level()>0)ob_end_clean();$fp=fopen($r['disk_path'],'rb');fseek($fp,$start);$left=$end-$start+1;while($left>0&&!feof($fp)&&!connection_aborted()){ $chunk=fread($fp,min(262144,$left));if($chunk===false||$chunk==='')break;echo $chunk;$left-=strlen($chunk);flush();}fclose($fp);exit;
}
function safe_cta(?array $cta): array {
    if(!$cta)return ['cta_type'=>null,'cta_label'=>null,'cta_url'=>null];$type=rec('cta_types',(string)($cta['type']??''));check($type!==null,'Invalid action type.');$url=text($cta['url']??'',1000);
    // Older app forms sent bare contact values; normalize before validating them.
    $compact=preg_replace('/\s+/','',$url);
    if($type['target_kind']==='phone'&&preg_match('/^\+?[0-9]{7,16}$/',$compact))$url='tel:'.$compact;
    if($type['target_kind']==='whatsapp'&&preg_match('/^\+?[0-9]{7,16}$/',$compact))$url='https://wa.me/'.ltrim($compact,'+');
    if($type['target_kind']==='email'&&filter_var($url,FILTER_VALIDATE_EMAIL))$url='mailto:'.$url;
    switch($type['target_kind']){
      case 'url':check(str_starts_with($url,'https://')&&(bool)filter_var($url,FILTER_VALIDATE_URL)&&!parse_url($url,PHP_URL_USER),'Use a valid HTTPS address.');break;
      case 'phone':check((bool)preg_match('/^tel:\+?[0-9]{7,16}$/',$url),'Enter a valid phone action.');break;
      case 'whatsapp':check((bool)preg_match('~^https://(wa\.me/[0-9]{7,16}|api\.whatsapp\.com/send\?phone=[0-9]{7,16})(\?.*)?$~',$url),'Enter a valid WhatsApp link.');break;
      case 'email':check(str_starts_with($url,'mailto:')&&(bool)filter_var(substr($url,7),FILTER_VALIDATE_EMAIL),'Enter a valid email action.');break;
    }
    return ['cta_type'=>$type['id'],'cta_label'=>isset($cta['label'])?text($cta['label'],60):null,'cta_url'=>$url];
}
function post_metadata(array $b): array {
    $tags=$b['hashtags']??[];check(is_array($tags)&&array_is_list($tags)&&count($tags)<=20,'Use up to 20 hashtags.');
    foreach($tags as $tag)check(is_string($tag)&&(bool)preg_match('/^[\p{L}\p{M}\p{N}_]{1,40}$/u',$tag),'Invalid hashtag.');
    $source=null;$rights=false;
    if(isset($b['repost'])){$r=$b['repost'];check(is_array($r),'Invalid source details.');$source=text($r['sourceUrl']??'',500);check($source===''||(str_starts_with($source,'https://')&&(bool)filter_var($source,FILTER_VALIDATE_URL)&&!parse_url($source,PHP_URL_USER)&&!parse_url($source,PHP_URL_PASS)),'Use a valid HTTPS source link.');$source=$source===''?null:$source;$rights=($r['rightsConfirmed']??false)===true;check($rights,'Confirm your rights to share this content.');}
    return ['hashtags'=>array_values(array_unique($tags)),'visibility'=>enum_value($b['visibility']??'public',['public','followers','private']),'audio_title'=>isset($b['audioTitle'])?text($b['audioTitle'],120):null,'repost_source'=>$source,'rights_confirmed'=>$rights];
}
function function_route(string $name,array $b): mixed {
    global $actor;$id=$actor['id']??'';
    if(in_array($name,['custom-push-preview','custom-push-send','custom-push-history'],true))return custom_push_route(substr($name,12),$b);
    if($name==='configure-push')return push_configuration($b);
    if($name==='push-status')return push_status();
    if($name==='test-push'){staff(true);$owner=$actor;$actor=null;notification($owner['id'],'system','OJASSS notifications are ready','Your notification test was queued successfully.','/notifications');$actor=$owner;return ['ok'=>true,'message'=>'Test queued. The notification worker sends it on its next run.'];}
    if($name==='create-post'){
      need_user();rate('posts:'.$id,20,3600);$kind=enum_value($b['kind']??'',['video','poster']);$origin=$kind==='video'?enum_value($b['contentOrigin']??'',['copy_paste','new_content']):null;$path=(string)($b['mediaPath']??'');$o=rec('objects',object_key('media',$path));check($o&&$o['user_id']===$id,'Upload the media first.');
      check($kind==='video'?str_starts_with($o['mime_type'],'video/'):str_starts_with($o['mime_type'],'image/'),'Media does not match the post type.');$thumb=$b['thumbnailPath']??null;
      if($thumb){$t=rec('objects',object_key('media',$thumb));check($t&&$t['user_id']===$id&&str_starts_with($t['mime_type'],'image/'),'Invalid thumbnail.');}
      $category=enum_value($b['category']??'',['technology','education','gaming','lifestyle','one_chance','horror_stories','music_dance','world_education','entertainment','business_promotion','public_complaint','news','part_time_jobs','full_time_jobs']);check(category_available($category),'This category is currently unavailable.');check($category!=='one_chance','One Chance is unlocked automatically when a video becomes Viral.');$caption=text($b['caption']??'',2000);check($kind==='video'||$caption!=='','Enter a caption.');
      $duration=$b['durationMs']??null;check($duration===null||is_numeric($duration)&&$duration>0&&$duration<=(int)setting('uploads.max_video_seconds',120)*1000,'Video exceeds the duration limit.');
      foreach(['width','height'] as $dim)check(!isset($b[$dim])||is_numeric($b[$dim])&&$b[$dim]>0&&$b[$dim]<=16000,'Invalid media dimensions.');
      $status=$category==='public_complaint'&&setting('content.complaints_require_review',true)?'pending_review':'published';
      $metadata=post_metadata($b);
      $viralChallenge=null;
      if(isset($b['viralChallengeId'])){
        check(!isset($b['profileStatus'])||$b['profileStatus']===false,'Submit a regular public video.');
        $viralChallenge=viral_challenge_validate_upload($b['viralChallengeId'],$actor,$kind,$category,$metadata['visibility']);
        $submissionId=relation_id($viralChallenge['id'],$path);
        $existingSubmission=rec(VIRAL_SUBMISSIONS,$submissionId);
        if($existingSubmission){$existingPost=rec('posts',$existingSubmission['post_id']);check((bool)$existingPost,'This submitted video was removed.',409);return ['id'=>$existingPost['id'],'status'=>$existingPost['status']];}
      }
      $series=['series_id'=>null,'series_title'=>null,'episode_number'=>null,'episode_total'=>null,'series_genre'=>null,'episode_title'=>null,'episode_access'=>null,'episode_interest_goal'=>null];
      if(!empty($b['series'])){
        check($kind==='video'&&is_array($b['series']),'Episodes must be videos.');$s=$b['series'];$title=text($s['title']??'',80);check($title!=='','Enter a short movie title.');$number=$s['episodeNumber']??null;$total=$s['episodeTotal']??null;
        check(is_int($number)&&$number>=1&&$number<=1000000&&($total===null||(is_int($total)&&$total>=1&&$total<=1000000&&$number<=$total)),'Choose a valid episode number.');
        $access=enum_value($s['access']??'free',['free','interest','premium']);$interestGoal=$s['interestGoal']??15;check(is_int($interestGoal)&&$interestGoal>=1&&$interestGoal<=100000,'Choose a valid interest goal.');
        $series=['series_id'=>hash('sha256',$id.'|'.mb_strtolower($title)),'series_title'=>$title,'episode_number'=>$number,'episode_total'=>$total,'series_genre'=>text($s['genre']??'',40),'episode_title'=>text($s['episodeTitle']??'',100),'episode_access'=>$access,'episode_interest_goal'=>$interestGoal];
        $maxEpisodes=(int)setting('episodes.max_per_series',0);if($maxEpisodes>0)check($number<=$maxEpisodes,'This series is limited to '.$maxEpisodes.' episodes by the administrator.');
        foreach(rows('posts',$id) as $existing)if(($existing['series_id']??'')===$series['series_id']&&($existing['episode_number']??0)===$number)fail(409,'EPISODE_EXISTS','You already uploaded this episode.');
      }
      $r=put('posts',['author_id'=>$id,'kind'=>$kind,'content_origin'=>$origin,'media_path'=>$path,'thumbnail_path'=>$thumb,'mime_type'=>$o['mime_type'],'width'=>$b['width']??null,'height'=>$b['height']??null,'duration_ms'=>$duration,'caption'=>$caption,'category'=>$category,'language'=>text($b['language']??'en',20),'country'=>country_code($b['country']??$actor['country']??''),'city'=>function_exists('city_clean')?city_clean($b['city']??''):null,'location'=>isset($b['location'])?text($b['location'],200):null,'status'=>$status,'views_count'=>0,'shares_count'=>0,'cta_clicks'=>0,'moderation_reason'=>null]+$series+$metadata+safe_cta($b['cta']??null),$id);
      if($viralChallenge)put(VIRAL_SUBMISSIONS,['id'=>$submissionId,'challenge_id'=>$viralChallenge['id'],'user_id'=>$id,'post_id'=>$r['id'],'moderation'=>'included'],$id,$viralChallenge['id']);
      if(!empty($series['series_id'])&&($b['series']['applyAccessToExisting']??false)===true){$through=$b['series']['applyThrough']??$series['episode_number'];check(is_int($through)&&$through>=1&&$through<=1000000,'Choose a valid episode range.');foreach(rows('posts',$id) as $existing)if(($existing['series_id']??'')===$series['series_id']&&(int)($existing['episode_number']??0)<=$through){$existing['episode_access']=$series['episode_access'];put('posts',$existing,$id);}}
      if(($b['profileStatus']??false)===true){
        check($status==='published'&&($metadata['visibility']??'public')==='public','A status must be a public post.');
        $profile=need_user();$profile['status_post_id']=$r['id'];$profile['status_expires_at']=gmdate('Y-m-d\\TH:i:s\\Z',time()+43200);$actor=put('profiles',$profile,$id);
      }
      if($category==='public_complaint'){
        $c=$b['complaint']??[];check(!empty($c['acceptedDisclaimer']),'Accept the complaint disclaimer.');$a=!empty($c['authorityId'])?rec('authorities',(string)$c['authorityId']):null;
        put('complaints',['id'=>$r['id'],'user_id'=>$id,'post_id'=>$r['id'],'subcategory'=>text($c['subcategory']??'',100),'description'=>text($c['description']??'',4000),'location'=>text($c['location']??'',250),'legal_assistance_requested'=>(bool)($c['legalAssistanceRequested']??false),'forward_requested'=>(bool)($c['forwardRequested']??false),'authority_id'=>$a['id']??null,'authority_name'=>$a['name']??null,'forward_status'=>!empty($c['forwardRequested'])?'pending':'not_requested','forwarded_at'=>null,'status'=>'submitted','authority_response'=>null,'authority_responded_at'=>null],$id,$r['id']);
      }queue_new_video_alerts($r);return ['id'=>$r['id'],'status'=>$status];
    }
    if($name==='create-status'){
      need_user();rate('status:'.$id,20,3600);$path=text($b['mediaPath']??'',200);$object=rec('objects',object_key('media',$path));check($object&&$object['user_id']===$id,'Upload status media first.');check(str_starts_with($object['mime_type'],'image/')||str_starts_with($object['mime_type'],'video/'),'Choose an image or video for your status.');
      $visibility=enum_value($b['visibility']??'public',['public','followers']);$caption=text($b['caption']??'',280);$r=put('statuses',['user_id'=>$id,'media_path'=>$path,'mime_type'=>$object['mime_type'],'caption'=>$caption,'visibility'=>$visibility,'expires_at'=>gmdate('Y-m-d\\TH:i:s\\Z',time()+43200)],$id);
      $profile=need_user();$profile['status_post_id']=$r['id'];$profile['status_expires_at']=$r['expires_at'];$actor=put('profiles',$profile,$id);return $r;
    }
    if($name==='create-account-deletion-request'){
      $email=email_address($b['email']??'');$exists=q('SELECT user_id FROM oj_credentials WHERE email=?',[$email])->fetchColumn();$r=$exists?issue_code($email,'deletion',['reason'=>text($b['reason']??'',2000),'source'=>enum_value($b['source']??'web',['web','android'])]):['id'=>uid(),'expiresInMinutes'=>10];return ['ok'=>true,'verificationId'=>$r['id'],'expiresInMinutes'=>10];
    }
    if($name==='verify-account-deletion-otp'){
      $email=email_address($b['email']??'');$payload=consume_code($email,'deletion',(string)($b['code']??''),(string)($b['verificationId']??''));$user=q('SELECT user_id FROM oj_credentials WHERE email=?',[$email])->fetchColumn();check((bool)$user,'Invalid request.');deletion_request($user,$payload['reason']??'',$payload['source']??'web');return ['ok'=>true,'message'=>'Your account deletion request has been recorded.'];
    }
    if($name==='send-complaint-email'){
      staff();$post=(string)($b['postId']??'');$c=rec('complaints',$post);check($c!==null,'Complaint not found.',404);$a=rec('authorities',$c['authority_id']??'');check($a&&$a['is_active']&&$c['forward_requested'],'Choose an active authority and obtain the creator’s forwarding request.');
      send_mail($a['email'],'OJASSS public complaint',"A creator requested forwarding this complaint:\n\n".$c['description']."\nLocation: ".$c['location']."\n\nView: https://ojasss.com/post/".$post);$old=$c;$c['forward_status']='forwarded';$c['forwarded_at']=now();$c['status']='forwarded';put('complaints',$c,$c['user_id'],$post);log_action('forward_complaint','complaint',$post,$old,$c);return ['ok'=>true,'forwardStatus'=>'forwarded'];
    }
    fail(404,'NOT_FOUND','Operation not found.');
}
