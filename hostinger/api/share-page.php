<?php
declare(strict_types=1);
ini_set('display_errors','0');require __DIR__.'/core.php';require __DIR__.'/share-meta.php';header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');
$html=file_get_contents(dirname(__DIR__).'/index.html');$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)?:'/';$post=null;$author=null;$site='https://ojasss.com';
try{
 $private=getenv('OJASSS_PRIVATE_DIR')?:dirname(__DIR__,2).'/ojasss-private';$config=require $private.'/config.php';$site=rtrim($config['site_url'],'/');
 if(preg_match('~^/post/([a-f0-9-]{36})/?$~i',$path,$match)){
  $db=new PDO('mysql:host='.$config['db_host'].';port='.($config['db_port']??3306).';dbname='.$config['db_name'].';charset=utf8mb4',$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);$post=rec('posts',$match[1]);$author=$post?rec('profiles',$post['author_id']):null;
  if(!share_public_post($post,$author)){header('X-Robots-Tag: noindex');$post=null;$author=null;}
 }
}catch(Throwable $e){error_log('OJASSS share metadata temporarily unavailable');}
$canonical=$path;$ref=$_GET['ref']??'';if($path==='/register'&&is_string($ref)&&preg_match('/^[A-Z0-9]{4,32}$/i',$ref))$canonical.='?ref='.rawurlencode($ref);
if($post)$html=str_replace('</head>','<script src="/post-app-link.js" defer></script></head>',$html);
echo share_html($html,share_metadata($post,$author,$site,$canonical));
