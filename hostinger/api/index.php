<?php
declare(strict_types=1);
ini_set('display_errors','0');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');
require __DIR__.'/core.php';require __DIR__.'/speak.php';require __DIR__.'/one-chance.php';require __DIR__.'/ojasss-pg.php';require __DIR__.'/discovery.php';require __DIR__.'/auth.php';require __DIR__.'/rpc.php';require __DIR__.'/referral.php';require __DIR__.'/admin.php';require __DIR__.'/media.php';require __DIR__.'/post-delete.php';require __DIR__.'/push-config.php';require __DIR__.'/firebase-public.php';require __DIR__.'/google-auth.php';
require __DIR__.'/video-notifications.php';
require __DIR__.'/video-download.php';
require __DIR__.'/custom-push.php';
require __DIR__.'/weekly-usage.php';
require __DIR__.'/member-program.php';
$private=getenv('OJASSS_PRIVATE_DIR')?:dirname(__DIR__,2).'/ojasss-private';
try {
    if(!is_file($private.'/config.php'))fail(503,'SETUP_REQUIRED','The website is being configured. Please return shortly.');
    $config=require $private.'/config.php';$config['private_dir']=$private;
    $origin=$_SERVER['HTTP_ORIGIN']??'';$allowedOrigins=[$config['site_url']];if(($config['legacy_site_url']??'')==='https://new.ojasss.com')$allowedOrigins[]=$config['legacy_site_url'];if($origin&&!in_array($origin,$allowedOrigins,true))fail(403,'ORIGIN_REJECTED','Request origin is not allowed.');
    if($_SERVER['REQUEST_METHOD']==='OPTIONS'){header('Access-Control-Allow-Origin: '.($origin?:$config['site_url']));header('Vary: Origin');header('Access-Control-Allow-Headers: authorization,apikey,content-type,x-client-info,x-upsert,cache-control,x-supabase-api-version,prefer,range');header('Access-Control-Allow-Methods: GET,POST,PUT,OPTIONS,HEAD');http_response_code(204);exit;}
    $db=new PDO('mysql:host='.$config['db_host'].';port='.($config['db_port']??3306).';dbname='.$config['db_name'].';charset=utf8mb4',$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
    if(is_file($private.'/migration.lock')&&in_array($_SERVER['REQUEST_METHOD'],['POST','PUT','DELETE','PATCH'],true)){header('Retry-After: 15');fail(503,'MIGRATION_IN_PROGRESS','OJASSS is moving to its new home. Please retry in a moment.');}
    $actor=authenticate();$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);$path=preg_replace('~^/api(?:/index\.php)?(?=/|$)~','',$path);$path=rtrim($path,'/')?:'/';
    if($actor&&preg_match('/^Bearer (.+)$/i',$_SERVER['HTTP_AUTHORIZATION']??'',$mediaToken))setcookie('ojasss_media',$mediaToken[1],['expires'=>time()+3600,'path'=>'/api/storage/v1/object/','secure'=>str_starts_with($config['site_url'],'https://'),'httponly'=>true,'samesite'=>'Strict']);
    // Some hosting/CDN image routes reject POSTs to filenames ending in .png/.jpg.
    // Keep the binary upload entry point extension-free; storage_route still validates
    // the bucket, owner, filename, actual MIME, and size exactly as before.
    if($path==='/video-download')video_download_route();
    if($path==='/storage-upload'){
      check($_SERVER['REQUEST_METHOD']==='POST','Method not allowed.',405);
      check(is_string($_GET['bucket']??null)&&is_string($_GET['path']??null),'Invalid storage path.',400);
      storage_route('/storage/v1/object/'.$_GET['bucket'].'/'.$_GET['path']);
    }
    if(str_starts_with($path,'/storage/v1/object/'))storage_route($path);
    migrate_viral_shares();one_chance_reset_to_viral_wait();ensure_layout_settings();
    $b=in_array($_SERVER['REQUEST_METHOD'],['POST','PUT'],true)?body():[];
    if(str_starts_with($path,'/auth/v1/google/')){check($_SERVER['REQUEST_METHOD']==='POST','Method not allowed.',405);json_out(google_route(substr($path,15),$b));}
    if(str_starts_with($path,'/auth/v1/'))json_out(auth_route(substr($path,8),$b));
    if($path==='/health')json_out(['ok'=>true,'backend'=>'mysql','configured'=>true,'push_configured'=>is_file($private.'/firebase-service-account.json')]);
    if($path==='/firebase-config'){$r=firebase_public();json_out(['configured'=>true,'firebaseConfig'=>$r['firebaseConfig'],'vapidKey'=>$r['vapidKey']]);}
    if($path==='/firebase-worker-config'){$r=firebase_public();header('Content-Type: application/javascript; charset=utf-8');echo 'export const firebaseConfig = '.json_encode($r['firebaseConfig'],JSON_HEX_TAG|JSON_HEX_AMP).';';exit;}
    if(str_starts_with($path,'/rest/v1/rpc/')){
      check($_SERVER['REQUEST_METHOD']==='POST','Method not allowed.',405);rate('rpc:'.($actor['id']??$_SERVER['REMOTE_ADDR']??''),300,60);
      $name=substr($path,13);check((bool)preg_match('/^[a-z_]+$/',$name),'Invalid operation.');
      $db->beginTransaction();q('SELECT id FROM oj_mutex WHERE id=1 FOR UPDATE');$result=in_array($name,["withdrawal_schedule","save_withdrawal_schedule","save_member_task","admin_member_tasks","my_member_tasks"],true)?member_program($name,$b):(in_array($name,["weekly_usage_heartbeat","weekly_usage_total","weekly_usage_report"],true)?usage_route($name,$b):rpc_route($name,$b));$db->commit();purge_deleted_files();json_out($result);
    }
    if($path==='/rest/v1/cta_types'){$r=rows('cta_types');usort($r,fn($a,$b)=>$a['sort_order']<=>$b['sort_order']);json_out($r);}
    if($path==='/rest/v1/messages'){
      need_user();$conv=$_GET['conversation_id']??'';check(str_starts_with($conv,'eq.'),'Conversation is required.');$c=conversation(substr($conv,3));$r=rows('messages',null,$c['id']);$before=$_GET['created_at']??null;if($before&&str_starts_with($before,'lt.'))$r=array_values(array_filter($r,fn($x)=>$x['created_at']<substr($before,3)));json_out(array_slice($r,0,min(100,max(1,(int)($_GET['limit']??40)))));
    }
    if(str_starts_with($path,'/functions/v1/')){
      check($_SERVER['REQUEST_METHOD']==='POST','Method not allowed.',405);rate('function:'.($actor['id']??$_SERVER['REMOTE_ADDR']??''),60,60);
      $db->beginTransaction();q('SELECT id FROM oj_mutex WHERE id=1 FOR UPDATE');$result=function_route(substr($path,14),$b);$db->commit();json_out($result);
    }
    fail(404,'NOT_FOUND','Endpoint not found.');
}catch(ApiFault $e){if(isset($db)&&$db->inTransaction())$db->rollBack();$isAuth=isset($path)&&str_starts_with($path,'/auth/');$isFunction=isset($path)&&str_starts_with($path,'/functions/');json_out(['code'=>$isAuth?$e->name:'PT'.$e->status,'error_code'=>$e->name,'message'=>$e->getMessage(),'error'=>$isFunction?['code'=>$e->name,'message'=>$e->getMessage()]:$e->getMessage(),'details'=>$e->getMessage()],$e->status);}
catch(Throwable $e){if(isset($db)&&$db->inTransaction())$db->rollBack();error_log('OJASSS API: '.get_class($e).' '.$e->getMessage());json_out(['code'=>'SERVICE_UNAVAILABLE','message'=>'The service is temporarily unavailable. Please try again.'],503);}

