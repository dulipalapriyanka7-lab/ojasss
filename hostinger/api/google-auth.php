<?php
declare(strict_types=1);
function google_identity_request(string $operation,string $apiKey,array $body): array {
  $curl=curl_init('https://identitytoolkit.googleapis.com/v1/accounts:'.$operation.'?key='.rawurlencode($apiKey));
  curl_setopt_array($curl,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($body),CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>15,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS]);
  $raw=curl_exec($curl);$status=curl_getinfo($curl,CURLINFO_RESPONSE_CODE);curl_close($curl);
  if($raw===false||$status>=500)fail(503,'GOOGLE_UNAVAILABLE','Google sign-in is temporarily unavailable. Please try again.');
  return [$status,json_decode($raw,true)??[]];
}
function google_route(string $path,array $b): array {
  global $db,$actor,$config;rate('google:'.$path.':'.($_SERVER['REMOTE_ADDR']??''),$path==='/poll'?600:100,600);
  if($path==='/start'){
    $challenge=text($b['challenge']??'',64);check((bool)preg_match('/^[a-f0-9]{64}$/',$challenge),'Invalid sign-in request.');
    $id=bin2hex(random_bytes(24));put('google_flows',['id'=>$id,'challenge'=>$challenge,'expires_at'=>time()+300,'ready'=>false]);return ['flow'=>$id];
  }
  if(in_array($path,['/poll','/ack'],true)){
    $id=text($b['flow']??'',48);$verifier=text($b['verifier']??'',64);
    $db->beginTransaction();q('SELECT id FROM oj_mutex WHERE id=1 FOR UPDATE');$flow=rec('google_flows',$id);
    check($flow&&$flow['expires_at']>time()&&hash_equals($flow['challenge'],hash('sha256',$verifier)),'Google sign-in expired. Please try again.',401);
    $session=$flow['ready']?reused_refresh('google:'.$id):null;
    if($flow['ready'])check($session!==null,'Google sign-in expired. Please try again.',401);
    if($path==='/ack'){check($flow['ready'],'Sign-in is not complete.');del('google_flows',$id);del('refresh_reuse','google:'.$id);$db->commit();return ['ok'=>true];}
    $db->commit();return $session?['ready'=>true,'session'=>$session]:['ready'=>false];
  }
  check(in_array($path,['/complete','/native'],true),'Endpoint not found.',404);
  $public=firebase_public();$web=$public['firebaseConfig'];
  $token=text($b['idToken']??'',15000);check($token!=='','Google sign-in is required.',401);
  if($path==='/native'){
    // Exchange the native Google credential using the project's configured provider.
    // Firebase checks the Google token signature, audience, issuer and expiration.
    [$exchangeStatus,$credential]=google_identity_request('signInWithIdp',$web['apiKey'],[
      'requestUri'=>rtrim($config['site_url'],'/').'/',
      'postBody'=>http_build_query(['id_token'=>$token,'providerId'=>'google.com']),
      'returnSecureToken'=>true
    ]);
    check($exchangeStatus===200&&empty($credential['needConfirmation'])&&!empty($credential['idToken']),'Google sign-in could not be verified. Please try again.',401);
    $token=$credential['idToken'];
  }
  // Firebase validates signature, issuer, audience, expiry and the project identity.
  [$status,$data]=google_identity_request('lookup',$web['apiKey'],['idToken'=>$token]);
  check($status===200&&isset($data['users'][0]),'Google sign-in could not be verified. Please try again.',401);
  $identity=$data['users'][0];$claims=json_decode(base64_decode(strtr(explode('.',$token)[1]??'','-_','+/')),true);
  $subject=$claims['firebase']['identities']['google.com'][0]??null;
  check(($claims['aud']??'')===$web['projectId']&&($claims['iss']??'')==='https://securetoken.google.com/'.$web['projectId']&&($claims['firebase']['sign_in_provider']??'')==='google.com'&&($claims['sub']??'')===($identity['localId']??'')&&($claims['exp']??0)>time()&&is_string($subject)&&$subject!==''&&!empty($identity['emailVerified']),'A verified Google account is required.',401);
  $email=email_address($identity['email']??'');
  $key=hash('sha256','google.com:'.$subject);
  $legacyKey=hash('sha256',$identity['localId']);
  $flowId=$path==='/complete'&&isset($b['flow'])?text($b['flow'],48):null;
  $db->beginTransaction();q('SELECT id FROM oj_mutex WHERE id=1 FOR UPDATE');
  if($flowId){$flow=rec('google_flows',$flowId);check($flow&&$flow['expires_at']>time()&&!$flow['ready'],'Google sign-in expired. Please try again.',401);}
  $linked=rec('google_identities',$key);
  $legacy=$linked??rec('google_identities',$legacyKey);
  $id=$legacy['user_id']??null;
  if(!$id){
    $credential=q('SELECT * FROM oj_credentials WHERE email=?',[$email])->fetch(PDO::FETCH_ASSOC);
    if($credential){
      check($actor&&$actor['id']===$credential['user_id'],'Sign in with your password or email code before linking this Google account.',409);
      $id=$credential['user_id'];
    }else{
      $id=uid();q('INSERT INTO oj_credentials(user_id,email,password_hash,confirmed,created_at) VALUES(?,?,?,?,?)',[$id,$email,password_hash(bin2hex(random_bytes(32)),PASSWORD_DEFAULT),1,now()]);new_profile($id,text($identity['displayName']??'Creator',50));
    }
  }
  $u=rec('profiles',$id);check($u&&$u['status']==='active','This account is restricted.',403);$session=session_for($u);
  if(!$linked)put('google_identities',['id'=>$key,'user_id'=>$id,'email'=>$email],$id);
  if($flowId){cache_refresh('google:'.$flowId,$session);$cached=rec('refresh_reuse','google:'.$flowId);$cached['expires_at']=$flow['expires_at'];put('refresh_reuse',$cached,$id);$flow['ready']=true;put('google_flows',$flow);$db->commit();return ['ok'=>true];}
  $db->commit();return $session;
}
