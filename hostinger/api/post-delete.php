<?php
declare(strict_types=1);
function queue_unused_post_file(string $bucket,?string $path):void {
 if(!$path)return;foreach(rows('posts') as $p)if($bucket==='media'&&in_array($path,[$p['media_path']??null,$p['thumbnail_path']??null],true))return;
 if($bucket==='media')foreach(rows('push_campaigns') as $c)if(($c['image_path']??null)===$path)return;
 if($bucket==='voices')foreach(rows('comments') as $c)if(($c['attachment']['path']??null)===$path)return;
 $key=object_key($bucket,$path);$object=rec('objects',$key);if(!$object)return;
 put('deleted_files',['id'=>$key,'bucket'=>$bucket,'path'=>$path],$object['user_id']??null);del('objects',$key);
}
function permanently_delete_post(array $post):void {
 $id=$post['id'];$files=[];
 foreach(rows('comments',null,$id) as $comment){foreach(rows('comment_fires',null,$comment['id']) as $fire)del('comment_fires',$fire['id']);if(!empty($comment['attachment']['path']))$files[]=$comment['attachment']['path'];del('comments',$comment['id']);}
 foreach(['engagements','bookmarks','one_chance_votes'] as $kind)foreach(rows($kind,null,$id) as $r)del($kind,$r['id']);
 foreach(rows('notifications') as $n)if(($n['post_id']??null)===$id){foreach(rows('push_queue',null,$n['id']) as $job)del('push_queue',$job['id']);del('notifications',$n['id']);}
 del('video_alert_jobs',$id);del('complaints',$id);del('posts',$id);
 foreach(array_unique(array_filter([$post['media_path']??null,$post['thumbnail_path']??null])) as $path)queue_unused_post_file('media',$path);
 foreach(array_unique($files) as $path)queue_unused_post_file('voices',$path);
}
function purge_deleted_files():int {
 global $config,$db;if($db->inTransaction())return 0;$count=0;
 foreach(array_slice(rows('deleted_files'),0,100) as $file){
  $bucket=$file['bucket'];$path=$file['path'];if(!in_array($bucket,['media','voices'],true)||!preg_match('~^[a-f0-9-]{36}/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$~i',$path)){error_log('OJASSS invalid deleted file path');continue;}
  // Derive the path from the verified storage key. Never trust a stored disk_path.
  $base=realpath($config['private_dir'].'/uploads/'.$bucket);$target=$config['private_dir'].'/uploads/'.$bucket.'/'.$path;$resolved=realpath($target);
  if($resolved!==false&&(!$base||!str_starts_with($resolved,$base.DIRECTORY_SEPARATOR)||is_link($target))){error_log('OJASSS refused deleted file outside storage');continue;}
  if($resolved!==false&&!@unlink($target)){error_log('OJASSS file deletion will be retried');continue;}
  del('deleted_files',$file['id']);$count++;
 }return $count;
}
