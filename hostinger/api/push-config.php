<?php
declare(strict_types=1);
function push_configuration(array $b): array {
    global $config;staff(true);$private=$config['private_dir'];$old=rec('system','firebase_public');
    $web=$b['firebaseConfig']??null;check(is_array($web)&&isset($web['apiKey'],$web['appId'],$web['messagingSenderId'],$web['projectId']),'Enter the Firebase web configuration.');
    foreach(['apiKey','appId','messagingSenderId','projectId'] as $k)check(is_string($web[$k])&&strlen($web[$k])<=200,'Invalid Firebase web configuration.');
    check((bool)preg_match('/^[a-z0-9-]{6,63}$/',$web['projectId']),'Invalid Firebase project ID.');
    $web=array_intersect_key($web,array_flip(['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','measurementId']));
    $vapid=text($b['vapidKey']??'',200);check((bool)preg_match('/^[A-Za-z0-9_-]{80,100}$/',$vapid),'Enter the public VAPID key from Firebase Cloud Messaging.');
    if(isset($b['serviceAccount'])){
      $sa=$b['serviceAccount'];check(is_array($sa)&&($sa['type']??'')==='service_account'&&($sa['project_id']??'')===$web['projectId']&&isset($sa['private_key'],$sa['client_email'])&&str_ends_with($sa['client_email'],'.iam.gserviceaccount.com'),'The service account must belong to this Firebase project.');
      check(openssl_pkey_get_private($sa['private_key'])!==false,'Invalid service-account key.');
      $file=$private.'/firebase-service-account.json';$tmp=$file.'.tmp';check(file_put_contents($tmp,json_encode($sa,JSON_THROW_ON_ERROR),LOCK_EX)!==false,'Could not save Firebase configuration.');chmod($tmp,0600);check(rename($tmp,$file),'Could not save Firebase configuration.');
    }
    check(is_file($private.'/firebase-service-account.json'),'Upload a Firebase service account.');
    put('system',['id'=>'firebase_public','firebaseConfig'=>$web,'vapidKey'=>$vapid]);log_action('configure_push','setting','firebase',null,['project_id'=>$web['projectId'],'web_configured'=>true]);
    return ['ok'=>true,'projectId'=>$web['projectId']];
}
function push_status(): array {
    global $config;staff(true);$tokens=rows('push_tokens');$queue=rows('push_queue');$public=firebase_public();
    return ['configured'=>is_file($config['private_dir'].'/firebase-service-account.json'),'project_id'=>$public['firebaseConfig']['projectId']??null,'web_configured'=>isset($public['vapidKey']),
      'android_devices'=>count(array_filter($tokens,fn($r)=>$r['platform']==='android')),'web_devices'=>count(array_filter($tokens,fn($r)=>$r['platform']==='web')),
      'pending'=>count(array_filter($queue,fn($r)=>$r['status']==='pending')),'failed'=>count(array_filter($queue,fn($r)=>$r['status']==='failed')),
      'last_worker'=>rec('system','push_worker'),'cron_command'=>'/usr/bin/php '.__DIR__.'/push-worker.php'];
}
