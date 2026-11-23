<?php
declare(strict_types=1);

function discovery_period(string $period,?string $anchor=null): array {
 $zone=new DateTimeZone('Asia/Kolkata');$today=new DateTimeImmutable('now',$zone);
 if($anchor!==null){check((bool)preg_match('/^\d{4}-\d{2}-\d{2}$/',$anchor),'Choose a valid period.');$date=DateTimeImmutable::createFromFormat('!Y-m-d',$anchor,$zone);check($date!==false&&$date->format('Y-m-d')===$anchor&&$date<=$today&&$date>=$today->modify('-2 years'),'Choose a period within the last two years.');}else $date=$today;
 $start=$period==='weekly'?$date->modify('monday this week')->setTime(0,0):$date->modify('first day of this month')->setTime(0,0);
 $end=$start->modify($period==='weekly'?'+1 week':'+1 month');
 return ['start'=>$start,'end'=>$end,'closed'=>$end<=$today];
}
function discovery_rpc(string $name,array $p): array {
 global $actor;
 if($name==='save_category_preferences'){
  $user=need_user();$selected=$p['p_selected']??null;$all=$p['p_show_all']??null;
  $allowed=['technology','education','gaming','lifestyle','horror_stories','music_dance','world_education','entertainment','business_promotion','public_complaint','news','part_time_jobs','full_time_jobs'];
  check(is_array($selected)&&array_is_list($selected)&&count($selected)<=count($allowed)&&is_bool($all),'Choose your categories.');
  foreach($selected as $value)check(is_string($value)&&in_array($value,$allowed,true),'Unknown category.');
  $selected=array_values(array_filter(array_unique($selected),fn($value)=>category_available($value)));check($all||count($selected)>0,'Choose at least one category or enable all categories.');
  $user['category_preferences']=['selected'=>$selected,'show_all'=>$all];$actor=put('profiles',$user,$user['id']);return me_profile($actor);
 }
 if($name==='vote_one_chance'){
  $user=need_user();$post=visible_post((string)($p['p_post_id']??''));
  check(one_chance_category_allowed($post, true), 'Voting is disabled for this category.', 403);
  check($post['is_viral']&&($post['one_chance_ready']??false)&&$post['kind']==='video'&&$post['status']==='published'&&($post['visibility']??'public')==='public','Voting opens when the Viral video reaches One Chance.');
  check(!empty($post['one_chance_voting_until'])&&strtotime($post['one_chance_voting_until'])>time(),'Voting has closed for this week.');
  check(!empty($post['one_chance_voting_opens_at'])&&strtotime($post['one_chance_voting_opens_at'])<=time(),'Votes open after the creator payment is approved.');
  check($post['author_id']!==$user['id'],'Vote for another creator.');
  [$start]=one_chance_week();
  $key=relation_id($user['id'],$start.':'.$post['id']);
  if(!in_array($user['id'],array_column(one_chance_week_votes($post['id']),'user_id'),true)){
   rate('one-chance-votes:'.$user['id'],60,3600);
   put('one_chance_votes',['id'=>$key,'post_id'=>$post['id'],'user_id'=>$user['id']],$user['id'],$post['id']);
  }
  competition_event('votes',$post,$user['id']);
  return ['my_voted'=>true,'votes_count'=>count(one_chance_week_votes($post['id']))];
 }
 $period=enum_value($p['p_period']??'weekly',['weekly','monthly']);$range=discovery_period($period,isset($p['p_anchor'])?text($p['p_anchor'],10):null);$scores=[];
 foreach(rows('one_chance_votes') as $vote){$at=strtotime($vote['created_at']);if($at>=$range['start']->getTimestamp()&&$at<$range['end']->getTimestamp())$scores[$vote['post_id']]=($scores[$vote['post_id']]??0)+1;}
 $snapshotId=$period.':'.$range['start']->format('Y-m-d');$snapshot=$range['closed']?rec('leaderboard_results',$snapshotId):null;
 if($snapshot)$ranked=$snapshot['ranked'];else{
  $ranked=[];foreach($scores as $postId=>$votes){$raw=rec('posts',$postId);$author=$raw?rec('profiles',$raw['author_id']):null;if(!$raw||!one_chance_category_allowed($raw, true)||$raw['kind']!=='video'||empty($raw['viral_at']))continue;if(!$range['closed']&&(!one_chance_is_current($raw)||($raw['visibility']??'public')!=='public'||$raw['status']!=='published'||post_expired($raw)||($author['status']??'')!=='active'))continue;$ranked[]=['post_id'=>$postId,'votes'=>$votes,'viral_at'=>$raw['viral_at']];}
  usort($ranked,fn($a,$b)=>($b['votes']<=>$a['votes'])?:strcmp($a['viral_at'],$b['viral_at'])?:strcmp($a['post_id'],$b['post_id']));
  foreach($ranked as $i=>&$entry)$entry['rank']=$i+1;unset($entry);
  if($range['closed'])put('leaderboard_results',['id'=>$snapshotId,'period'=>$period,'start'=>$range['start']->format('Y-m-d'),'ranked'=>$ranked]);
 }
 $entries=[];foreach($ranked as $entry){$raw=rec('posts',$entry['post_id']);$post=$raw?post_card($raw):null;if($post&&$post['status']==='published'&&($post['visibility']??'public')==='public')$entries[]=['post'=>$post,'votes'=>$entry['votes'],'rank'=>$entry['rank']];}
 return ['period'=>$period,'start'=>$range['start']->format('Y-m-d'),'end'=>$range['end']->format('Y-m-d'),'closed'=>$range['closed'],'timezone'=>'Asia/Kolkata','entries'=>page($entries,$p)];
}
