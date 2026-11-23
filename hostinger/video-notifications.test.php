<?php
ok(safe_cta(['type'=>'call','url'=>'+91 9876543210'])['cta_url']==='tel:+919876543210','legacy call buttons normalize contact values');
ok(safe_cta(['type'=>'whatsapp','url'=>'+91 9876543210'])['cta_url']==='https://wa.me/919876543210','legacy WhatsApp buttons normalize contact values');
ok(safe_cta(['type'=>'email','url'=>'team@example.com'])['cta_url']==='mailto:team@example.com','legacy email buttons normalize contact values');
// Other create-post cases leave queued jobs in this isolated test database.
foreach(rows('video_alert_jobs') as $queued)del('video_alert_jobs',$queued['id']);
$creator=fixture('alert_creator');$fanA=fixture('alert_fan_a');$fanB=fixture('alert_fan_b');$outsider=fixture('alert_outsider');
foreach([$fanA,$fanB] as $fan)put('follows',['id'=>relation_id($fan['id'],$creator['id'])],$fan['id'],$creator['id']);
$alertPost=put('posts',['kind'=>'video','author_id'=>$creator['id'],'status'=>'published','visibility'=>'public','category'=>'entertainment','caption'=>'A new video','media_path'=>null,'thumbnail_path'=>null],$creator['id']);
$actor=$creator;queue_new_video_alerts($alertPost);ok(rec('video_alert_jobs',$alertPost['id'])!==null,'video publication queues subscriber fanout');
ok(process_video_alert_jobs(1)===1,'subscriber fanout first batch');ok(process_video_alert_jobs(1)===1,'subscriber fanout resumes without skipping');ok(process_video_alert_jobs(1)===0,'subscriber fanout completes without duplicates');
ok(count(rows('notifications',$fanA['id']))===1&&count(rows('notifications',$fanB['id']))===1,'both respecting users receive video alert');ok(rows('notifications',$outsider['id'])===[],'nonfollowers receive no creator alert');
$notice=rows('notifications',$fanA['id'])[0];ok($notice['type']==='new_post'&&$notice['link']==='/post/'.$alertPost['id']&&$notice['actor']['id']===$creator['id'],'video notification carries exact destination and creator');
queue_new_video_alerts($alertPost);ok(process_video_alert_jobs()===0,'publication retry does not duplicate alerts');
foreach(['private','pending','poster'] as $scenario){$candidate=$alertPost;$candidate['id']=uid();if($scenario==='private')$candidate['visibility']='private';if($scenario==='pending')$candidate['status']='pending_review';if($scenario==='poster')$candidate['kind']='poster';queue_new_video_alerts($candidate);ok(rec('video_alert_jobs',$candidate['id'])===null,$scenario.' publication does not queue video alerts');}
$candidate=$alertPost;$candidate['id']=uid();$candidate=put('posts',$candidate,$creator['id']);queue_new_video_alerts($candidate);permanently_delete_post($candidate);ok(rec('video_alert_jobs',$candidate['id'])===null,'permanent deletion removes pending video alert job');
$native=push_message($notice,['token'=>'test-token','platform'=>'android'],'https://ojasss.com');ok(!isset($native['notification'])&&$native['data']['link']===$notice['link']&&$native['data']['title']===$notice['title'],'native background push uses routed data message');
$web=push_message($notice,['token'=>'test-token','platform'=>'web'],'https://ojasss.com');ok($web['webpush']['fcm_options']['link']==='https://ojasss.com'.$notice['link']&&isset($web['notification']),'web push includes exact clickable destination');
$bad=$notice;$bad['link']='//evil.example';ok(push_message($bad,['token'=>'x','platform'=>'android'],'https://ojasss.com')['data']['link']==='/notifications','push destination rejects external redirect');
