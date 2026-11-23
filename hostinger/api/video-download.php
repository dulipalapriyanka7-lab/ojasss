<?php
declare(strict_types=1);
function purge_video_downloads():void {
 global $config;$dir=$config['private_dir'].'/video-downloads';
 foreach(glob($dir.'/*.json')?:[] as $file){$old=json_decode(file_get_contents($file),true);$revoked=false;if(isset($old['post'])&&function_exists('rec')){$post=rec('posts',$old['post']);$revoked=!$post||($post['status']??'')==='deleted';}if(($old['expires']??0)<time()||$revoked){@unlink(substr($file,0,-5).'.mp4');@unlink($file);}}
 foreach(glob($dir.'/*.mp4')?:[] as $file)if(filemtime($file)<time()-3600&&!is_file(substr($file,0,-4).'.json'))@unlink($file);
}
function video_download_route():never {
 global $config,$actor;
 $dir=$config['private_dir'].'/video-downloads';if(!is_dir($dir))mkdir($dir,0700,true);
 if($_SERVER['REQUEST_METHOD']==='POST'){
  $user=need_user();rate('video-download:'.$user['id'],10,3600);$post=visible_post((string)($_GET['post']??''));check($post['kind']==='video','Choose a video.');
  purge_video_downloads();
  $length=(int)($_SERVER['CONTENT_LENGTH']??0);check($length>0&&$length<=125829120,'Download exceeds the size limit.',413);$token=bin2hex(random_bytes(32));$file=$dir.'/'.$token.'.mp4';
  $in=fopen('php://input','rb');$out=fopen($file,'xb');$bytes=stream_copy_to_stream($in,$out,125829121);fclose($in);fclose($out);chmod($file,0600);
  if($bytes!==$length||(new finfo(FILEINFO_MIME_TYPE))->file($file)!=='video/mp4'){@unlink($file);fail(422,'INVALID_VIDEO','Could not prepare this video.');}
  $metadata=$dir.'/'.$token.'.json';$written=file_put_contents($metadata.'.tmp',json_encode(['expires'=>time()+900,'user'=>$user['id'],'post'=>$post['id'],'username'=>$post['author_username']]),LOCK_EX);
  if($written===false){@unlink($file);fail(503,'DOWNLOAD_UNAVAILABLE','Could not prepare the download.');}chmod($metadata.'.tmp',0600);rename($metadata.'.tmp',$metadata);
  json_out(['url'=>rtrim($config['site_url'],'/').'/api/video-download?token='.$token]);
 }
 check(in_array($_SERVER['REQUEST_METHOD'],['GET','HEAD'],true),'Method not allowed.',405);$token=$_GET['token']??'';check(is_string($token)&&preg_match('/^[a-f0-9]{64}$/',$token),'Download unavailable.',404);
 $meta=is_file($dir.'/'.$token.'.json')?json_decode(file_get_contents($dir.'/'.$token.'.json'),true):null;check($meta&&$meta['expires']>=time()&&is_file($dir.'/'.$token.'.mp4'),'This download expired. Prepare it again.',404);
 $actor=rec('profiles',$meta['user']);need_user();visible_post($meta['post']);$file=$dir.'/'.$token.'.mp4';$name='OJASSS-'.preg_replace('/[^a-zA-Z0-9_.-]/','_',$meta['username']).'.mp4';
 header('Content-Type: video/mp4');header('Content-Disposition: attachment; filename="'.$name.'"');header('Cache-Control: private, no-store');header('Content-Length: '.filesize($file));if($_SERVER['REQUEST_METHOD']==='GET')readfile($file);exit;
}
