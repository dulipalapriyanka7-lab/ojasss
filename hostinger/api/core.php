<?php
declare(strict_types=1);

function now(): string { return (new DateTimeImmutable('now',new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z'); }
function uid(): string {
    $b=random_bytes(16); $b[6]=chr((ord($b[6])&15)|64); $b[8]=chr((ord($b[8])&63)|128);
    $h=bin2hex($b); return substr($h,0,8).'-'.substr($h,8,4).'-'.substr($h,12,4).'-'.substr($h,16,4).'-'.substr($h,20);
}
function json_out($data,int $status=200): never { http_response_code($status); header('Content-Type: application/json; charset=utf-8'); echo json_encode($data,JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE); exit; }
final class ApiFault extends Exception { public function __construct(public int $status, public string $name, string $message) { parent::__construct($message); } }
function fail(int $status,string $name,string $message): never { throw new ApiFault($status,$name,$message); }
function check(bool $ok,string $message,int $status=422): void { if(!$ok) fail($status,'VALIDATION',$message); }
function q(string $sql,array $params=[]): PDOStatement { global $db; $s=$db->prepare($sql); $s->execute($params); return $s; }
function rec(string $kind,string $id): ?array { $v=q('SELECT data FROM oj_records WHERE kind=? AND id=?',[$kind,$id])->fetchColumn(); return $v===false?null:json_decode($v,true); }
function rows(string $kind,?string $owner=null,?string $parent=null): array {
    $sql='SELECT data FROM oj_records WHERE kind=?'; $args=[$kind];
    if($owner!==null){$sql.=' AND user_id=?';$args[]=$owner;} if($parent!==null){$sql.=' AND parent_id=?';$args[]=$parent;}
    $sql.=' ORDER BY created_at DESC,id DESC';
    return array_map(fn($x)=>json_decode($x,true),q($sql,$args)->fetchAll(PDO::FETCH_COLUMN));
}
function put(string $kind,array $row,?string $owner=null,?string $parent=null): array {
    $row['id']=$row['id']??uid(); $row['created_at']=$row['created_at']??now(); $row['updated_at']=now();
    q('INSERT INTO oj_records(kind,id,user_id,parent_id,created_at,updated_at,data) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),parent_id=VALUES(parent_id),updated_at=VALUES(updated_at),data=VALUES(data)',[$kind,$row['id'],$owner,$parent,$row['created_at'],$row['updated_at'],json_encode($row,JSON_THROW_ON_ERROR)]);
    return $row;
}
function del(string $kind,string $id): void { q('DELETE FROM oj_records WHERE kind=? AND id=?',[$kind,$id]); }
function need_user(): array { global $actor; if(!$actor)fail(401,'AUTH_REQUIRED','Please sign in to continue.'); if($actor['status']!=='active')fail(403,'ACCOUNT_RESTRICTED','This account is restricted.'); return $actor; }
function staff(bool $admin=false): array { $u=need_user(); if(!in_array($u['role'],$admin?['admin']:['admin','moderator'],true))fail(403,'FORBIDDEN','You do not have permission.'); return $u; }
function owned(string $kind,string $id,bool $allowStaff=false): array { $u=need_user(); $r=rec($kind,$id); if(!$r)fail(404,'NOT_FOUND','This item was not found.'); if(($r['user_id']??$r['author_id']??null)!==$u['id']&&!($allowStaff&&in_array($u['role'],['admin','moderator'],true)))fail(403,'FORBIDDEN','You do not have permission.'); return $r; }
function body(): array { $raw=file_get_contents('php://input'); if(strlen($raw)>1048576)fail(413,'TOO_LARGE','Request is too large.'); $v=json_decode($raw?:'{}',true); if(!is_array($v))fail(400,'INVALID_JSON','Invalid request.'); return $v; }
function text($v,int $max=2000): string { check(is_string($v)&&mb_strlen(trim($v))<=$max,'Text is too long or invalid.'); return trim($v); }
function enum_value($v,array $allowed): string { check(in_array($v,$allowed,true),'Invalid selection.'); return $v; }
function page(array $r,array $p,bool $count=false): array { $n=count($r); $r=array_slice(array_values($r),max(0,(int)($p['p_offset']??0)),min(100,max(1,(int)($p['p_limit']??30)))); return $count?array_map(fn($x)=>$x+['total_count'=>$n],$r):$r; }
function before(array $r,array $p): array { return array_values(array_filter($r,fn($x)=>empty($p['p_before'])||$x['created_at']<$p['p_before'])); }
function rate(string $name,int $limit,int $seconds): void {
    $key=hash('sha256',$name); $t=time();
    q('INSERT INTO oj_rate_limits(bucket,hits,resets_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE hits=IF(resets_at<?,1,hits+1),resets_at=IF(resets_at<?,VALUES(resets_at),resets_at)',[$key,$t+$seconds,$t,$t]);
    if((int)q('SELECT hits FROM oj_rate_limits WHERE bucket=?',[$key])->fetchColumn()>$limit)fail(429,'RATE_LIMITED','Too many attempts. Please try again later.');
}
function related(string $kind,string $owner,string $parent): bool { return (bool)q('SELECT 1 FROM oj_records WHERE kind=? AND user_id=? AND parent_id=? LIMIT 1',[$kind,$owner,$parent])->fetchColumn(); }
function relation_id(string $owner,string $parent): string { return hash('sha256',$owner.':'.$parent); }
function blocked(string $a,string $b): bool { return related('blocks',$a,$b)||related('blocks',$b,$a); }
function profile_status(array $u): array {
    // Status is explicitly created from Profile, never inferred from every upload.
    static $cache=[];$id=(string)$u['id'];
    if(isset($cache[$id]))return $cache[$id];
    $post=(string)($u['status_post_id']??'');$expires=strtotime((string)($u['status_expires_at']??''));
    if($post!==''&&$expires>time()){ $record=rec('statuses',$post);if($record&&$record['user_id']===$id&&($record['visibility']??'public')==='public')return $cache[$id]=['status_post_id'=>$post,'status_expires_at'=>$u['status_expires_at']]; }
    return $cache[$id]=['status_post_id'=>null,'status_expires_at'=>null];
}
function public_profile(array $u): array {
    global $actor; $me=$actor['id']??'';
    return array_intersect_key($u,array_flip(['id','username','display_name','bio','phone','interests','avatar_path','is_verified','created_at']))+[
      'followers_count'=>count(rows('follows',null,$u['id'])),'following_count'=>count(rows('follows',$u['id'])),
      'posts_count'=>count(array_filter(rows('posts',$u['id']),fn($p)=>$p['status']==='published'&&!post_expired($p))),
      'is_me'=>$me===$u['id'],'is_following'=>related('follows',$me,$u['id']),'follows_me'=>related('follows',$u['id'],$me),
      'blocked_by_me'=>related('blocks',$me,$u['id']),'has_viral_badge'=>count(array_filter(rows('posts',$u['id']),fn($p)=>!empty($p['viral_at'])&&$p['status']==='published'&&!post_expired($p)))>0,'is_premium'=>function_exists('one_chance_membership')&&one_chance_membership($u['id'])!==null,'premium_until'=>function_exists('one_chance_membership')?(one_chance_membership($u['id'])['ends_at']??null):null]+profile_status($u);
}
function unique_referral_code():string {do{$code=strtoupper(bin2hex(random_bytes(6)));$exists=q("SELECT id FROM oj_records WHERE kind='profiles' AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(data,'$.referral_code')))=? LIMIT 1",[$code])->fetchColumn();}while($exists!==false);return $code;}
function me_profile(array $u): array { if(empty($u['referral_code'])){$u['referral_code']=unique_referral_code();put('profiles',$u,$u['id']);} $c=q('SELECT email FROM oj_credentials WHERE user_id=?',[$u['id']])->fetchColumn(); return public_profile($u)+array_intersect_key($u,array_flip(['role','status','status_reason','onboarded','preferred_language','referral_code','referred','city']))+['address'=>$u['address']??'','category_preferences'=>$u['category_preferences']??null,'country'=>$u['country']??null,'email'=>$c?:null]; }
function new_profile(string $id,string $name): array { return put('profiles',['id'=>$id,'username'=>'user_'.substr(str_replace('-','',$id),0,12),'display_name'=>$name?:'Creator','bio'=>'','avatar_path'=>null,'is_verified'=>false,'role'=>'user','status'=>'active','status_reason'=>null,'onboarded'=>false,'preferred_language'=>'en','referral_code'=>unique_referral_code(),'referred'=>false,'last_active_at'=>now()],$id); }
function country_code($value,bool $all=false): string { $code=strtoupper(text($value??'',3));static $codes=null;$codes??=require __DIR__.'/country-codes.php';check(($all&&$code==='ALL')||in_array($code,$codes,true),'Choose a valid country.');return $code; }
function setting(string $key,$default=null) { $r=rec('settings',$key); return $r['value']??$default; }
function log_action(string $action,string $type,?string $id,$old,$new,?string $reason=null): void { global $actor; put('admin_logs',['id'=>uid(),'admin_id'=>$actor['id'],'admin_username'=>$actor['username'],'action'=>$action,'target_type'=>$type,'target_id'=>$id,'previous_state'=>$old,'new_state'=>$new,'reason'=>$reason,'ip'=>$_SERVER['REMOTE_ADDR']??null],$actor['id']); }
function notification(string $user,string $type,string $title,string $body,?string $link=null,?string $post=null): void {
    global $actor; if($actor&&$actor['id']===$user)return;
    $r=put('notifications',['type'=>$type,'title'=>$title,'body'=>mb_substr($body,0,500),'link'=>$link,'post_id'=>$post,'read_at'=>null,'actor'=>$actor?array_intersect_key($actor,array_flip(['id','username','display_name','avatar_path'])):null,'post_thumbnail_path'=>$post?(rec('posts',$post)['thumbnail_path']??null):null],$user);
    put('push_queue',['notification_id'=>$r['id'],'user_id'=>$user,'attempts'=>0,'status'=>'pending','next_attempt_at'=>time()],$user,$r['id']);
}
function post_expires_at(array $p): ?string { return in_array($p['category']??'',['news','part_time_jobs'],true)?gmdate('Y-m-d\TH:i:s\Z',strtotime($p['created_at'])+172800):null; }
function post_expired(array $p): bool { $expires=post_expires_at($p);return $expires!==null&&strtotime($expires)<=time(); }
function one_chance_category_defaults(): array {
    return ['entry' => ['entertainment'], 'voting' => ['entertainment']];
}
function one_chance_category_allowed(array $post, bool $voting = false): bool {
    $category = $post['source_category'] ?? $post['category'] ?? '';
    $policy = setting('one_chance.category_access', one_chance_category_defaults());
    return in_array($category, $policy['entry'], true) && category_available($category)
        && (!$voting || in_array($category, $policy['voting'], true));
}
function validate_one_chance_category_access(mixed $value): void {
    check(is_array($value) && count($value) === 2, 'Set entry and voting categories.');
    $categories = array_diff(layout_orders()['layout.category_order'], ['one_chance']);
    foreach (['entry', 'voting'] as $permission) {
        $selected = $value[$permission] ?? null;
        check(is_array($selected) && array_is_list($selected) && count($selected) <= count($categories), 'Choose valid categories.');
        foreach ($selected as $category) check(is_string($category) && in_array($category, $categories, true), 'Unknown category.');
        check(count(array_unique($selected)) === count($selected), 'Select each category once.');
    }
    check(!array_diff($value['voting'], $value['entry']), 'Enable One Chance entry before enabling votes.');
}
function post_card(array $p,bool $private=false): ?array {
    global $actor; if(($p['status']??'')==='deleted')return null; $me=$actor['id']??''; $u=rec('profiles',$p['author_id']);
    if(!$u||(!$private&&(post_expired($p)||$u['status']!=='active'||blocked($me,$u['id'])||($p['status']!=='published'&&$u['id']!==$me))))return null;
    if(!$private&&$me!==$u['id']){$visibility=$p['visibility']??'public';if($visibility==='private'||($visibility==='followers'&&!related('follows',$me,$u['id'])))return null;}
    $es=rows('engagements',null,$p['id']); $counts=['hot'=>0,'speak'=>0,'viral'=>0]; $mine=[];
    foreach($es as $e){$counts[$e['kind']]++;if($e['user_id']===$me)$mine[$e['kind']]=true;}
    $eligible=$counts['hot']>=max(10,(int)setting('engagement.hot_threshold',10))&&($p['shares_count']??0)>=max(10,(int)setting('engagement.share_threshold',10));
    if($eligible&&empty($p['viral_at'])&&($p['status']??'')==='published'&&!post_expired($p)){
      $p['viral_at']=now();put('posts',$p,$p['author_id']);
      $reward=(int)setting('rewards.viral_paise',0);$rewardId=hash('sha256','viral:'.$p['id']);if($reward>0&&!rec('earnings',$rewardId))put('earnings',['id'=>$rewardId,'user_id'=>$p['author_id'],'type'=>'viral','post_id'=>$p['id'],'amount_paise'=>$reward,'status'=>'pending','reference'=>'viral:'.$p['id'],'note'=>null,'reviewed_at'=>null,'reviewed_by_username'=>null],$p['author_id'],$p['id']);
    }
    // A video that falls below the Viral targets (10 Fires and 10 Shares) during the current week
    // leaves Viral and One Chance until it reaches them again. Votes it already got are kept.
    if(!$eligible&&!empty($p['viral_at'])&&function_exists('one_chance_is_current')&&one_chance_is_current($p)){unset($p['viral_at']);put('posts',$p,$p['author_id']);}
    $isViral = !empty($p['viral_at']);
    $originalCategory = $p['category'];
    $premium = function_exists('one_chance_membership') ? one_chance_membership($u['id']) : null;
    $oneChanceReady = $isViral && one_chance_video_eligible($p);
    $votingUntil = $oneChanceReady ? one_chance_voting_until($p) : null;
    $votingOpens = $oneChanceReady ? one_chance_voting_opens_at($p) : null;
    $unlockAt = $oneChanceReady && $votingOpens !== null && $votingOpens > time() ? one_chance_unlock_available_at($p) : null;
    $paidEntryPrice = $me === $p['author_id'] && $unlockAt !== null && one_chance_video_can_renew($p)
      ? one_chance_default_packages()[0]['price_paise'] : null;
    $weekVotes=$oneChanceReady?one_chance_week_votes($p['id']):[];
    $p['category'] = $oneChanceReady ? 'one_chance' : ($originalCategory === 'one_chance' ? 'entertainment' : $originalCategory);
    foreach(['viral'=>$isViral,'one_chance'=>$oneChanceReady] as $stage=>$reached){if(!$reached)continue;$noticeId=hash('sha256','post-stage:'.$stage.':'.$p['id']);if(!rec('event_dedup',$noticeId)){put('event_dedup',['id'=>$noticeId],$p['author_id'],$p['id']);$previousActor=$actor;try{$actor=null;notification($p['author_id'],'system',$stage==='viral'?'Your video is Viral':'You reached One Chance',$stage==='viral'?'Your video reached its Fires and Shares targets.':'Your video is now in One Chance.','/post/'.$p['id'],$p['id']);}finally{$actor=$previousActor;}}}
    $episodeWatched=!empty($p['series_id'])&&$me!==''&&rec('episode_watches',relation_id($me,$p['id']))!==null;
    $authorStatus=profile_status($u);
    return $p+['source_category'=>$originalCategory,'author_premium'=>$premium!==null,'premium_until'=>$premium['ends_at']??null,'author_premium_placement'=>$premium['placement']??null,'expires_at'=>post_expires_at(['category'=>$originalCategory]+$p),'author_username'=>$u['username'],'author_display_name'=>$u['display_name'],'author_avatar_path'=>$u['avatar_path'],'author_verified'=>$u['is_verified'],'author_status_post_id'=>$authorStatus['status_post_id'],'author_status_expires_at'=>$authorStatus['status_expires_at'],'episode_watched'=>$episodeWatched,
      'hot_count'=>$counts['hot'],'speak_count'=>$counts['speak'],'viral_count'=>$counts['viral'],'comments_count'=>count(rows('comments',null,$p['id'])),
      'bookmarks_count'=>count(rows('bookmarks',null,$p['id'])),'my_hot'=>isset($mine['hot']),'my_speak'=>isset($mine['speak']),'my_viral'=>isset($mine['viral']),
      'votes_count'=>count($weekVotes),'my_voted'=>$me!==''&&in_array($me,array_column($weekVotes,'user_id'),true),'is_viral'=>$isViral,'viral_eligible'=>$eligible,'one_chance_ready'=>$oneChanceReady,'one_chance_available_at'=>$oneChanceReady?$p['viral_at']:null,
      'one_chance_voting_until'=>$votingUntil?gmdate(DATE_ATOM,$votingUntil):null,'one_chance_voting_opens_at'=>$votingOpens===null?null:gmdate(DATE_ATOM,$votingOpens),'one_chance_voting_renewal_paise'=>$paidEntryPrice,'one_chance_unlock_at'=>$unlockAt===null?null:gmdate(DATE_ATOM,$unlockAt),
      'my_bookmarked'=>related('bookmarks',$me,$p['id']),'my_following'=>related('follows',$me,$u['id']),'has_cta'=>!empty($p['cta_type']),
      'complaint'=>rec('complaints',$p['id'])];
}
function visible_post(string $id): array { $p=rec('posts',$id); $p=$p?post_card($p):null; if(!$p)fail(404,'NOT_FOUND','Post was not found.'); return $p; }
function comment_card(array $c): array { global $actor; $u=rec('profiles',$c['user_id']);$me=$actor['id']??'';$fires=rows('comment_fires',null,$c['id']);return $c+['parent_id'=>null,'language'=>'en','fire_count'=>count($fires),'my_fire'=>count(array_filter($fires,fn($r)=>$r['user_id']===$me))>0,'reply_count'=>count(array_filter(rows('comments',null,$c['post_id']),fn($r)=>($r['parent_id']??null)===$c['id']&&!blocked($me,$r['user_id']))),'author'=>array_intersect_key($u??[],array_flip(['id','username','display_name','avatar_path','is_verified'])),'can_edit'=>$me===$c['user_id'],'can_pin'=>empty($c['parent_id'])&&($me===(rec('posts',$c['post_id'])['author_id']??null)||($actor['role']??'')==='admin'),'can_delete'=>$me===$c['user_id']||in_array($actor['role']??'',['admin','moderator'],true)]; }
function wallet(string $user): array {
    $e=rows('earnings',$user);$w=rows('withdrawals',$user);$sum=fn($a,$f)=>array_sum(array_column(array_filter($a,$f),'amount_paise'));
    $approved=$sum($e,fn($x)=>$x['status']==='approved');$paid=$sum($w,fn($x)=>$x['status']==='paid');$reserved=$sum($w,fn($x)=>in_array($x['status'],['requested','approved'],true));
    return ['available_paise'=>max(0,$approved-$paid-$reserved),'pending_paise'=>$sum($e,fn($x)=>$x['status']==='pending'),'lifetime_paise'=>$approved,'withdrawn_paise'=>$paid,'in_process_paise'=>$reserved,'this_month_paise'=>$sum($e,fn($x)=>$x['status']==='approved'&&substr($x['created_at'],0,7)===gmdate('Y-m')),'min_withdrawal_paise'=>(int)setting('withdrawals.min_paise',10000),'max_withdrawal_paise'=>(int)setting('withdrawals.max_paise',5000000)];
}
function ensure_viral_entry_settings(): void {
    foreach(['one_chance.lock_hours'=>48,'one_chance.vote_window_hours'=>12,'one_chance.wait_hours'=>48,'one_chance.entry_paise'=>1000,'one_chance.free_wait_enabled'=>true,'one_chance.category_access'=>one_chance_category_defaults(),'feed.reveal_footer_on_unmute'=>true] as $key=>$value)if(!rec('settings',$key))put('settings',['id'=>$key,'key'=>$key,'value'=>$value,'description'=>ucwords(str_replace(['.','_'],' ',$key)),'is_public'=>true,'is_dangerous'=>false,'updated_by'=>null]);
}
function seed(): void {
    $defaults=['engagement.hot_threshold'=>10,'engagement.share_threshold'=>10,'engagement.speak_threshold'=>50,'engagement.viral_threshold'=>25,'rewards.viral_paise'=>0,'rewards.cta_click_paise'=>0,'rewards.referral_paise'=>0,'withdrawals.min_paise'=>10000,'withdrawals.max_paise'=>5000000,'platform.maintenance_mode'=>false,'uploads.max_video_mb'=>100,'uploads.max_image_mb'=>10,'uploads.max_video_seconds'=>120,'episodes.max_per_series'=>0,'content.complaints_require_review'=>true,'content.comments_enabled'=>true];
    $defaults+=['one_chance.wait_hours'=>48,'one_chance.entry_paise'=>1000,'one_chance.free_wait_enabled'=>true,'feed.reveal_footer_on_unmute'=>true];
    foreach($defaults as $k=>$v)if(!rec('settings',$k))put('settings',['id'=>$k,'key'=>$k,'value'=>$v,'description'=>ucwords(str_replace(['.','_'],' ',$k)),'is_public'=>true,'is_dangerous'=>str_starts_with($k,'rewards.')||str_starts_with($k,'withdrawals.'),'updated_by'=>null]);
    foreach([['website','Visit website','Globe','url'],['call','Call now','Phone','phone'],['whatsapp','WhatsApp','MessageCircle','whatsapp'],['email','Email','Mail','email'],['apply','Apply now','Briefcase','url']] as $i=>$x)if(!rec('cta_types',$x[0]))put('cta_types',['id'=>$x[0],'label'=>$x[1],'icon'=>$x[2],'target_kind'=>$x[3],'reward_eligible'=>false,'sort_order'=>$i]);
}
function migrate_viral_shares(): void {
    global $db;if(rec('system','viral_hearts_shares_v1'))return;
    $db->beginTransaction();q('SELECT id FROM oj_mutex WHERE id=1 FOR UPDATE');
    if(!rec('system','viral_hearts_shares_v1')){
      foreach(['engagement.hot_threshold','engagement.share_threshold'] as $key){$r=rec('settings',$key)??['id'=>$key,'key'=>$key,'is_public'=>true,'is_dangerous'=>false,'updated_by'=>null];$r['value']=10;$r['description']=$key==='engagement.hot_threshold'?'Hearts required to unlock Viral':'Shares required to unlock Viral';put('settings',$r);}
      put('system',['id'=>'viral_hearts_shares_v1','applied_at'=>now()]);
    }$db->commit();
}

function layout_orders(): array { return [
 'layout.category_order'=>['one_chance','entertainment','technology','education','gaming','lifestyle','horror_stories','music_dance','world_education','business_promotion','part_time_jobs','full_time_jobs','news','public_complaint'],
 'layout.action_order'=>['hearts','speak','viral','comments','save','share','more']
]; }
function home_controls(): array {return json_decode('{"brand":true,"search":false,"notifications":false,"tabs":false,"categories":false,"auto":true,"filters":true,"announcements":false,"creator":false,"caption":false,"hashtags":false,"category":false,"location":false,"timestamp":false,"region":false,"audio":false,"source":false,"cta":false,"avatar":true,"hearts":true,"speak":true,"viral":true,"comments":false,"save":true,"share":true,"more":true,"pause":true,"mute":true,"progress":true,"navigation":true}',true);}
function validate_home_controls(mixed $value): void {check(is_array($value)&&count($value)===count(home_controls()),'Include every Home control.');foreach(home_controls() as $key=>$default)check(array_key_exists($key,$value)&&is_bool($value[$key]),'Choose on or off for every Home control.');}
function category_available(string $id,?array $config=null): bool {
 $config=$config??setting('categories.config',[]);return in_array($id,layout_orders()['layout.category_order'],true)&&($config[$id]['enabled']??true)&&!($config[$id]['deleted']??false);
}
function validate_category_config(mixed $value): void {
 check(is_array($value),'Enter category settings.');$available=0;
 foreach($value as $id=>$entry){check(in_array($id,layout_orders()['layout.category_order'],true)&&is_array($entry),'Unknown category.');check(count($entry)===4&&isset($entry['label'],$entry['description'],$entry['enabled'],$entry['deleted']),'Include all category fields.');check(is_string($entry['label'])&&trim($entry['label'])!==''&&mb_strlen($entry['label'])<=60,'Use a category name up to 60 characters.');check(is_string($entry['description'])&&mb_strlen($entry['description'])<=240,'Use a description up to 240 characters.');check(is_bool($entry['enabled'])&&is_bool($entry['deleted']),'Choose on or off.');}
 foreach(layout_orders()['layout.category_order'] as $id)if($id!=='one_chance'&&category_available($id,$value))$available++;
 check($available>0,'Keep at least one upload category enabled.');
}
function random_feed_order(array $posts,string $seed): array {
 usort($posts,fn($a,$b)=>strcmp(hash('sha256',$seed.':'.$a['id']),hash('sha256',$seed.':'.$b['id']))?:strcmp($a['id'],$b['id']));return $posts;
}
function ensure_layout_settings(): void {
 $announcementRows=rows('announcements');$current=time();$hasVisibleAnnouncement=false;
 foreach($announcementRows as $announcement){$start=isset($announcement['starts_at'])&&$announcement['starts_at']!==''?strtotime((string)$announcement['starts_at']):false;$end=isset($announcement['ends_at'])&&$announcement['ends_at']!==''?strtotime((string)$announcement['ends_at']):false;if(!empty($announcement['is_active'])&&($start===false||$start<=$current)&&($end===false||$end>$current)){$hasVisibleAnnouncement=true;break;}}
 if(!$hasVisibleAnnouncement)put('announcements',['id'=>'welcome-platform-announcement','title'=>'Welcome to OJASSS','message'=>'Discover fresh videos, challenges, creator rewards and platform updates here.','image_url'=>null,'cta_label'=>'View updates','cta_url'=>'/updates','starts_at'=>now(),'ends_at'=>null,'is_active'=>true],null,null);
 if(!rec('settings','categories.config'))put('settings',['id'=>'categories.config','key'=>'categories.config','value'=>new stdClass(),'description'=>'Category availability and display names','is_public'=>true,'is_dangerous'=>false,'updated_by'=>null]);
 if(!rec('settings','one_chance.upi_id'))put('settings',['id'=>'one_chance.upi_id','key'=>'one_chance.upi_id','value'=>'kasturivamsikrishn@ybl','description'=>'One Chance payment UPI ID','is_public'=>true,'is_dangerous'=>false,'updated_by'=>null]);
 if(!rec('settings','one_chance.packages'))put('settings',['id'=>'one_chance.packages','key'=>'one_chance.packages','value'=>function_exists('one_chance_default_packages')?one_chance_default_packages():[],'description'=>'One Chance promotion packages','is_public'=>false,'is_dangerous'=>false,'updated_by'=>null]);
 if(!rec('settings','home.controls'))put('settings',['id'=>'home.controls','key'=>'home.controls','value'=>home_controls(),'description'=>'Home display controls','is_public'=>true,'is_dangerous'=>false,'updated_by'=>null]);
 foreach(layout_orders() as $key=>$order){
  $saved=rec('settings',$key);
  if(!$saved){put('settings',['id'=>$key,'key'=>$key,'value'=>$order,'description'=>$key==='layout.category_order'?'Home category order':'Post action icon order','is_public'=>true,'is_dangerous'=>false,'updated_by'=>null]);continue;}
  if($key==='layout.category_order'&&is_array($saved['value'])){
   $old=['one_chance','entertainment','horror_stories','music_dance','world_education','business_promotion','part_time_jobs','news','public_complaint'];
   $next=$saved['value']===$old?$order:array_values(array_unique(array_merge($saved['value'],$order)));
   if($next!==$saved['value']){$saved['value']=$next;put('settings',$saved);}
  }
 }
}
function validate_layout_order(string $key,mixed $value): void {
 $expected=layout_orders()[$key]??null;
 check($expected!==null&&is_array($value)&&array_is_list($value)&&count($value)===count($expected)&&count(array_unique($value,SORT_REGULAR))===count($expected),'Include every item exactly once.');
 foreach($value as $item)check(is_string($item)&&in_array($item,$expected,true),'Unknown position item.');
}
