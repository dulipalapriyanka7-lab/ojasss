<?php
declare(strict_types=1);

function competition_defaults(): array {
 return ['timezone'=>'Asia/Kolkata','start_day'=>7,'start_hour'=>0,'targets'=>[10,8,12,7,5],'min_views'=>10,'min_votes'=>1,'scoring'=>['votes','viral','views','seconds'],'rank_mode'=>'videos','vote_targets'=>[100,50,25,10,1]];
}
function competition_current(): array {
 foreach(rows('weekly_competitions') as $active)if($active['status']==='active'&&strtotime($active['start'])<=time()&&strtotime($active['end'])>time()){$saved=setting('competition.config',competition_defaults());$updated=array_replace($active['config'],array_intersect_key($saved,array_flip(['targets','min_views','min_votes','scoring','rank_mode','vote_targets'])));if($updated!==$active['config']){$active['config']=$updated;put('weekly_competitions',$active);}
  // A running week never outlasts the configured week boundary (default: closes Saturday 11:59 PM IST).
  $boundary=one_chance_week()[1];if(strtotime($active['end'])>$boundary&&$boundary>time()){$active['end']=gmdate(DATE_ATOM,$boundary);put('weekly_competitions',$active);}
  return $active;}
 $settings=setting('competition.config',competition_defaults());
 $zone=new DateTimeZone($settings['timezone']);$now=new DateTimeImmutable('now',$zone);
 $start=$now->modify('-'.(((int)$now->format('N')-$settings['start_day']+7)%7).' days')->setTime($settings['start_hour'],0);
 if($start>$now)$start=$start->modify('-1 week');
 $id=$start->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis');
 foreach(rows('weekly_competitions') as $old)if($old['status']==='active'&&strtotime($old['end'])<=time()){
  $stats=competition_ranked($old);put('leaderboard_snapshots',['id'=>$old['id'],'competition'=>$old,'entries'=>$stats,'locked_at'=>now()]);
  $old['status']='completed';put('weekly_competitions',$old);
 }
 $current=rec('weekly_competitions',$id);
 if(!$current)$current=put('weekly_competitions',['id'=>$id,'start'=>$start->format(DATE_ATOM),'end'=>$start->modify('+1 week')->format(DATE_ATOM),'status'=>'active','config'=>$settings]);
 return $current;
}
function competition_event(string $kind,array $post,string $viewer,int $amount=1): void {
 if(!one_chance_category_allowed($post, true)||($post['kind']??'')!=='video'||($post['status']??'')!=='published'||($post['visibility']??'public')!=='public'||$viewer===$post['author_id'])return;
 if(!empty($post['viral_at'])&&!one_chance_is_current($post))return;
 $c=competition_current();$key=hash('sha256',$c['id'].':'.$kind.':'.$post['id'].':'.$viewer);
 if(rec('competition_events',$key))return;
 put('competition_events',['id'=>$key,'kind'=>$kind,'post_id'=>$post['id'],'author_id'=>$post['author_id'],'amount'=>$amount],$viewer,$c['id']);
 $entryId=relation_id($c['id'],$post['id']);$entry=rec('competition_video_entries',$entryId)??['id'=>$entryId,'post_id'=>$post['id'],'user_id'=>$post['author_id'],'views'=>0,'votes'=>0];
 $entry[$kind]=($entry[$kind]??0)+$amount;put('competition_video_entries',$entry,$post['author_id'],$c['id']);
}
function competition_activity(string $user,int $seconds,int $minute): void {
 $c=competition_current();$pending=[];
 for($second=time()-1;$second>=time()-$seconds&&$second>=strtotime($c['start']);$second--){$key=relation_id($user,$c['id'].':'.intdiv($second,60));$row=$pending[$key]??rec('competition_activity',$key)??['id'=>$key,'seconds'=>0,'mask'=>0];$bit=1<<($second%60);if(!($row['mask']&$bit))$row['seconds']++;$row['mask']|=$bit;$pending[$key]=$row;}
 foreach($pending as $row)put('competition_activity',$row,$user,$c['id']);
}
function competition_ranked(array $c): array {
 $stats=[];
 $entries=[];foreach(rows('competition_video_entries',null,$c['id']) as $entry)$entries[$entry['post_id']]=$entry;
 // Recover real weekly activity recorded before the competition counter was deployed.
 $start=gmdate('Y-m-d\TH:i:s.v\Z',strtotime($c['start']));$end=gmdate('Y-m-d\TH:i:s.v\Z',strtotime($c['end']));$views=[];$votes=[];
 foreach(q('SELECT id,user_id,parent_id,created_at FROM oj_records WHERE kind=? AND created_at>=? AND created_at<?',['event_dedup',$start,$end])->fetchAll(PDO::FETCH_ASSOC) as $event){$expected=hash('sha256','views_count:'.$event['parent_id'].':'.$event['user_id'].':'.substr($event['created_at'],0,10));if($expected===$event['id'])$views[$event['parent_id']][$event['user_id']]=true;}
 foreach(rows('one_chance_votes') as $vote)if($vote['created_at']>=$start&&$vote['created_at']<$end)$votes[$vote['post_id']][$vote['user_id']]=true;
 foreach(array_unique(array_merge(array_keys($views),array_keys($votes))) as $postId){$post=rec('posts',$postId);if(!$post)continue;unset($views[$postId][$post['author_id']],$votes[$postId][$post['author_id']]);$entries[$postId]??=['post_id'=>$postId,'user_id'=>$post['author_id'],'views'=>0,'votes'=>0];$entries[$postId]['views']=max($entries[$postId]['views'],count($views[$postId]??[]));$entries[$postId]['votes']=max($entries[$postId]['votes'],count($votes[$postId]??[]));}
 foreach($entries as $entry){$post=rec('posts',$entry['post_id']);if(!$post||!one_chance_category_allowed($post, true)||$post['kind']!=='video'||$post['status']!=='published'||($post['visibility']??'public')!=='public')continue;
  // Every eligible video with views or votes this week counts, not only videos first marked viral this week.
  // Live board: a video whose votes are locked (unpaid) has no position until voting is open again. Its votes are kept.
  // Votes already earned count on the live board too, matching the end-of-week results.
  $id=$entry['user_id'];$u=rec('profiles',$id);if(!$u||$u['status']!=='active')continue;
  $stats[$id]??=['user_id'=>$id,'username'=>$u['username'],'display_name'=>$u['display_name'],'avatar_path'=>$u['avatar_path'],'votes'=>0,'views'=>0,'viral'=>0,'seconds'=>0,'video_count'=>0,'post_id'=>$entry['post_id']];
  $stats[$id]['votes']+=$entry['votes'];$stats[$id]['views']+=$entry['views'];$stats[$id]['video_count']++;
  if($entry['votes']>=$c['config']['min_votes']&&$entry['views']>=$c['config']['min_views'])$stats[$id]['viral']++;
 }
 [$usageStart]=usage_window((new DateTimeImmutable($c['start']))->modify('+1 day'));
 foreach(q("SELECT user_id,SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(data,'$.seconds')) AS UNSIGNED)) seconds FROM oj_records WHERE kind='weekly_usage_minutes' AND parent_id=? GROUP BY user_id",[$usageStart->format('Y-m-d')])->fetchAll(PDO::FETCH_ASSOC) as $activity)if(isset($stats[$activity['user_id']]))$stats[$activity['user_id']]['seconds']=(int)$activity['seconds'];
 $result=array_values($stats);usort($result,function($a,$b)use($c){foreach($c['config']['scoring'] as $field){$cmp=$b[$field]<=>$a[$field];if($cmp)return $cmp;}return strcmp($a['user_id'],$b['user_id']);});
 // Every creator belongs to their highest achieved tier, never to two sections.
 $qualified=[];$used=[];$tierPlaces=[];
 // Admin can rank tiers by total votes instead of qualified videos.
 $byVotes=($c['config']['rank_mode']??'videos')==='votes';$field=$byVotes?'votes':'viral';$targets=$byVotes?($c['config']['vote_targets']??[100,50,25,10,1]):$c['config']['targets'];
 if($byVotes)usort($result,fn($a,$b)=>[$b['votes'],$b['views'],$b['seconds']]<=>[$a['votes'],$a['views'],$a['seconds']]?:strcmp($a['user_id'],$b['user_id']));
 foreach($targets as $i=>$target){foreach($result as $entry){if(isset($used[$entry['user_id']])||$entry[$field]<$target)continue;$entry['rank']=$i+1;$entry['tier_position']=($tierPlaces[$i]??0)+1;$tierPlaces[$i]=$entry['tier_position'];$entry['target']=$target;$entry['qualified']=true;$qualified[]=$entry;$used[$entry['user_id']]=true;}}
 $rank=6;foreach($result as $entry){if(isset($used[$entry['user_id']])||($byVotes?$entry['votes']<1:$entry['viral']!==1))continue;$entry['rank']=$rank++;$entry['target']=1;$entry['qualified']=true;$qualified[]=$entry;}
 return $qualified;
}
function competition_prize_results(array $snapshot): array {
 $competition=$snapshot['competition'];
 $prizes=[];
 foreach(rows('earnings',null,$competition['id']) as $earning){
  if(($earning['competition_id']??null)===$competition['id']&&$earning['status']==='approved'){
   $prizes[$earning['user_id']]=(int)$earning['amount_paise'];
  }
 }
 $positions=[];
 $winners=[];
 foreach($snapshot['entries'] as $entry){
  $rank=$entry['rank'];
  $amount=$prizes[$entry['user_id']]??null;
  if(($rank>5||isset($positions[$rank]))&&$amount===null)continue;
  $positions[$rank]=true;
  $winners[]=[
   'rank'=>$rank,'username'=>$entry['username'],'display_name'=>$entry['display_name'],
   'avatar_path'=>$entry['avatar_path']??null,'amount_paise'=>$amount,
  ];
 }
 return ['id'=>$competition['id'],'end'=>$competition['end'],'winners'=>$winners];
}
function competition_prize_weeks(int $limit): array {
 $raw=q("SELECT data FROM oj_records WHERE kind='leaderboard_snapshots' ORDER BY id DESC LIMIT ".(int)$limit)->fetchAll(PDO::FETCH_COLUMN);
 return array_map(fn($data)=>json_decode($data,true,512,JSON_THROW_ON_ERROR),$raw);
}
function competition_rpc(string $name,array $p): array {
 if($name==='competition_settings'){staff(true);return setting('competition.config',competition_defaults());}
 if($name==='save_competition_settings'){
  $admin=staff(true);$v=$p['config']??[];check(is_array($v),'Invalid configuration.');
  check(in_array($v['timezone']??'',DateTimeZone::listIdentifiers(),true),'Choose a valid timezone.');
  check(is_int($v['start_day']??null)&&$v['start_day']>=1&&$v['start_day']<=7&&is_int($v['start_hour']??null)&&$v['start_hour']>=0&&$v['start_hour']<=23,'Choose a valid reset schedule.');
  check(is_array($v['targets']??null)&&count($v['targets'])===5,'Set five targets.');foreach($v['targets'] as $n)check(is_int($n)&&$n>0&&$n<=10000,'Invalid target.');
  foreach(['min_views','min_votes'] as $field)check(is_int($v[$field]??null)&&$v[$field]>=1&&$v[$field]<=1000000,'Invalid qualification threshold.');
  check(is_array($v['scoring']??null)&&count($v['scoring'])===4&&count(array_unique($v['scoring']))===4&&!array_diff($v['scoring'],['votes','viral','views','seconds']),'Choose each scoring factor once.');
  $v['rank_mode']=($v['rank_mode']??'videos')==='votes'?'votes':'videos';$v['vote_targets']=$v['vote_targets']??[100,50,25,10,1];check(is_array($v['vote_targets'])&&count($v['vote_targets'])===5,'Set five vote positions.');foreach($v['vote_targets'] as $n)check(is_int($n)&&$n>0&&$n<=10000000,'Invalid vote position.');
  competition_current();put('settings',['id'=>'competition.config','value'=>$v]);competition_current();log_action($name,'competition',null,null,$v);return $v;
 }
 $c=competition_current();
 if ($name === 'competition_history') {
  $viewer = need_user();
  $owner = text($p['user_id'] ?? $viewer['id'], 36);
  $history = [];
  foreach (rows('leaderboard_snapshots') as $snapshot) {
   $week = $snapshot['competition'];
   $placement = null;
   foreach ($snapshot['entries'] as $entry) {
    if ($entry['user_id'] === $owner) {
     $placement = $entry;
     break;
    }
   }
   if ($placement !== null || (!empty($p['include_challenges']) && $owner === $viewer['id'] && !empty($week['challenges']))) {
    $history[$week['id']] = ['competition' => $week, 'entry' => $placement, 'videos' => [], 'has_results' => true];
   }
  }
  [$currentStart]=one_chance_week();
  foreach(rows('posts',$owner) as $post){
   $viralAt=strtotime((string)($post['viral_at']??''));
   if($viralAt===false||$viralAt>=$currentStart||($post['kind']??'')!=='video'||($post['status']??'')!=='published')continue;
   $card=post_card($post);
   if(!$card)continue;
   [$start,$end]=one_chance_week($viralAt);
   $weekId=gmdate('Ymd\THis',$start);
   $history[$weekId]??=[
    'competition'=>['id'=>$weekId,'start'=>gmdate(DATE_ATOM,$start),'end'=>gmdate(DATE_ATOM,$end),'status'=>'completed','config'=>competition_defaults()],
    'entry'=>null,'videos'=>[],'has_results'=>false,
   ];
   $history[$weekId]['videos'][]=$card;
  }
  krsort($history);
  return page($history, $p);
 }
 if(!empty($p['competition_id'])){$snapshot=rec('leaderboard_snapshots',text($p['competition_id'],40));check($snapshot!==null,'Weekly results not found.',404);return ['competition'=>$snapshot['competition'],'locked'=>true,'entries'=>page($snapshot['entries'],$p),'prize_results'=>competition_prize_results($snapshot),'server_time'=>now()];}
 $viewer=need_user();$active=usage_route('weekly_usage_total',[])['seconds'];
 $ranked=competition_ranked($c);$filtered=$ranked;$search=mb_strtolower(text($p['search']??'',100));if($search!=='')$filtered=array_values(array_filter($filtered,fn($entry)=>str_contains(mb_strtolower($entry['username'].' '.$entry['display_name']),$search)));if(!empty($p['remaining']))$filtered=array_values(array_filter($filtered,fn($entry)=>$entry['rank']>=6));if(isset($p['position'])){$position=filter_var($p['position'],FILTER_VALIDATE_INT);check($position!==false&&$position>=1&&$position<=5,'Choose a top-five position.');$filtered=array_values(array_filter($filtered,fn($entry)=>$entry['rank']===$position));}$mine=null;$groups=[];$counts=[];foreach(range(1,5) as $tier){$members=array_values(array_filter($ranked,fn($entry)=>$entry['rank']===$tier));$groups[$tier]=array_slice($members,0,4);$counts[$tier]=count($members);}foreach($ranked as $entry)if($entry['user_id']===$viewer['id'])$mine=$entry['rank'];
 $result=['competition'=>$c,'locked'=>false,'entries'=>page($filtered,$p),'top_groups'=>$groups,'tier_counts'=>$counts,'remaining_preview'=>array_slice(array_values(array_filter($ranked,fn($entry)=>$entry['rank']>=6)),0,3),'total_count'=>count($filtered),'my_rank'=>$mine,'totals'=>['votes'=>array_sum(array_column($ranked,'votes')),'views'=>array_sum(array_column($ranked,'views')),'viral'=>array_sum(array_column($ranked,'viral')),'active_users'=>count(array_filter(rows('profiles'),fn($u)=>$u['status']==='active'&&strtotime($u['last_active_at']??'')>=time()-300))],'viewer_active_seconds'=>$active,'server_time'=>now()];
 if(!empty($p['include_prizes'])){
  $latest=competition_prize_weeks(1)[0]??null;
  $result['prize_results']=$latest?competition_prize_results($latest):null;
 }
 return $result;
}
