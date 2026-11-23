<?php
declare(strict_types=1);
// Run every minute using Hostinger's PHP cron. HTTP requests are refused.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/core.php';require __DIR__.'/auth.php';require __DIR__.'/media.php';require __DIR__.'/post-delete.php';
require __DIR__.'/video-notifications.php';require __DIR__.'/push-message.php';
require __DIR__.'/video-download.php';
require __DIR__.'/custom-push.php';
require __DIR__.'/challenge-tasks.php';
$private=getenv('OJASSS_PRIVATE_DIR')?:dirname(__DIR__,2).'/ojasss-private';
if(!is_file($private.'/config.php')||!is_file($private.'/firebase-service-account.json')){echo "Push is not configured.\n";exit(0);}
$lock=fopen($private.'/push.lock','c');if(!flock($lock,LOCK_EX|LOCK_NB))exit(0);
$config=require $private.'/config.php';$config['private_dir']=$private;$actor=null;
$db=new PDO('mysql:host='.$config['db_host'].';port='.($config['db_port']??3306).';dbname='.$config['db_name'].';charset=utf8mb4',$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
// Start the video compressor in the background (it keeps its own lock, one video at a time).
if(is_file(__DIR__.'/media-worker.php')&&function_exists('exec')){@exec('nohup '.escapeshellarg(PHP_BINARY).' '.escapeshellarg(__DIR__.'/media-worker.php').' > /dev/null 2>&1 &');}
try {
    $db->beginTransaction();
    q('SELECT id FROM oj_mutex WHERE id=1 FOR UPDATE');
    challenge_tick();
    $db->commit();
} catch(Throwable $error) {
    if($db->inTransaction()) $db->rollBack();
    error_log('OJASSS task scheduler: '.$error->getMessage());
}
purge_deleted_files();
purge_video_downloads();
process_video_alert_jobs();
process_custom_push_jobs();
function http_json(string $url,array $data,array $headers=[],bool $form=false): array {
    $ch=curl_init($url);curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>$form?http_build_query($data):json_encode($data),CURLOPT_HTTPHEADER=>array_merge(['Content-Type: '.($form?'application/x-www-form-urlencoded':'application/json')],$headers),CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>25,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS]);
    $body=curl_exec($ch);$status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);if($body===false)throw new RuntimeException('Push network request failed.');curl_close($ch);return [$status,json_decode($body,true)??[]];
}
try{
    $sa=json_decode(file_get_contents($private.'/firebase-service-account.json'),true,512,JSON_THROW_ON_ERROR);check(isset($sa['client_email'],$sa['private_key'],$sa['project_id'])&&(bool)preg_match('/^[a-z0-9-]+$/',$sa['project_id']),'Invalid Firebase configuration.');
    $cacheFile=$private.'/fcm-token.json';$cached=is_file($cacheFile)?json_decode(file_get_contents($cacheFile),true):null;
    if(!$cached||$cached['expires_at']<time()+90){
      $h=b64('{"alg":"RS256","typ":"JWT"}');$p=b64(json_encode(['iss'=>$sa['client_email'],'sub'=>$sa['client_email'],'aud'=>'https://oauth2.googleapis.com/token','scope'=>'https://www.googleapis.com/auth/firebase.messaging','iat'=>time(),'exp'=>time()+3600]));
      check(openssl_sign("$h.$p",$sig,$sa['private_key'],OPENSSL_ALGO_SHA256),'Could not sign Firebase request.');
      [$status,$resp]=http_json('https://oauth2.googleapis.com/token',['grant_type'=>'urn:ietf:params:oauth:grant-type:jwt-bearer','assertion'=>"$h.$p.".b64($sig)],[],true);check($status===200&&isset($resp['access_token']),'Firebase authorization failed.');
      $cached=['access_token'=>$resp['access_token'],'expires_at'=>time()+(int)$resp['expires_in']];file_put_contents($cacheFile,json_encode($cached),LOCK_EX);chmod($cacheFile,0600);
    }
    $sent=0;$failed=0;$processed=0;
    foreach(array_reverse(rows('push_queue')) as $job){
      if($processed>=50)break;if($job['status']!=='pending'||$job['next_attempt_at']>time())continue;$processed++;
      $n=rec('notifications',$job['notification_id']);$u=rec('profiles',$job['user_id']);if(!$n||!$u||$u['status']!=='active'){del('push_queue',$job['id']);continue;}
      if($n['type']==='new_post'){$actor=$u;$post=rec('posts',$n['post_id']??'');$readable=$post&&readable_post_media($post);$actor=null;if(!$readable){del('push_queue',$job['id']);del('notifications',$n['id']);continue;}}
      $retry=false;$delivered=$job['delivered_token_ids']??[];$tokens=push_delivery_tokens($n,rows('push_tokens',$job['user_id']));
      foreach($tokens as $token){
        if(($n['delivery']??'all')==='android'&&($token['platform']??'')!=='android')continue;
        if(in_array($token['id'],$delivered,true))continue;
        $message=push_message($n,$token,$config['site_url']);
        [$status,$resp]=http_json('https://fcm.googleapis.com/v1/projects/'.$sa['project_id'].'/messages:send',['message'=>$message],['Authorization: Bearer '.$cached['access_token']]);
        if($status===200){$sent++;$delivered[]=$token['id'];}
        else{$unregistered=false;foreach($resp['error']['details']??[] as $detail)if(($detail['errorCode']??'')==='UNREGISTERED')$unregistered=true;if($unregistered){del('push_tokens',$token['id']);$delivered[]=$token['id'];}else{$retry=true;$failed++;}}
      }
      $job['attempts']++;$job['delivered_token_ids']=$delivered;$job['status']=$retry?($job['attempts']>=6?'failed':'pending'):'sent';$job['next_attempt_at']=time()+min(3600,60*2**$job['attempts']);put('push_queue',$job,$job['user_id'],$job['notification_id']);
    }
    put('system',['id'=>'push_worker','last_run_at'=>now(),'sent'=>$sent,'failed'=>$failed,'processed'=>$processed]);
    // Expired sessions/codes and old dedup rows do not accumulate forever.
    q('DELETE FROM oj_sessions WHERE expires_at<? AND refresh_expires_at<?',[time(),time()]);q('DELETE FROM oj_codes WHERE expires_at<?',[time()-86400]);q('DELETE FROM oj_rate_limits WHERE resets_at<?',[time()-86400]);q("DELETE FROM oj_records WHERE kind IN ('push_queue','event_dedup') AND created_at<?",[gmdate('Y-m-d\TH:i:s\Z',time()-2592000)]);
    foreach(['google_flows','refresh_reuse'] as $kind)foreach(rows($kind) as $record)if(($record['expires_at']??0)<time())del($kind,$record['id']);
    echo "Processed $processed notification jobs; sent $sent; transient failures $failed.\n";
}catch(Throwable $e){error_log('OJASSS push worker: '.$e->getMessage());echo "Push dispatch failed. Check server logs.\n";exit(1);}
