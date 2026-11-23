<?php
declare(strict_types=1);
// Compresses large videos (over 100 MB) to about 50 MB HD, one at a time. Started by push-worker; CLI only.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/core.php';require __DIR__.'/storage-admin.php';
$private=getenv('OJASSS_PRIVATE_DIR')?:dirname(__DIR__,2).'/ojasss-private';
if(!is_file($private.'/config.php'))exit(0);
$lock=fopen($private.'/media-worker.lock','c');if(!flock($lock,LOCK_EX|LOCK_NB))exit(0);
$config=require $private.'/config.php';$config['private_dir']=$private;$actor=null;
$db=new PDO('mysql:host='.$config['db_host'].';port='.($config['db_port']??3306).';dbname='.$config['db_name'].';charset=utf8mb4',$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
@set_time_limit(0);
$started=time();
// keep going for up to 50 minutes so a backlog clears, one file at a time
while(time()-$started<3000){$r=storage_compress_next();echo gmdate('c').' '.$r."\n";if(!str_starts_with($r,'compressed'))break;}
