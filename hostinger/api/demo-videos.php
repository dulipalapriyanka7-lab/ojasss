<?php
declare(strict_types=1);
// Demo videos: admin uploads a short how-to video per category and language; everyone can watch them.

function demo_out(array $d): array { return array_intersect_key($d,array_flip(['id','category','lang','title','media_path','thumbnail_path','duration','sort','active','created_at'])); }
function demo_list(bool $all): array {
 $r=array_values(array_filter(rows('demo_videos'),fn($d)=>$all||!empty($d['active'])));
 usort($r,fn($a,$b)=>[(int)($a['sort']??0),$a['created_at']]<=>[(int)($b['sort']??0),$b['created_at']]);
 return array_map('demo_out',$r);
}
function demo_rpc(string $name,array $p): mixed {
 global $actor;
 if($name==='demo_videos')return demo_list(false);
 check(($actor['role']??'')==='admin','Admins only.',403);
 if($name==='demo_admin_list')return demo_list(true);
 if($name==='demo_admin_save'){
  $id=text($p['id']??'',36);$old=$id!==''?rec('demo_videos',$id):null;
  $media=text($p['media_path']??($old['media_path']??''),200);check($media!==''&&str_starts_with($media,$actor['id'].'/')||($old&&$media===$old['media_path']),'Upload a video first.');
  $d=['category'=>preg_replace('/[^a-z0-9_]/','',strtolower((string)($p['category']??'general')))?:'general','lang'=>enum_value($p['lang']??'en',['en','te']),
   'title'=>text($p['title']??'',90),'media_path'=>$media,'thumbnail_path'=>text($p['thumbnail_path']??($old['thumbnail_path']??''),200)?:null,
   'duration'=>max(0,min(3600,(int)($p['duration']??($old['duration']??0)))),'sort'=>(int)($p['sort']??($old['sort']??0)),'active'=>(bool)($p['active']??true)];
  check($d['title']!=='','Enter a title.');
  if($old){$d['id']=$old['id'];return demo_out(put('demo_videos',$d+$old,$actor['id']));}
  return demo_out(put('demo_videos',$d,$actor['id']));
 }
 if($name==='demo_admin_delete'){$id=text($p['id']??'',36);check(rec('demo_videos',$id)!==null,'Not found.',404);del('demo_videos',$id);return ['ok'=>true];}
 fail(404,'NOT_FOUND','Unknown function.');
}
