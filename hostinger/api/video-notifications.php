<?php
declare(strict_types=1);
function queue_new_video_alerts(array $post):void {
 if(($post['kind']??'')!=='video'||($post['status']??'')!=='published'||($post['visibility']??'public')==='private'||post_expired($post))return;
 if(!rec('video_alert_jobs',$post['id']))put('video_alert_jobs',['id'=>$post['id'],'post_id'=>$post['id'],'status'=>'pending','after_user'=>''],$post['author_id'],$post['id']);
}
// Fan out in bounded batches in the cron worker, keeping publishing fast.
function process_video_alert_jobs(int $batch=100):int {
 global $actor;$sent=0;$previous=$actor;
 try{foreach(q("SELECT data FROM oj_records WHERE kind='video_alert_jobs' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.status'))='pending' ORDER BY created_at,id LIMIT 1")->fetchAll(PDO::FETCH_COLUMN) as $serialized){$job=json_decode($serialized,true);
  if($job['status']!=='pending')continue;
  $post=rec('posts',$job['post_id']);$author=$post?rec('profiles',$post['author_id']):null;
  if(!$post||!$author||$author['status']!=='active'||$post['status']!=='published'||($post['visibility']??'public')==='private'||post_expired($post)){del('video_alert_jobs',$job['id']);continue;}
  $followers=q("SELECT user_id FROM oj_records WHERE kind='follows' AND parent_id=? AND user_id>? AND created_at<=? ORDER BY user_id LIMIT ".max(1,min(1000,$batch)),[$author['id'],$job['after_user'],$job['created_at']])->fetchAll(PDO::FETCH_COLUMN);
  $actor=$author;
  foreach($followers as $user){
   $job['after_user']=$user;$profile=rec('profiles',$user);$dedup=hash('sha256','new-video:'.$post['id'].':'.$user);
   if(!$profile||$profile['status']!=='active'||$user===$author['id']||blocked($user,$author['id'])||rec('event_dedup',$dedup))continue;
   notification($user,'new_post',($author['display_name']?:'@'.$author['username']).' shared a new video',mb_substr($post['caption']??'Watch their latest video on OJASSS.',0,160),'/post/'.$post['id'],$post['id']);
   put('event_dedup',['id'=>$dedup],$user,$post['id']);$sent++;
  }
  if(count($followers)<max(1,min(1000,$batch)))$job['status']='complete';
  put('video_alert_jobs',$job,$author['id'],$post['id']);
  // At most one subscriber batch per worker run; the next run continues reliably.
  break;
 }}finally{$actor=$previous;}
 return $sent;
}
