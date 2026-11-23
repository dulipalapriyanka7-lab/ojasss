<?php
declare(strict_types=1);
function b64(string $s): string { return rtrim(strtr(base64_encode($s),'+/','-_'),'='); }
function auth_user(array $u): array { $email=q('SELECT email FROM oj_credentials WHERE user_id=?',[$u['id']])->fetchColumn(); return ['id'=>$u['id'],'aud'=>'authenticated','role'=>'authenticated','email'=>$email,'email_confirmed_at'=>$u['created_at'],'created_at'=>$u['created_at'],'updated_at'=>$u['updated_at'],'app_metadata'=>['provider'=>'email','providers'=>['email']],'user_metadata'=>['full_name'=>$u['display_name']],'identities'=>[]]; }
function session_for(array $u): array {
    global $config; $exp=time()+3600; $refresh=bin2hex(random_bytes(32));
    $h=b64('{"alg":"HS256","typ":"JWT"}');$p=b64(json_encode(['sub'=>$u['id'],'aud'=>'authenticated','role'=>'authenticated','iat'=>time(),'exp'=>$exp,'jti'=>uid(),'iss'=>$config['site_url'].'/api/auth/v1']));
    $token="$h.$p.".b64(hash_hmac('sha256',"$h.$p",$config['secret'],true));
    q('INSERT INTO oj_sessions(token_hash,user_id,refresh_hash,expires_at,refresh_expires_at) VALUES(?,?,?,?,?)',[hash('sha256',$token),$u['id'],hash('sha256',$refresh),$exp,time()+2592000]);
    return ['access_token'=>$token,'refresh_token'=>$refresh,'token_type'=>'bearer','expires_in'=>3600,'expires_at'=>$exp,'user'=>auth_user($u)];
}
function cache_refresh(string $key,array $session): void {
    global $config;$iv=random_bytes(12);$cipher=openssl_encrypt(json_encode($session,JSON_THROW_ON_ERROR),'aes-256-gcm',hash('sha256',$config['secret'],true),OPENSSL_RAW_DATA,$iv,$tag);
    check($cipher!==false,'Could not refresh the session.',503);put('refresh_reuse',['id'=>$key,'user_id'=>$session['user']['id'],'expires_at'=>time()+20,'ciphertext'=>base64_encode($iv.$tag.$cipher)],$session['user']['id']);
}
function reused_refresh(string $key): ?array {
    global $config;$r=rec('refresh_reuse',$key);if(!$r||$r['expires_at']<time())return null;$bytes=base64_decode($r['ciphertext'],true);if(!$bytes)return null;
    $json=openssl_decrypt(substr($bytes,28),'aes-256-gcm',hash('sha256',$config['secret'],true),OPENSSL_RAW_DATA,substr($bytes,0,12),substr($bytes,12,16));$session=$json?json_decode($json,true):null;
    if(!$session||!q('SELECT 1 FROM oj_sessions WHERE token_hash=? AND expires_at>?',[hash('sha256',$session['access_token']),time()])->fetchColumn())return null;
    $u=rec('profiles',$session['user']['id']);return $u&&$u['status']==='active'?$session:null;
}
function authenticate(): ?array {
    $header=$_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'';
    if(!preg_match('/^Bearer (.+)$/i',$header,$m)){
      $path=parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH);
      if(!in_array($_SERVER['REQUEST_METHOD']??'',['GET','HEAD'],true)||!str_starts_with($path??'','/api/storage/v1/object/')||empty($_COOKIE['ojasss_media']))return null;
      $m=[null,$_COOKIE['ojasss_media']];
    }
    $s=q('SELECT user_id FROM oj_sessions WHERE token_hash=? AND expires_at>?',[hash('sha256',$m[1]),time()])->fetchColumn();
    return $s?rec('profiles',$s):null;
}
function email_address($value): string { $email=strtolower(trim((string)$value)); check(strlen($email)<=254&&(bool)filter_var($email,FILTER_VALIDATE_EMAIL),'Enter a valid email address.'); return $email; }
function strong_password($pw): string { check(is_string($pw)&&strlen($pw)>=8&&strlen($pw)<=128&&preg_match('/[A-Za-z]/',$pw)&&preg_match('/[0-9]/',$pw),'Password must contain at least 8 characters, a letter and a number.'); return $pw; }
function send_mail(string $email,string $subject,string $message): void {
    global $config; $from=$config['mail_from']??'noreply@ojasss.com';
    if(!mail($email,$subject,$message,"From: OJASSS <$from>\r\nContent-Type: text/plain; charset=UTF-8"))fail(503,'EMAIL_UNAVAILABLE','Email delivery is unavailable. Please contact support.');
}
function issue_code(string $email,string $purpose,array $payload=[]): array {
    global $config; rate('email:'.$email.':'.$purpose,3,600); $code=(string)random_int(100000,999999);$id=uid();
    q('DELETE FROM oj_codes WHERE email=? AND purpose=?',[$email,$purpose]);
    q('INSERT INTO oj_codes(id,email,purpose,code_hash,expires_at,payload) VALUES(?,?,?,?,?,?)',[$id,$email,$purpose,hash_hmac('sha256',$code,$config['secret']),time()+600,json_encode($payload)]);
    send_mail($email,'Your OJASSS verification code',"Your OJASSS code is: $code\n\nIt expires in 10 minutes. Do not share this code.\nIf you did not request it, ignore this email.\n");
    return ['id'=>$id,'expiresInMinutes'=>10];
}
function consume_code(string $email,string $purpose,string $code,?string $id=null): array {
    global $config; $s=q('SELECT * FROM oj_codes WHERE email=? AND purpose=? ORDER BY expires_at DESC LIMIT 1',[$email,$purpose])->fetch(PDO::FETCH_ASSOC);
    if(!$s||($id&&$s['id']!==$id)||(int)$s['expires_at']<time()||(int)$s['attempts']>=5)fail(400,'INVALID_CODE','That code is invalid or expired.');
    $attempt=q('UPDATE oj_codes SET attempts=attempts+1 WHERE id=? AND expires_at>=? AND attempts<5',[$s['id'],time()]);
    if($attempt->rowCount()!==1)fail(400,'INVALID_CODE','That code is invalid or expired.');
    if(!hash_equals($s['code_hash'],hash_hmac('sha256',$code,$config['secret'])))fail(400,'INVALID_CODE','That code is invalid or expired.');
    $used=q('DELETE FROM oj_codes WHERE id=?',[$s['id']]);
    if($used->rowCount()!==1)fail(400,'INVALID_CODE','That code is invalid or expired.');
    return json_decode($s['payload']??'{}',true)??[];
}
function auth_route(string $path,array $b): mixed {
    global $actor; $ip=$_SERVER['REMOTE_ADDR']??''; rate('auth:'.$ip,40,600);
    $email=isset($b['email'])?email_address($b['email']):null;
    if($path==='/signup') {
      $pw=strong_password($b['password']??null);$name=text($b['data']['full_name']??'',50);$id=uid();
      if(q('SELECT 1 FROM oj_credentials WHERE email=?',[$email])->fetchColumn())fail(409,'EMAIL_TAKEN','This email is already registered.');
      q('INSERT INTO oj_credentials(user_id,email,password_hash,confirmed,created_at) VALUES(?,?,?,?,?)',[$id,$email,password_hash($pw,PASSWORD_DEFAULT),0,now()]);
      $u=new_profile($id,$name);issue_code($email,'signup'); return ['user'=>auth_user($u),'session'=>null];
    }
    if($path==='/token') {
      if(($_GET['grant_type']??'')==='refresh_token') {
        global $db;$refreshHash=hash('sha256',(string)($b['refresh_token']??''));
        $db->beginTransaction();q('SELECT id FROM oj_mutex WHERE id=1 FOR UPDATE');$reuse=reused_refresh($refreshHash);if($reuse){$db->commit();return $reuse;}
        $s=q('SELECT * FROM oj_sessions WHERE refresh_hash=? AND refresh_expires_at>?',[$refreshHash,time()])->fetch(PDO::FETCH_ASSOC);
        if(!$s)fail(401,'INVALID_REFRESH_TOKEN','Session expired. Please sign in again.'); $u=rec('profiles',$s['user_id']);
        check($u&&$u['status']==='active','This account is restricted.',403);
        // Existing access tokens remain valid until expiry; concurrent tabs get the same rotation for 20 seconds.
        q('UPDATE oj_sessions SET refresh_expires_at=0 WHERE token_hash=?',[$s['token_hash']]);$session=session_for($u);cache_refresh($refreshHash,$session);$db->commit();return $session;
      }
      $c=q('SELECT * FROM oj_credentials WHERE email=?',[$email])->fetch(PDO::FETCH_ASSOC);
      $valid=password_verify((string)($b['password']??''),$c['password_hash']??'$2y$10$0qmeQzJnl5ZuEYxURa4s3uTEr.x0C.ncgqXx7cJlG8J1wLdQMi8nO');
      if(!$c||!$valid)fail(400,'INVALID_CREDENTIALS','Invalid login credentials');
      if(!$c['confirmed'])fail(400,'EMAIL_NOT_CONFIRMED','Email not confirmed');$u=rec('profiles',$c['user_id']);check($u&&$u['status']==='active','This account is restricted.',403);return session_for($u);
    }
    if(in_array($path,['/otp','/recover','/resend'],true)) {
      $purpose=$path==='/recover'?'recovery':($path==='/resend'?'signup':'email');
      $c=q('SELECT user_id FROM oj_credentials WHERE email=?',[$email])->fetchColumn();
      if($c)issue_code($email,$purpose); return (object)[];
    }
    if($path==='/verify') {
      $type=enum_value($b['type']??'',['signup','email','recovery']);consume_code($email,$type,(string)($b['token']??''));
      $id=q('SELECT user_id FROM oj_credentials WHERE email=?',[$email])->fetchColumn();if(!$id)fail(400,'INVALID_CODE','Invalid code.');
      q('UPDATE oj_credentials SET confirmed=1 WHERE user_id=?',[$id]);$u=rec('profiles',$id);check($u['status']==='active','This account is restricted.',403);return session_for($u);
    }
    if($path==='/user') {
      $u=need_user(); if($_SERVER['REQUEST_METHOD']==='PUT') {
        $pw=strong_password($b['password']??null);q('UPDATE oj_credentials SET password_hash=? WHERE user_id=?',[password_hash($pw,PASSWORD_DEFAULT),$u['id']]);
        $current=preg_replace('/^Bearer /i','',$_SERVER['HTTP_AUTHORIZATION']??'');q('DELETE FROM oj_sessions WHERE user_id=? AND token_hash<>?',[$u['id'],hash('sha256',$current)]);
      }return auth_user($u);
    }
    if($path==='/logout') { if($actor){q('DELETE FROM oj_sessions WHERE user_id=?',[$actor['id']]);q("DELETE FROM oj_records WHERE kind IN ('push_tokens','refresh_reuse') AND user_id=?",[$actor['id']]);}return (object)[]; }
    if($path==='/settings')return ['external'=>['email'=>true,'google'=>true],'disable_signup'=>false,'mailer_autoconfirm'=>false];
    fail(404,'NOT_FOUND','Authentication endpoint not found.');
}
