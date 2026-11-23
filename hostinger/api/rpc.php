<?php
declare(strict_types=1);
require_once __DIR__.'/competition.php';
require_once __DIR__.'/business.php';
require_once __DIR__.'/coins.php';
require_once __DIR__.'/tickets.php';
require_once __DIR__.'/shows.php';
require_once __DIR__.'/pubs.php';
require_once __DIR__.'/prizes.php';
require_once __DIR__.'/realestate.php';
require_once __DIR__.'/feedback.php';
require_once __DIR__.'/demo-videos.php';
require_once __DIR__.'/city.php';
require_once __DIR__.'/challenge-tasks.php';
require_once __DIR__.'/viral-challenges.php';
require_once __DIR__.'/chat-presence.php';
require_once __DIR__.'/monster-game.php';
require_once __DIR__.'/storage-admin.php';
function episode_lock_reason(array $episode,array $series,string $viewerId): ?string {
    if($viewerId==='' )return 'Sign in to unlock this episode.';
    if(($episode['author_id']??'')===$viewerId)return null;
    $number=(int)($episode['episode_number']??0);
    if($number>1){$previous=null;foreach($series as $candidate)if((int)($candidate['episode_number']??0)===$number-1){$previous=$candidate;break;}if($previous&&rec('episode_watches',relation_id($viewerId,$previous['id']))===null)return 'Watch Episode '.($number-1).' to unlock this episode.';}
    $access=$episode['episode_access']??'free';
    if($access==='premium')return 'Premium access is required for this episode.';
    if($access==='interest'){
        // Interest-locked episodes become available to everybody once the
        // creator's audience target is reached.
        $goal=15;
        $count=count(rows('episode_interest',null,$episode['id']));
        if($count >= $goal)return null;
        return 'This episode opens when '.$goal.' viewers request it.';
    }
    return null;
}
function rpc_route(string $name,array $p): mixed {
    if(str_starts_with($name,'monster_game_'))return monster_game_rpc($name,$p);
    if(str_starts_with($name,'viral_challenge_'))return viral_challenge_route($name,$p);
    if($name==='challenge_public')return challenge_public($p);
    if(in_array($name,['challenge_admin_list','challenge_admin_users','challenge_admin_banner','challenge_admin_save','challenge_admin_delete','challenge_admin_assignments','challenge_admin_review'],true))return challenge_admin($name,$p);
    if(in_array($name,['chat_presence_update','chat_presence_state'],true))return chat_presence_rpc($name,$p);
    if($name==='city_set'||$name==='city_report')return city_rpc($name,$p);
    if($name==='demo_videos'||str_starts_with($name,'demo_admin_'))return demo_rpc($name,$p);
    if(str_starts_with($name,'business_'))return business_rpc($name,$p);
    if(str_starts_with($name,'coins_'))return coins_rpc($name,$p);
    if(str_starts_with($name,'tickets_'))return tickets_rpc($name,$p);
    if(str_starts_with($name,'show_'))return shows_rpc($name,$p);
    if(str_starts_with($name,'pubs_'))return pubs_rpc($name,$p);
    if(str_starts_with($name,'re_'))return realestate_rpc($name,$p);
    if(str_starts_with($name,'feedback_'))return feedback_rpc($name,$p);
    if($name==='leaderboard_prizes'||$name==='leaderboard_prizes_save')return prizes_rpc($name,$p);
    if($name==='one_chance_pay_coins')return one_chance_rpc($name,$p);
    if(in_array($name,['competition_live','competition_history','competition_settings','save_competition_settings'],true))return competition_rpc($name,$p);
    global $actor; $id=$actor['id']??'';
    if(in_array($name,['admin_storage_usage','admin_storage_cleanup','admin_storage_plan'],true))return storage_admin_rpc($name,$p);
    if(str_starts_with($name,'admin_'))return admin_rpc($name,$p);
    if(in_array($name,['one_chance_status','one_chance_request','one_chance_submit','one_chance_cancel'],true))return one_chance_rpc($name,$p);
    if(in_array($name,['save_category_preferences','vote_one_chance','one_chance_leaderboard'],true))return discovery_rpc($name,$p);
    switch($name) {
    case 'public_settings': ensure_viral_entry_settings();$r=[];foreach(rows('settings') as $s)if($s['is_public'])$r[$s['key']]=$s['value'];return $r;
    case 'list_authorities':return array_values(array_map(fn($r)=>array_intersect_key($r,array_flip(['id','name','department','jurisdiction'])),array_filter(rows('authorities'),fn($r)=>$r['is_active'])));
    case 'active_announcements':
      // Announcements are public platform information.  Do not rely on string
      // comparisons for dates here: older records can have a local date format,
      // while new records use ISO UTC.  A malformed optional date must never
      // hide an announcement that an admin has explicitly marked Active.
      $current=time();
      $items=array_values(array_filter(rows('announcements'),function($r)use($current){
        if(empty($r['is_active']))return false;
        $start=isset($r['starts_at'])&&$r['starts_at']!==''?strtotime((string)$r['starts_at']):false;
        $end=isset($r['ends_at'])&&$r['ends_at']!==''?strtotime((string)$r['ends_at']):false;
        return ($start===false||$start<=$current)&&($end===false||$end>$current);
      }));
      usort($items,fn($a,$b)=>strtotime((string)($b['starts_at']??''))<=>strtotime((string)($a['starts_at']??'')));
      return $items;
    case 'get_me':return me_profile(need_user());
    case 'toggle_status_hot':
      $user=need_user();$status=rec('statuses',(string)($p['p_status_id']??''));
      check($status!==null&&strtotime((string)($status['expires_at']??''))>time(),'This status is no longer available.',404);
      check(($status['user_id']??'')!==$user['id'],'You cannot Hot your own status.');
      $owner=rec('profiles',(string)$status['user_id']);check($owner!==null&&$owner['status']==='active'&&!blocked($user['id'],$owner['id']),'This status is not available.',404);
      $key=relation_id($user['id'],$status['id']);$existing=rec('status_hots',$key);
      if($existing){del('status_hots',$key);$hot=false;}else{put('status_hots',['id'=>$key,'status_id'=>$status['id'],'user_id'=>$user['id']],$user['id'],$status['id']);$hot=true;notification($owner['id'],'status_hot',($user['display_name']?:$user['username']).' sent a Hot','Your status got a Hot.','/profile/'.$user['username']);}
      return ['my_hot'=>$hot,'hot_count'=>count(rows('status_hots',null,$status['id']))];
    case 'update_status':case 'delete_status':
      $user=need_user();$status=rec('statuses',(string)($p['p_status_id']??''));
      check($status!==null,'This status was not found.',404);
      $isStaff=in_array($user['role']??'',['admin','moderator','super_admin'],true);
      check(($status['user_id']??'')===$user['id']||$isStaff,'You can only change your own status.',403);
      if($name==='update_status'){
        $status['caption']=text($p['p_caption']??'',280);
        if(isset($p['p_visibility']))$status['visibility']=enum_value($p['p_visibility'],['public','followers']);
        return put('statuses',$status,$status['user_id']);
      }
      del('statuses',$status['id']);
      $owner=rec('profiles',(string)$status['user_id']);
      if($owner&&($owner['status_post_id']??'')===$status['id']){$owner['status_post_id']=null;$owner['status_expires_at']=null;put('profiles',$owner,$owner['id']);}
      if($status['user_id']!==$user['id'])log_action('delete_status','status',$status['id'],$status,null,'Removed by staff');
      return ['deleted'=>true];
    case 'list_statuses':
      $items=[];$cutoff=time();
      foreach(rows('statuses') as $status){
        if(strtotime((string)($status['expires_at']??''))<=$cutoff||($status['visibility']??'public')==='private')continue;
        $owner=rec('profiles',(string)$status['user_id']);if(!$owner||$owner['status']!=='active'||blocked($id,$owner['id']))continue;
        if(($status['visibility']??'public')==='followers'&&$id!==$owner['id']&&!related('follows',$id,$owner['id']))continue;
        $items[]=$status+['profile'=>public_profile($owner),'hot_count'=>count(rows('status_hots',null,$status['id'])),'my_hot'=>$id!==''&&related('status_hots',$id,$status['id'])];
      }
      usort($items,fn($a,$b)=>strcmp($b['created_at'],$a['created_at']));return page($items,$p);
    case 'touch_presence':$u=need_user();$u['last_active_at']=now();put('profiles',$u,$id);return null;
    case 'get_profile':
      foreach(rows('profiles') as $u)if(strcasecmp($u['username'],(string)($p['p_handle']??''))===0&&$u['status']==='active'&&!blocked($id,$u['id']))return public_profile($u);
      fail(404,'NOT_FOUND','Profile not found.');
    case 'search_users':case 'popular_creators':case 'list_follows':
      $us=array_values(array_filter(rows('profiles'),fn($u)=>$u['status']==='active'&&!blocked($id,$u['id'])));
      if($name==='search_users'){$term=strtolower(text($p['p_q']??'',100));$us=array_values(array_filter($us,fn($u)=>str_contains(strtolower($u['username'].' '.$u['display_name']),$term)));}
      if($name==='list_follows'){$target=(string)($p['p_user_id']??'');$dir=enum_value($p['p_direction']??'',['followers','following']);$us=array_values(array_filter($us,fn($u)=>$dir==='followers'?related('follows',$u['id'],$target):related('follows',$target,$u['id'])));}
      $us=array_map('public_profile',$us);if($name==='popular_creators')usort($us,fn($a,$b)=>$b['followers_count']<=>$a['followers_count']);return page($us,$p);
    case 'update_profile':case 'complete_onboarding':
      $u=need_user();$map=['p_display_name'=>['display_name',50],'p_bio'=>['bio',500],'p_address'=>['address',300],'p_phone'=>['phone',24],'p_interests'=>['interests',300],'p_username'=>['username',30],'p_preferred_language'=>['preferred_language',20],'p_avatar_path'=>['avatar_path',200]];
      foreach($map as $param=>[$key,$max])if(isset($p[$param])){
        $v=text($p[$param],$max);
        if($key==='username'){check((bool)preg_match('/^[a-zA-Z0-9_]{3,30}$/',$v),'Username must contain 3–30 letters, numbers or underscores.');foreach(rows('profiles') as $other)if($other['id']!==$id&&strcasecmp($other['username'],$v)===0)fail(409,'USERNAME_TAKEN','That username is already taken.');}
        if($key==='avatar_path')check(str_starts_with($v,$id.'/')&&rec('objects',hash('sha256','avatars/'.$v))!==null,'Invalid avatar upload.');
        if($key==='phone')check($v===''||(bool)preg_match('/^\+?[0-9 ()-]{8,24}$/',$v),'Enter a valid phone number.');
        if($key==='display_name')check($v!=='','Enter your name.');$u[$key]=$v;
      }
      if(isset($p['p_country']))$u['country']=country_code($p['p_country'],true);
      if($name==='complete_onboarding'){$u=apply_signup_referral($u,$p['p_referral_code']??'');$u['onboarded']=true;}
      $actor=put('profiles',$u,$id);return me_profile($actor);
    case 'feed':case 'trending_posts':case 'get_post':case 'user_posts':case 'search_posts':case 'my_bookmarks':
      $ps=$name==='get_post'?array_filter([rec('posts',(string)($p['p_post_id']??''))]):($name==='user_posts'?rows('posts',(string)($p['p_user_id']??'')):rows('posts'));if($name==='my_bookmarks')need_user();
      $categoryConfig=setting('categories.config',[]);
      $ps=array_filter($ps,function($r)use($p,$name,$id,$categoryConfig){
        if(in_array($name,['feed','trending_posts','search_posts'],true)&&!category_available($r['category'],$categoryConfig))return false;
        if($name==='feed'&&($p['p_category']??'')==='one_chance'&&!category_available('one_chance',$categoryConfig))return false;
        if($name==='get_post'&&$r['id']!==($p['p_post_id']??''))return false;
        if($name==='user_posts'&&$r['author_id']!==($p['p_user_id']??''))return false;
        if($name==='my_bookmarks'&&!related('bookmarks',$id,$r['id']))return false;
        if($name==='feed'&&($p['p_mode']??'')==='following'&&!related('follows',$id,$r['author_id']))return false;
        foreach(['kind','language','country'] as $f)if(!empty($p['p_'.$f])&&($r[$f]??null)!==$p['p_'.$f])return false;
        if(!empty($p['p_city'])&&strcasecmp((string)($r['city']??''),(string)$p['p_city'])!==0)return false;
        if($name==='search_posts'&&!str_contains(mb_strtolower($r['caption'].' '.implode(' ',$r['hashtags']??[])),mb_strtolower(ltrim(text($p['p_q']??'',100),'#'))))return false;
        return empty($p['p_before'])||$r['created_at']<$p['p_before'];
      });
      $seed=$name==='feed'&&($p['p_mode']??'for_you')==='for_you'?text($p['p_seed']??'',100):'';
      if($seed!=='')$ps=random_feed_order(array_values($ps),$seed);
      // Most feeds need only one page: avoid building every post's reaction totals.
      if($name!=='trending_posts'&&($p['p_category']??'')!=='one_chance'){
       $out=[];$seen=0;$offset=max(0,(int)($p['p_offset']??0));$limit=min(100,max(1,(int)($p['p_limit']??30)));
       foreach($ps as $raw){
        // Viral videos remain discoverable in the main feed even when a member has
        // narrowed their normal category preferences. Their One Chance card is still
        // delayed until the free 48-hour window is complete.
        if($name==='feed'&&empty($p['p_category'])&&$id&&isset($actor['category_preferences'])&&!$actor['category_preferences']['show_all']&&!in_array($raw['category'],$actor['category_preferences']['selected'],true)&&empty($raw['viral_at']))continue;
        $card=post_card($raw);if(!$card||(!empty($p['p_category'])&&$card['category']!==$p['p_category']))continue;
        if($name==='user_posts'&&!empty($p['p_viral_only'])&&($card['kind']!=='video'||empty($card['is_viral'])||$card['status']!=='published'))continue;
        if($seen++<$offset)continue;$out[]=$card;if(count($out)>=$limit)break;
       }return $out;
      }
      $ps=array_values(array_filter(array_map('post_card',$ps)));
      if($name==='feed'&&empty($p['p_category'])&&$id&&isset($actor['category_preferences'])&&!$actor['category_preferences']['show_all']){$chosen=$actor['category_preferences']['selected'];$ps=array_values(array_filter($ps,fn($r)=>!empty($r['is_viral'])||in_array($r['source_category']??$r['category'],$chosen,true)));}
      // One Chance never contains ordinary uploads. A video appears only after it
      // becomes Viral and either completes its free 48-hour wait or has verified
      // ₹10 fast entry.
      if(($p['p_category']??'')==='one_chance')$ps=array_values(array_filter($ps,fn($r)=>$r['is_viral']&&($r['one_chance_ready']??false)&&$r['kind']==='video'&&$r['status']==='published'&&($r['visibility']??'public')==='public'));
      if(!empty($p['p_category']))$ps=array_values(array_filter($ps,fn($r)=>$r['category']===$p['p_category']));
      if(($p['p_category']??'')==='one_chance'&&$seed===''){
       $priority=['featured'=>1];
       usort($ps,fn($a,$b)=>(($priority[$b['author_premium_placement']??'']??0)<=>($priority[$a['author_premium_placement']??'']??0))?:((($b['votes_count']??0)<=>($a['votes_count']??0)))?:strcmp($b['created_at'],$a['created_at']));
      }
      if($name==='trending_posts'){$since=time()-min(90,max(1,(int)($p['p_days']??7)))*86400;$ps=array_values(array_filter($ps,fn($r)=>strtotime($r['created_at'])>=$since));usort($ps,fn($a,$b)=>((($p['p_category']??'')==='one_chance'?((int)$b['author_premium']<=>(int)$a['author_premium']):0)?:(($b['viral_count']*5+$b['hot_count'])<=>($a['viral_count']*5+$a['hot_count']))));}
      return page($ps,$p);
    case 'update_post':$r=owned('posts',(string)($p['p_post_id']??''));foreach(['caption'=>2000,'location'=>200,'language'=>20] as $k=>$max)if(isset($p['p_'.$k]))$r[$k]=text($p['p_'.$k],$max);return [post_card(put('posts',$r,$id))];
    case 'delete_post':$r=owned('posts',(string)($p['p_post_id']??''));permanently_delete_post($r);return null;
    case 'record_view':case 'record_share':case 'record_cta_click':
      $post=(string)($p['p_post_id']??'');$r=visible_post($post);$kind=$name==='record_view'?'views_count':($name==='record_share'?'shares_count':'cta_clicks');
      $r=rec('posts',$post);$who=$id?:hash('sha256',$_SERVER['REMOTE_ADDR']??'');$key=hash('sha256',$kind.':'.$post.':'.$who.':'.gmdate('Y-m-d'));
      if(!rec('event_dedup',$key)){put('event_dedup',['id'=>$key,'event'=>$kind,'viewer'=>$who],$who,$post);$r[$kind]=($r[$kind]??0)+1;put('posts',$r,$r['author_id']);}
      if($name==='record_view')competition_event('views',$r,$who);
      if($name==='record_share'){$card=post_card($r);return ['shares_count'=>$r['shares_count'],'viral_eligible'=>$card['viral_eligible'],'is_viral'=>$card['is_viral'],'category'=>$card['category'],'viral_at'=>$card['viral_at']??null];}
      if($name==='record_cta_click'){check(!empty($r['cta_url']),'No action is available.');return ['url'=>$r['cta_url'],'kind'=>rec('cta_types',$r['cta_type'])['target_kind']??'url'];}return null;
    case 'series_details':
      $post=visible_post((string)($p['p_post_id']??''));check(!empty($post['series_id']),'This video is not part of a short movie.',404);$seriesId=$post['series_id'];$raw=[];
      foreach(rows('posts',$post['author_id']) as $candidate)if(($candidate['series_id']??'')===$seriesId&&($candidate['status']??'')==='published')$raw[]=$candidate;
      usort($raw,fn($a,$b)=>(int)$a['episode_number']<=>(int)$b['episode_number']);$episodes=[];
      $inOneChance=((post_card($post)??[])['category']??'')==='one_chance';foreach($raw as $candidate){$card=post_card($candidate);if(!$card)continue;if($inOneChance&&($card['category']??'')!=='one_chance')continue;$number=(int)$candidate['episode_number'];$reason=$inOneChance?null:episode_lock_reason($candidate,$raw,$id);$interestCount=count(rows('episode_interest',null,$candidate['id']));$interestGoal=($candidate['episode_access']??'free')==='interest'?15:max(1,(int)($candidate['episode_interest_goal']??15));$episodes[]=['id'=>$card['id'],'episode_number'=>$number,'thumbnail_path'=>$card['thumbnail_path'],'caption'=>$card['caption'],'title'=>$candidate['episode_title']?:'Episode '.$number,'access'=>$candidate['episode_access']??'free','watched'=>!empty($card['episode_watched']),'locked'=>$reason!==null,'lock_reason'=>$reason,'interest_count'=>$interestCount,'interest_goal'=>$interestGoal,'interest_percent'=>min(100,(int)round(($interestCount/$interestGoal)*100)),'interested'=>$id!==''&&related('episode_interest',$id,$candidate['id'])];}
      return ['series_id'=>$seriesId,'title'=>$post['series_title'],'genre'=>$post['series_genre'],'total'=>$post['episode_total']===null?null:(int)$post['episode_total'],'episodes'=>$episodes,'interest_count'=>count(rows('series_interest',null,$seriesId)),'interested'=>$id!==''&&related('series_interest',$id,$seriesId),'is_creator'=>$id!==''&&$id===$post['author_id']];
    case 'complete_episode':
      need_user();$post=visible_post((string)($p['p_post_id']??''));check(!empty($post['series_id']),'This video is not an episode.');$number=(int)$post['episode_number'];$series=[];foreach(rows('posts',$post['author_id']) as $candidate)if(($candidate['series_id']??'')===$post['series_id']&&($candidate['status']??'')==='published')$series[]=$candidate;$reason=episode_lock_reason($post,$series,$id);check($reason===null,$reason??'This episode is locked.');
      put('episode_watches',['id'=>relation_id($id,$post['id']),'user_id'=>$id,'post_id'=>$post['id'],'series_id'=>$post['series_id']],$id,$post['id']);return ['watched'=>true,'next_episode'=>$number+1];
    case 'toggle_series_interest':
      need_user();$seriesId=text($p['p_series_id']??'',64);check((bool)preg_match('/^[a-f0-9]{64}$/',$seriesId),'Invalid short movie.');$key=relation_id($id,$seriesId);$had=rec('series_interest',$key);if($had)del('series_interest',$key);else put('series_interest',['id'=>$key,'series_id'=>$seriesId,'user_id'=>$id],$id,$seriesId);$interestCount=count(rows('series_interest',null,$seriesId));if(!$had&&$interestCount>=15){$first=null;foreach(rows('posts') as $candidate)if(($candidate['series_id']??'')===$seriesId&&($candidate['status']??'')==='published'){if($first===null||(int)$candidate['episode_number']>(int)$first['episode_number'])$first=$candidate;}if($first){$noticeKey=hash('sha256','series-next-episode:'.$seriesId);if(!rec('event_dedup',$noticeKey)){put('event_dedup',['id'=>$noticeKey],$first['author_id'],$seriesId);$next=(int)($first['episode_number']??0)+1;notification($first['author_id'],'episode_unlock','15 viewers want the next episode','Your audience reached 100%. Upload Episode '.$next.' now.','/upload?episode=1&series='.rawurlencode($first['series_title']??'').'&genre='.rawurlencode($first['series_genre']??'Horror').'&next='.$next,$first['id']);}}}return ['interested'=>!$had,'interest_count'=>$interestCount];
    case 'toggle_episode_interest':
      need_user();$post=visible_post((string)($p['p_post_id']??''));check(!empty($post['series_id'])&&$post['author_id']!==$id,'You cannot request your own episode.');$key=relation_id($id,$post['id']);$had=rec('episode_interest',$key);if($had)del('episode_interest',$key);else put('episode_interest',['id'=>$key,'post_id'=>$post['id'],'series_id'=>$post['series_id'],'user_id'=>$id],$id,$post['id']);$count=count(rows('episode_interest',null,$post['id']));$goal=15;$percent=min(100,(int)round(($count/$goal)*100));if(!$had&&$count>=$goal){$noticeKey=hash('sha256','episode-unlocked:'.$post['id']);if(!rec('event_dedup',$noticeKey)){put('event_dedup',['id'=>$noticeKey],$post['author_id'],$post['id']);$next=(int)($post['episode_number']??0)+1;notification($post['author_id'],'episode_unlock','Episode unlocked — upload the next one',$goal.' viewers unlocked Episode '.((int)$post['episode_number']).'. Upload Episode '.$next.' now.','/upload?episode=1&series='.rawurlencode($post['series_title']??'').'&genre='.rawurlencode($post['series_genre']??'Horror').'&next='.$next,$post['id']);}}return ['interested'=>!$had,'interest_count'=>$count,'interest_goal'=>$goal,'interest_percent'=>$percent];
    case 'admin_series_interest':
      staff(true);$seriesId=text($p['p_series_id']??'',64);$members=[];foreach(rows('series_interest',null,$seriesId) as $row){$u=rec('profiles',$row['user_id']);if($u)$members[]=array_intersect_key($u,array_flip(['id','username','display_name','avatar_path']));}return ['count'=>count($members),'members'=>$members];
    case 'list_post_fires':
      $post=(string)($p['p_post_id']??'');
      visible_post($post);
      $offset=max(0,(int)($p['p_offset']??0));
      $profiles=[];$seen=0;
      foreach(rows('engagements',null,$post) as $reaction){
        if($reaction['kind']!=='hot'||($id&&blocked($id,$reaction['user_id'])))continue;
        $profile=rec('profiles',$reaction['user_id']);
        if(!$profile||$profile['status']!=='active')continue;
        if($seen++<$offset)continue;
        $profiles[]=array_intersect_key($profile,array_flip(['id','username','display_name','avatar_path']));
        if(count($profiles)===31)break;
      }
      return ['profiles'=>array_slice($profiles,0,30),'has_more'=>count($profiles)>30];
    case 'toggle_engagement':
      need_user();$post=(string)($p['p_post_id']??'');$r=visible_post($post);$kind=enum_value($p['p_kind']??'',['hot','speak','viral']);check($r['author_id']!==$id,'You cannot react to your own post.');
      if($kind==='viral')check($r['viral_eligible'],'Viral happens automatically at 10 Fires and 10 Shares.');
      $key=hash('sha256',"$id:$post:$kind");$had=rec('engagements',$key);if($had)del('engagements',$key);else put('engagements',['id'=>$key,'user_id'=>$id,'post_id'=>$post,'kind'=>$kind],$id,$post);
      $r=visible_post($post);if(!$had)notification($r['author_id'],'engagement','New reaction',$actor['display_name'].' reacted to your post.','/post/'.$post,$post);
      if($r['is_viral']){$reward=(int)setting('rewards.viral_paise',0);$rewardId=hash('sha256','viral:'.$post);if($reward>0&&!rec('earnings',$rewardId))put('earnings',['id'=>$rewardId,'user_id'=>$r['author_id'],'type'=>'viral','post_id'=>$post,'amount_paise'=>$reward,'status'=>'pending','reference'=>'viral:'.$post,'note'=>null,'reviewed_at'=>null,'reviewed_by_username'=>null],$r['author_id'],$post);}
      return ['post_id'=>$post]+array_intersect_key($r,array_flip(['my_hot','my_speak','my_viral','hot_count','speak_count','viral_count','is_viral','viral_eligible','category','viral_at']));
    case 'list_comments':case 'add_comment':case 'delete_comment':case 'toggle_comment_fire':case 'update_comment':case 'pin_comment':return speak_route($name,$p);
    case 'toggle_follow':
      need_user();$other=(string)($p['p_user_id']??'');$u=rec('profiles',$other);check($u&&$u['status']==='active'&&$other!==$id&&!blocked($id,$other),'You cannot follow this user.');
      $key=relation_id($id,$other);$had=rec('follows',$key);if($had)del('follows',$key);else{put('follows',['id'=>$key],$id,$other);notification($other,'follow','New respect',$actor['display_name'].' is respecting you.','/profile/'.$actor['username']);}return ['following'=>!$had,'followers_count'=>count(rows('follows',null,$other))];
    case 'block_user':case 'unblock_user':
      need_user();$other=(string)($p['p_user_id']??'');check($id!==$other&&rec('profiles',$other)!==null,'Invalid user.');$key=relation_id($id,$other);
      if($name==='block_user'){put('blocks',['id'=>$key],$id,$other);del('follows',$key);del('follows',relation_id($other,$id));}else del('blocks',$key);return null;
    case 'my_blocks':need_user();return array_values(array_filter(array_map(function($r){$u=rec('profiles',$r['parent_id']??'');return $u?array_intersect_key($u,array_flip(['id','username','display_name','avatar_path']))+['blocked_at'=>$r['created_at']]:null;},array_map(fn($r)=>$r+['parent_id'=>q('SELECT parent_id FROM oj_records WHERE kind=? AND id=?',['blocks',$r['id']])->fetchColumn()],rows('blocks',$id)))));
    case 'toggle_bookmark':need_user();$post=(string)($p['p_post_id']??'');visible_post($post);$key=relation_id($id,$post);$had=rec('bookmarks',$key);if($had)del('bookmarks',$key);else put('bookmarks',['id'=>$key],$id,$post);return ['bookmarked'=>!$had,'bookmarks_count'=>count(rows('bookmarks',null,$post))];
    case 'create_report':
      need_user();$type=enum_value($p['p_target_type']??'',['post','comment','user','message']);$target=(string)($p['p_target_id']??'');$kind=['post'=>'posts','comment'=>'comments','user'=>'profiles','message'=>'messages'][$type];$r=rec($kind,$target);check($r!==null,'Item not found.',404);
      if($type==='post')visible_post($target);if($type==='message')conversation($r['conversation_id']);if($type==='comment')visible_post($r['post_id']);
      $reason=enum_value($p['p_reason']??'',['spam','harassment','illegal','copyright','misinformation','adult','violence','child_safety','other']);
      return put('reports',['reporter_id'=>$id,'reporter_username'=>$actor['username'],'reported_user_id'=>$r['author_id']??$r['user_id']??$r['sender_id']??$r['id'],'target_type'=>$type,'target_id'=>$target,'target_preview'=>mb_substr($r['caption']??$r['body']??$r['username']??'',0,200),'reason'=>$reason,'description'=>text($p['p_description']??'',2000),'status'=>'pending','admin_action'=>null,'admin_note'=>null,'reviewed_by_username'=>null,'reviewed_at'=>null],$id,$target)['id'];
    case 'join_one_chance_chat':
      need_user();$room=rec('conversations','one-chance-leaders');if(!$room)$room=put('conversations',['id'=>'one-chance-leaders','is_group'=>true,'name'=>'One Chance Leaders','a'=>null,'b'=>null,'last_message_at'=>now(),'last_message_preview'=>'Welcome to the One Chance community chat.']);return $room['id'];
    case 'get_or_create_conversation':
      need_user();$other=(string)($p['p_other']??'');$u=rec('profiles',$other);check($u&&$u['status']==='active'&&$other!==$id&&!blocked($id,$other),'Messaging is unavailable.');
      $pair=[$id,$other];sort($pair);$key=hash('sha256',implode(':',$pair));$c=rec('conversations',$key);if(!$c)$c=put('conversations',['id'=>$key,'a'=>$pair[0],'b'=>$pair[1],'last_message_at'=>now(),'last_message_preview'=>null]);return $c['id'];
    case 'get_conversation':$c=conversation((string)($p['p_conversation_id']??''));if(!empty($c['is_group']))return ['id'=>$c['id'],'is_group'=>true,'group_name'=>$c['name']??'One Chance Leaders','other'=>['id'=>'one-chance-leaders','username'=>'onechance_leaders','display_name'=>$c['name']??'One Chance Leaders','bio'=>'','phone'=>'','interests'=>'','avatar_path'=>null,'is_verified'=>true,'created_at'=>$c['created_at']??now(),'followers_count'=>0,'following_count'=>0,'posts_count'=>0,'is_me'=>false,'is_following'=>false,'follows_me'=>false,'blocked_by_me'=>false,'has_viral_badge'=>false,'is_premium'=>false,'premium_until'=>null],'can_message'=>true];$other=rec('profiles',$c['a']===$id?$c['b']:$c['a']);return ['id'=>$c['id'],'is_group'=>false,'other'=>public_profile($other),'can_message'=>!blocked($id,$other['id'])&&$other['status']==='active'];
    case 'list_conversations':
      need_user();$cs=[];foreach(rows('conversations') as $c){if(!empty($c['is_group'])){$cs[]=['id'=>$c['id'],'is_group'=>true,'other_id'=>'one-chance-leaders','other_username'=>'onechance_leaders','other_display_name'=>$c['name']??'One Chance Leaders','other_avatar_path'=>null,'other_verified'=>true,'last_message_at'=>$c['last_message_at'],'last_message_preview'=>$c['last_message_preview'],'unread_count'=>0,'is_blocked'=>false];continue;}if($c['a']!==$id&&$c['b']!==$id)continue;$u=rec('profiles',$c['a']===$id?$c['b']:$c['a']);if(!$u)continue;$cs[]=['id'=>$c['id'],'is_group'=>false,'other_id'=>$u['id'],'other_username'=>$u['username'],'other_display_name'=>$u['display_name'],'other_avatar_path'=>$u['avatar_path'],'other_verified'=>$u['is_verified'],'last_message_at'=>$c['last_message_at'],'last_message_preview'=>$c['last_message_preview'],'unread_count'=>count(array_filter(rows('messages',null,$c['id']),fn($m)=>$m['sender_id']!==$id&&$m['read_at']===null)),'is_blocked'=>blocked($id,$u['id'])];}usort($cs,fn($a,$b)=>strcmp($b['last_message_at'],$a['last_message_at']));return page($cs,$p);
    case 'send_message':
      $c=conversation((string)($p['p_conversation_id']??''));$other=!empty($c['is_group'])?null:($c['a']===$id?$c['b']:$c['a']);if($other!==null)check(!blocked($id,$other),'Messaging is unavailable.');$body=text($p['p_body']??'',2000);check($body!=='','Enter a message.');
      $m=put('messages',['conversation_id'=>$c['id'],'sender_id'=>$id,'body'=>$body,'read_at'=>null],$id,$c['id']);$c['last_message_at']=$m['created_at'];$c['last_message_preview']=mb_substr($body,0,120);put('conversations',$c);if($other!==null)notification($other,'message',$actor['display_name'],$body,'/messages/'.$c['id']);return $m;
    case 'mark_conversation_read':$c=conversation((string)($p['p_conversation_id']??''));if(!empty($c['is_group']))return null;foreach(rows('messages',null,$c['id']) as $m)if($m['sender_id']!==$id&&$m['read_at']===null){$m['read_at']=now();put('messages',$m,$m['sender_id'],$c['id']);}return null;
    case 'list_notifications':need_user();return page(before(array_values(array_filter(rows('notifications',$id),fn($n)=>empty($p['p_unread_only'])||$n['read_at']===null)),$p),$p);
    case 'mark_notifications_read':need_user();$count=0;foreach(rows('notifications',$id) as $r)if($r['read_at']===null&&(!isset($p['p_ids'])||in_array($r['id'],$p['p_ids'],true))){$r['read_at']=now();put('notifications',$r,$id);$count++;}return $count;
    case 'unread_counts':need_user();$messages=0;foreach(rows('conversations') as $c)if($c['a']===$id||$c['b']===$id)$messages+=count(array_filter(rows('messages',null,$c['id']),fn($m)=>$m['sender_id']!==$id&&$m['read_at']===null));return ['notifications'=>count(array_filter(rows('notifications',$id),fn($n)=>$n['read_at']===null)),'messages'=>$messages];
    case 'register_push_token':need_user();$token=text($p['p_token']??'',4096);check(strlen($token)>20,'Invalid push token.');put('push_tokens',['id'=>hash('sha256',$token),'token'=>$token,'platform'=>enum_value($p['p_platform']??'',['android','web']),'user_id'=>$id],$id);return null;
    case 'get_wallet':need_user();return wallet($id);
    case 'list_my_earnings':need_user();$es=array_values(array_filter(rows('earnings',$id),fn($r)=>empty($p['p_type'])||$r['type']===$p['p_type']));return page(array_map(fn($r)=>$r+['post'=>!empty($r['post_id'])?rec('posts',$r['post_id']):null],$es),$p);
    case 'earnings_series':need_user();return series(rows('earnings',$id),$p,false);
    case 'get_my_payout_detail':need_user();$r=rec('payout_details',$id);return $r?payout_public($r):null;
    case 'upsert_payout_detail':
      need_user();$method=enum_value($p['p_method']??'',['upi','bank']);$r=['id'=>$id,'user_id'=>$id,'method'=>$method,'account_holder_name'=>text($p['p_account_holder_name']??'',100)];
      if($method==='upi'){$v=text($p['p_upi_id']??'',100);check((bool)preg_match('/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9]{2,}$/',$v),'Enter a valid UPI ID.');$r['upi_id']=$v;$r['masked']=substr($v,0,2).'***@'.explode('@',$v)[1];}
      else{$v=text($p['p_account_number']??'',24);$ifsc=strtoupper(text($p['p_ifsc']??'',11));check((bool)preg_match('/^[0-9]{9,24}$/',$v)&&(bool)preg_match('/^[A-Z]{4}0[A-Z0-9]{6}$/',$ifsc)&&$r['account_holder_name']!=='','Enter valid bank details.');$r+=['account_number'=>$v,'ifsc'=>$ifsc,'bank_name'=>text($p['p_bank_name']??'',100),'masked'=>'•••• '.substr($v,-4)];}
      return payout_public(put('payout_details',$r,$id));
    case 'list_my_withdrawals':need_user();return page(array_map(fn($w)=>array_diff_key($w,array_flip(['payout_snapshot','idempotency_key','user_id','processed_by_username']))+['note'=>$w['admin_note']],rows('withdrawals',$id)),$p);
    case 'request_withdrawal':
      need_user();$key=text($p['p_idempotency_key']??'',100);check(strlen($key)>=16,'Invalid request key.');foreach(rows('withdrawals',$id) as $old)if($old['idempotency_key']===$key)return ['id'=>$old['id'],'status'=>$old['status'],'amount_paise'=>$old['amount_paise'],'replayed'=>true];
      check(withdrawal_task_access($id),'Withdrawals are available after an active OJASSS task is assigned or an administrator approves a personal bonus for you.');
      if(!withdrawal_schedule()['open'])fail(403,'WITHDRAWAL_CLOSED','Withdrawals are closed. Check the permitted hours and try again.');
      $amount=$p['p_amount_paise']??null;check(is_int($amount),'Enter a valid amount.');$w=wallet($id);check($amount>=$w['min_withdrawal_paise']&&$amount<=$w['max_withdrawal_paise'],'Amount is outside withdrawal limits.');check($amount<=$w['available_paise'],'Insufficient available balance.');$detail=rec('payout_details',$id);check($detail!==null,'Save payout details first.');
      $r=put('withdrawals',['user_id'=>$id,'amount_paise'=>$amount,'status'=>'requested','payout_method'=>$detail['method'],'payout_masked'=>$detail['masked'],'payout_snapshot'=>$detail,'idempotency_key'=>$key,'admin_note'=>null,'payment_reference'=>null,'processed_at'=>null,'processed_by_username'=>null,'paid_at'=>null],$id);withdrawal_event($r,null,'requested',null);return ['id'=>$r['id'],'status'=>$r['status'],'amount_paise'=>$amount,'replayed'=>false];
    case 'cancel_withdrawal':$r=owned('withdrawals',(string)($p['p_withdrawal_id']??''));check($r['status']==='requested','Only requested withdrawals can be cancelled.');$r['status']='cancelled';put('withdrawals',$r,$id);withdrawal_event($r,'requested','cancelled',null);return null;
    case 'submit_business_inquiry':
      $u=need_user();$r=['user_id'=>$id,'username'=>$u['username'],'type'=>enum_value($p['p_type']??'',['business_promotion','gst_consultant','investor','other']),'business_name'=>text($p['p_business_name']??'',150),'contact_name'=>text($p['p_contact_name']??'',100),'phone'=>text($p['p_phone']??'',30),'email'=>email_address($p['p_email']??''),'message'=>text($p['p_message']??'',3000),'status'=>'new','admin_note'=>null];return put('business_inquiries',$r,$id)['id'];
    case 'my_business_inquiries':need_user();return rows('business_inquiries',$id);
    case 'request_my_account_deletion':need_user();return deletion_request($id,text($p['p_reason']??'',2000),enum_value($p['p_source']??'web',['web','android','in_app']));
    default:fail(404,'NOT_FOUND','This operation is unavailable.');
    }
}
function conversation(string $id): array { $u=need_user();$c=rec('conversations',$id);if(!$c||(!empty($c['is_group'])?false:!in_array($u['id'],[$c['a'],$c['b']],true)))fail(404,'NOT_FOUND','Conversation not found.');return $c; }
function payout_public(array $r): array { return array_intersect_key($r,array_flip(['method','masked','account_holder_name','updated_at'])); }
function withdrawal_event(array $r,?string $from,string $to,?string $note): void { global $actor;put('withdrawal_events',['from_status'=>$from,'to_status'=>$to,'note'=>$note,'actor_username'=>$actor['username']??null],$actor['id']??null,$r['id']); }
function deletion_request(string $user,string $reason,string $source): string { $u=rec('profiles',$user);foreach(rows('deletion_requests',$user) as $r)if(in_array($r['status'],['pending','processing'],true))return $r['id'];$email=q('SELECT email FROM oj_credentials WHERE user_id=?',[$user])->fetchColumn();return put('deletion_requests',['user_id'=>$user,'username'=>$u['username'],'email'=>$email,'reason'=>$reason,'source'=>$source,'status'=>'pending','admin_note'=>null,'processed_at'=>null,'processed_by_username'=>null],$user)['id']; }
function series(array $records,array $p,bool $admin): array {
    $periods=min(365,max(1,(int)($p['p_periods']??30)));$unit=enum_value($p['p_bucket']??'day',['hour','day','week','month']);$step=['hour'=>3600,'day'=>86400,'week'=>604800,'month'=>2592000][$unit];
    $from=isset($p['p_from'])?strtotime($p['p_from']):time()-($periods-1)*$step;$to=isset($p['p_to'])?strtotime($p['p_to']):time();$out=[];
    for($t=$from;$t<=$to&&count($out)<400;$t+=$step){$items=array_filter($records,fn($r)=>strtotime($r['created_at'])>=$t&&strtotime($r['created_at'])<$t+$step);$bucket=gmdate('Y-m-d\TH:i:s\Z',$t);if($admin)$out[]=['bucket_start'=>$bucket,'value'=>count($items)];else{$sum=fn($s)=>array_sum(array_column(array_filter($items,fn($r)=>$r['status']===$s),'amount_paise'));$out[]=['bucket_start'=>$bucket,'approved_paise'=>$sum('approved'),'pending_paise'=>$sum('pending')];}}
    return $out;
}


