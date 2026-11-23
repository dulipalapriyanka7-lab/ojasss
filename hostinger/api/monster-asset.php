<?php
declare(strict_types=1);

require_once __DIR__.'/core.php';
require_once __DIR__.'/monster-game.php';

header('Cache-Control: private, no-store');
header('Access-Control-Allow-Origin: *');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

$path=parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH)??'';
$method=$_SERVER['REQUEST_METHOD']??'';
if (!in_array($method,['GET','HEAD'],true)
    || !preg_match('~^/play-game/([A-Za-z0-9_.-]+)/(index\.html|(?:assets|game)/[A-Za-z0-9_./-]+)$~D',$path,$match)
    || preg_match('~(?:^|/)\.\.?(?:/|$)~',$match[2])) {
    http_response_code(404);
    exit;
}

try {
    $private=getenv('OJASSS_PRIVATE_DIR')?:dirname(__DIR__,2).'/ojasss-private';
    if (!is_file($private.'/config.php')) throw new RuntimeException('Game configuration missing.');
    $config=require $private.'/config.php';
    $db=new PDO(
        'mysql:host='.$config['db_host'].';port='.($config['db_port']??3306).';dbname='.$config['db_name'].';charset=utf8mb4',
        $config['db_user'],$config['db_password'],
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]
    );
    if (!monster_game_ticket_allowed($match[1])) {
        http_response_code(403);
        exit;
    }
    $root=realpath($private.'/monster-fight');
    $file=$root===false ? false : realpath($root.'/'.$match[2]);
    $types=[
        'html'=>'text/html; charset=utf-8','js'=>'text/javascript; charset=utf-8',
        'css'=>'text/css; charset=utf-8','webp'=>'image/webp','jpg'=>'image/jpeg','png'=>'image/png',
        'gltf'=>'model/gltf+json','glb'=>'model/gltf-binary','fbx'=>'application/octet-stream',
        'bin'=>'application/octet-stream','txt'=>'text/plain; charset=utf-8',
    ];
    $type=$types[pathinfo($match[2],PATHINFO_EXTENSION)]??null;
    if ($file===false || !str_starts_with($file,$root.DIRECTORY_SEPARATOR) || !is_file($file) || $type===null
        || (str_starts_with($type,'text/html') && $match[2]!=='index.html')) {
        http_response_code(404);
        exit;
    }
    $origin=rtrim($config['site_url'],'/');
    if (!preg_match('~^https://[a-z0-9.-]+$~D',$origin)) throw new RuntimeException('Invalid game origin.');
    header("Content-Security-Policy: default-src 'none'; script-src $origin; style-src $origin 'unsafe-inline'; img-src $origin data: blob:; connect-src $origin data: blob:; frame-ancestors $origin; base-uri 'none'; sandbox allow-scripts allow-pointer-lock");
    header('Content-Type: '.$type);
    header('Content-Length: '.filesize($file));
    if ($method==='GET') readfile($file);
} catch (Throwable $error) {
    error_log('Monster Fight delivery failed: '.$error->getMessage());
    http_response_code(503);
}
