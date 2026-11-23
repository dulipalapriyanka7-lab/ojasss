<?php
declare(strict_types=1);
ini_set('display_errors','0');header('Cache-Control: no-store');header('Referrer-Policy: no-referrer');header('X-Frame-Options: DENY');header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'");
require __DIR__.'/core.php';require __DIR__.'/auth.php';
$private=getenv('OJASSS_PRIVATE_DIR')?:dirname(__DIR__,2).'/ojasss-private';
if(is_file($private.'/config.php')){http_response_code(404);exit('Setup is already complete.');}
$expected=is_file(__DIR__.'/setup-token.php')?require __DIR__.'/setup-token.php':'';$token=(string)($_GET['token']??'');
if(!$expected||!hash_equals($expected,hash('sha256',$token))){http_response_code(404);exit('Not found.');}
session_name('ojasss_setup');session_set_cookie_params(['secure'=>(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off'),'httponly'=>true,'samesite'=>'Strict']);session_start();$_SESSION['csrf']=$_SESSION['csrf']??bin2hex(random_bytes(24));$error='';$done=false;
if($_SERVER['REQUEST_METHOD']==='POST')try{
    check(hash_equals($_SESSION['csrf'],(string)($_POST['csrf']??'')),'Refresh this page and try again.',403);
    $email=email_address($_POST['admin_email']??'');$pw=strong_password($_POST['admin_password']??null);
    $config=['db_host'=>'localhost','db_port'=>3306,'db_name'=>text($_POST['db_name']??'',80),'db_user'=>text($_POST['db_user']??'',80),'db_password'=>(string)($_POST['db_password']??''),'secret'=>bin2hex(random_bytes(48)),'cron_secret'=>bin2hex(random_bytes(32)),'site_url'=>'https://ojasss.com','mail_from'=>'noreply@ojasss.com'];
    check((bool)preg_match('/^[a-zA-Z0-9_]+$/',$config['db_name'])&&(bool)preg_match('/^[a-zA-Z0-9_]+$/',$config['db_user']),'Enter the full database and username from Hostinger.');
    $db=new PDO('mysql:host=localhost;dbname='.$config['db_name'].';charset=utf8mb4',$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
    $db->exec(file_get_contents(__DIR__.'/schema.sql'));check((int)q('SELECT COUNT(*) FROM oj_credentials')->fetchColumn()===0,'This database already has users. Contact support before using setup.');
    if(!is_dir($private))check(mkdir($private,0700,true),'Could not create private configuration directory.');
    $db->beginTransaction();$id=uid();q('INSERT INTO oj_credentials(user_id,email,password_hash,confirmed,created_at) VALUES(?,?,?,?,?)',[$id,$email,password_hash($pw,PASSWORD_DEFAULT),1,now()]);$u=new_profile($id,'OJASSS Admin');$u['role']='admin';$u['username']='ojasss_admin';$u['onboarded']=true;$u['is_verified']=true;put('profiles',$u,$id);seed();
    $file=$private.'/config.php';$fp=fopen($file,'x');check($fp!==false,'Configuration already exists.');fwrite($fp,"<?php\nreturn ".var_export($config,true).";\n");fclose($fp);chmod($file,0600);$db->commit();$done=true;session_destroy();
}catch(Throwable $e){if(isset($db)&&$db->inTransaction())$db->rollBack();$error=$e instanceof ApiFault?$e->getMessage():'Could not connect or initialize. Check the database credentials and try again.';error_log('OJASSS setup: '.$e->getMessage());}
?><!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OJASSS setup</title>
<style>body{font:16px/1.5 system-ui;background:#0b0a10;color:#eee;margin:0;padding:32px 16px}main{max-width:480px;margin:0 auto;background:#18151f;padding:28px;border:1px solid #393040;border-radius:20px}img{display:block;width:96px;border-radius:12px}label{display:block;margin:16px 0 6px}input{box-sizing:border-box;width:100%;padding:12px;border-radius:8px;border:1px solid #65546d;background:#25202d;color:white;font:inherit}button,a{display:block;padding:12px 18px;border-radius:10px;background:#db287e;color:white;margin-top:24px;border:0;font:inherit;text-align:center}small{color:#bbb}.error{color:#ffaaa8}</style><main><img src="/brand/logo.png" alt="OJASSS"><h1><?= $done?'Setup complete':'Connect OJASSS to MySQL' ?></h1>
<?php if($done):?><p>The database and administrator account are ready. This setup page is now disabled.</p><a href="/login?next=%2Fadmin">Open admin sign-in</a>
<?php else: ?><p>Use the existing database password from Hostinger and choose your administrator sign-in.</p><?php if($error):?><p role="alert" class="error"><?=htmlspecialchars($error)?></p><?php endif; ?>
<form method="post"><input type="hidden" name="csrf" value="<?=htmlspecialchars($_SESSION['csrf'])?>">
<label for="db_name">MySQL database name</label><input id="db_name" name="db_name" value="u679148089_ojasss" required autocomplete="off">
<label for="db_user">MySQL username</label><input id="db_user" name="db_user" value="u679148089_ojasss" required autocomplete="off">
<label for="db_password">Existing database password</label><input id="db_password" name="db_password" type="password" required autocomplete="off">
<label for="admin_email">Admin email</label><input id="admin_email" name="admin_email" type="email" required autocomplete="email">
<label for="admin_password">New admin password</label><input id="admin_password" name="admin_password" type="password" minlength="8" required autocomplete="new-password"><small>At least 8 characters, including a letter and a number.</small>
<button type="submit">Connect database &amp; create admin</button></form><?php endif; ?></main></html>
