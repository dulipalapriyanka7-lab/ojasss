<?php
declare(strict_types=1);
function filtered(array $items,array $p,array $fields=['status','type','kind','category','role','reason','target_type','user_id','action']): array {
    return array_values(array_filter($items,function($r)use($p,$fields){foreach($fields as $f)if(isset($p['p_'.$f])&&$p['p_'.$f]!==''&&($r[$f]??null)!==$p['p_'.$f])return false;if(!empty($p['p_q'])&&!str_contains(mb_strtolower(json_encode($r)),mb_strtolower((string)$p['p_q'])))return false;return true;}));
}
function safety_overview(): array {
    $rs=rows('reports');$us=rows('profiles');$ps=rows('posts');$by=[];$queue=[];$offenders=[];
    foreach($rs as $r){if(in_array($r['status'],['pending','under_review'],true)){$by[$r['reason']]=($by[$r['reason']]??0)+1;if(in_array($r['reason'],['child_safety','illegal'],true)){$u=rec('profiles',$r['reported_user_id']);$queue[]=$r+['reported_username'=>$u['username']??null];}}if(strtotime($r['created_at'])>time()-2592000)$offenders[$r['reported_user_id']]=($offenders[$r['reported_user_id']]??0)+1;}
    $repeat=[];foreach($offenders as $id=>$n)if($n>=3){$u=rec('profiles',$id);if($u)$repeat[]=array_intersect_key($u,array_flip(['id','username','status']))+['reports'=>$n];}
    return ['open_by_reason'=>(object)$by,'child_safety_queue'=>$queue,'flagged_posts'=>count(array_filter($ps,fn($r)=>$r['status']==='flagged')),'removed_posts_30d'=>count(array_filter($ps,fn($r)=>$r['status']==='removed'&&strtotime($r['updated_at'])>time()-2592000)),'suspended_users'=>count(array_filter($us,fn($r)=>$r['status']==='suspended')),'banned_users'=>count(array_filter($us,fn($r)=>$r['status']==='banned')),'repeat_offenders'=>$repeat];
}
function admin_rpc(string $name,array $p): mixed {
    if($name==='admin_series_interest'){
      staff(true);$seriesId=text($p['p_series_id']??'',64);$members=[];foreach(rows('series_interest',null,$seriesId) as $row){$u=rec('profiles',$row['user_id']);if($u)$members[]=array_intersect_key($u,array_flip(['id','username','display_name','avatar_path']));}return ['count'=>count($members),'members'=>$members];
    }
    if(in_array($name,['admin_ojasss_pg_status','admin_ojasss_pg_save'],true))return ojasss_pg_admin($name,$p);
    if(in_array($name,['admin_one_chance_requests','admin_one_chance_review','admin_one_chance_packages','admin_save_one_chance_package'],true))return one_chance_admin($name,$p);
    global $actor;staff();$id=$actor['id'];$adminOnly=['admin_delete_media','admin_list_earnings','admin_review_earning','admin_reverse_earning','admin_grant_bonus','admin_one_chance_move_to_week','admin_list_withdrawals','admin_process_withdrawal','admin_withdrawal_events','admin_update_setting','admin_process_deletion_request','admin_list_logs'];
    if(in_array($name,$adminOnly,true))staff(true);
    switch($name) {
    case 'admin_dashboard':
      $us=rows('profiles');$ps=rows('posts');$es=rows('earnings');$ws=rows('withdrawals');$rs=rows('reports');$cs=rows('complaints');$from=$p['p_from']??'1970';$to=$p['p_to']??now();$range=fn($x)=>$x['created_at']>=$from&&$x['created_at']<=$to;
      $count=fn($a,$f)=>count(array_filter($a,$f));$sum=fn($a,$f)=>array_sum(array_column(array_filter($a,$f),'amount_paise'));
      $out=['total_users'=>count($us),'active_users'=>$count($us,fn($x)=>($x['last_active_at']??'')>=$from),'new_users'=>$count($us,$range),'suspended_users'=>$count($us,fn($x)=>$x['status']!=='active'),'videos'=>$count($ps,fn($x)=>$x['kind']==='video'&&$x['status']!=='deleted'),'posters'=>$count($ps,fn($x)=>$x['kind']==='poster'&&$x['status']!=='deleted'),'new_posts'=>$count($ps,$range),'pending_review'=>$count($ps,fn($x)=>$x['status']==='pending_review'),'complaints_open'=>$count($cs,fn($x)=>!in_array($x['status'],['resolved','rejected'],true)),'complaints_total'=>count($cs),'reports_open'=>$count($rs,fn($x)=>in_array($x['status'],['pending','under_review'],true)),'child_safety_open'=>$count($rs,fn($x)=>$x['reason']==='child_safety'&&in_array($x['status'],['pending','under_review'],true)),'pending_withdrawals'=>$count($ws,fn($x)=>in_array($x['status'],['requested','approved'],true)),'pending_withdrawals_paise'=>$sum($ws,fn($x)=>in_array($x['status'],['requested','approved'],true)),'pending_earnings'=>$count($es,fn($x)=>$x['status']==='pending'),'total_earnings_paise'=>$sum($es,fn($x)=>$x['status']==='approved'),'range_earnings_paise'=>$sum($es,$range),'paid_out_paise'=>$sum($ws,fn($x)=>$x['status']==='paid'),'engagements'=>$count(rows('engagements'),$range),'viral_posts'=>count(array_filter(array_map(fn($r)=>post_card($r,true),$ps),fn($r)=>$r&&$r['is_viral'])),'cta_clicks'=>array_sum(array_column($ps,'cta_clicks')),'deletion_requests_open'=>$count(rows('deletion_requests'),fn($x)=>in_array($x['status'],['pending','processing'],true))];
      if($actor['role']!=='admin')foreach(['pending_withdrawals_paise','total_earnings_paise','range_earnings_paise','paid_out_paise'] as $k)$out[$k]=0;return $out;
    case 'admin_timeseries':
      $metric=enum_value($p['p_metric']??'',['users','active_users','posts','videos','posters','engagements','viral','earnings_paise','withdrawals_paise','cta_clicks','reports','complaints']);
      $kind=['users'=>'profiles','active_users'=>'profiles','posts'=>'posts','videos'=>'posts','posters'=>'posts','engagements'=>'engagements','viral'=>'posts','earnings_paise'=>'earnings','withdrawals_paise'=>'withdrawals','cta_clicks'=>'cta_events','reports'=>'reports','complaints'=>'complaints'][$metric];
      if(in_array($metric,['earnings_paise','withdrawals_paise'],true))staff(true);$items=rows($kind);
      if(in_array($metric,['videos','posters'],true))$items=array_values(array_filter($items,fn($r)=>$r['kind']===($metric==='videos'?'video':'poster')));
      if($metric==='active_users')$items=array_map(fn($r)=>array_replace($r,['created_at'=>$r['last_active_at']]),$items);
      if($metric==='viral')$items=array_values(array_filter($items,fn($r)=>post_card($r,true)['is_viral']??false));
      if($metric==='withdrawals_paise')$items=array_values(array_filter($items,fn($r)=>$r['status']==='paid'));
      if($metric==='earnings_paise')$items=array_values(array_filter($items,fn($r)=>in_array($r['status'],['pending','approved'],true)));
      $out=series($items,$p,true);if(str_ends_with($metric,'_paise')){$unit=$p['p_bucket']??'day';$step=['hour'=>3600,'day'=>86400,'week'=>604800,'month'=>2592000][$unit];foreach($out as &$point){$t=strtotime($point['bucket_start']);$point['value']=array_sum(array_column(array_filter($items,fn($r)=>strtotime($r['created_at'])>=$t&&strtotime($r['created_at'])<$t+$step),'amount_paise'));}}return $out;
    case 'admin_breakdowns':
      $out=['top_viral'=>[]];foreach([['posts','category','posts_by_category'],['reports','reason','reports_by_reason'],['complaints','status','complaints_by_status'],['earnings','type','earnings_by_type'],['withdrawals','status','withdrawals_by_status'],['cta_events','cta_type','cta_by_type']] as [$kind,$field,$key]){$counts=[];if(in_array($kind,['earnings','withdrawals'],true)&&$actor['role']!=='admin'){$out[$key]=(object)[];continue;}foreach(rows($kind) as $r){if($r['created_at']<($p['p_from']??'1970')||$r['created_at']>($p['p_to']??now()))continue;$k=$r[$field]??'other';$counts[$k]=($counts[$k]??0)+($kind==='earnings'?$r['amount_paise']:1);}$out[$key]=(object)$counts;}
      foreach(rows('posts') as $post){$r=post_card($post,true);if($r&&$r['is_viral'])$out['top_viral'][]=$r+['username'=>$r['author_username']];}usort($out['top_viral'],fn($a,$b)=>$b['viral_count']<=>$a['viral_count']);$out['top_viral']=array_slice($out['top_viral'],0,10);return $out;
    case 'admin_list_users':$rankMap=[];foreach(competition_ranked(competition_current()) as $entry)$rankMap[$entry['user_id']]=$entry['rank'];$out=[];foreach(rows('profiles') as $u){$email=q('SELECT email FROM oj_credentials WHERE user_id=?',[$u['id']])->fetchColumn();$wallet=$actor['role']==='admin'?wallet($u['id']):null;$viralCount=0;$oneChanceCount=0;foreach(rows('posts',$u['id']) as $raw){$card=post_card($raw,true);if(!$card||$card['kind']!=='video')continue;if($card['is_viral'])$viralCount++;if($card['one_chance_ready']??false)$oneChanceCount++;}$out[]=array_replace(public_profile($u),['competition_rank'=>$rankMap[$u['id']]??null,'viral_videos'=>$viralCount,'one_chance_videos'=>$oneChanceCount,'role'=>$u['role'],'status'=>$u['status'],'email'=>$actor['role']==='admin'?$email:null,'last_active_at'=>$u['last_active_at'],'open_reports'=>count(array_filter(rows('reports'),fn($r)=>$r['reported_user_id']===$u['id']&&in_array($r['status'],['pending','under_review'],true))),'approved_paise'=>$wallet['lifetime_paise']??0,'paid_paise'=>$wallet['withdrawn_paise']??0,'available_paise'=>$wallet['available_paise']??0]);}return page(filtered($out,$p),$p,true);
    case 'admin_user_detail':$u=rec('profiles',(string)($p['p_user_id']??''));check($u!==null,'User not found.',404);$wallet=$actor['role']==='admin'?wallet($u['id']):null;$withdrawals=$actor['role']==='admin'?rows('withdrawals',$u['id']):[];$paid=array_values(array_filter($withdrawals,fn($w)=>($w['status']??'')==='paid'));usort($paid,fn($a,$b)=>strcmp($b['paid_at']??$b['created_at'],$a['paid_at']??$a['created_at']));$requested=array_values(array_filter($withdrawals,fn($w)=>in_array($w['status']??'',['requested','approved'],true)));return ['profile'=>me_profile($u),'wallet'=>$wallet,'finance'=>$actor['role']==='admin'?['paid_withdrawals'=>count($paid),'open_withdrawals'=>count($requested),'last_paid_at'=>$paid[0]['paid_at']??null,'last_paid_paise'=>$paid[0]['amount_paise']??0]:null,'recent_posts'=>array_slice(rows('posts',$u['id']),0,10),'reports_against'=>array_values(array_filter(rows('reports'),fn($r)=>$r['reported_user_id']===$u['id'])),'admin_history'=>array_values(array_filter(rows('admin_logs'),fn($r)=>$r['target_type']==='user'&&$r['target_id']===$u['id']))];
    case 'admin_manage_user':
      $target=(string)($p['p_user_id']??'');$u=rec('profiles',$target);check($u!==null&&$id!==$target,'This action is not allowed.');$old=$u;$action=enum_value($p['p_action']??'',['suspend','ban','restore','unsuspend','unban','verify','unverify','set_role']);$reason=text($p['p_reason']??'',1000);
      if($u['role']==='admin'||$action==='set_role')staff(true);if($actor['role']==='moderator'&&$u['role']!=='user')fail(403,'FORBIDDEN','Only an administrator can manage staff.');
      if(in_array($action,['suspend','ban'],true))check($reason!=='','A reason is required.');
      if($action==='set_role'){$role=enum_value($p['p_role']??'',['user','moderator','admin']);if($u['role']==='admin'&&$role!=='admin')check(count(array_filter(rows('profiles'),fn($x)=>$x['role']==='admin'&&$x['status']==='active'))>1,'The last administrator cannot be removed.');$u['role']=$role;}
      elseif(in_array($action,['verify','unverify'],true))$u['is_verified']=$action==='verify';else{$u['status']=['suspend'=>'suspended','ban'=>'banned','restore'=>'active','unsuspend'=>'active','unban'=>'active'][$action];$u['status_reason']=$reason?:null;q('DELETE FROM oj_sessions WHERE user_id=?',[$target]);}
      put('profiles',$u,$target);log_action($name,'user',$target,$old,$u,$reason);notification($target,'moderation','Account updated','Your account status was updated.','/settings');return $u;
    case 'admin_list_posts':$out=[];foreach(rows('posts') as $post){$r=post_card($post,true);if(!$r)continue;$out[]=$r+['moderation_reason'=>$post['moderation_reason']??null,'open_reports'=>count(array_filter(rows('reports',null,$post['id']),fn($x)=>in_array($x['status'],['pending','under_review'],true)))];}return page(filtered($out,$p),$p,true);
    case 'admin_delete_media':
      $post=rec('posts',(string)($p['p_post_id']??''));check($post!==null,'Media not found.',404);
      check(($p['p_confirm']??false)===true&&($p['p_confirmation']??'')==='DELETE','Type DELETE and confirm permanent deletion.');
      $reason=text($p['p_reason']??'',500);check(mb_strlen($reason)>=3,'Enter a reason of at least 3 characters.');
      rate('admin-media-delete:'.$id,20,60);
      permanently_delete_post($post);
      log_action($name,'post',$post['id'],$post,['id'=>$post['id'],'status'=>'permanently_deleted','kind'=>$post['kind']],$reason);
      return ['id'=>$post['id'],'deleted'=>true];
    case 'admin_moderate_post':
      $r=rec('posts',(string)($p['p_post_id']??''));check($r!==null,'Post not found.',404);$old=$r;$action=enum_value($p['p_action']??'',['approve','remove','restore','flag']);check($r['status']!=='deleted','Deleted posts cannot be restored.');$r['status']=['approve'=>'published','remove'=>'removed','restore'=>'published','flag'=>'flagged'][$action];$r['moderation_reason']=text($p['p_reason']??'',1000);put('posts',$r,$r['author_id']);log_action($name,'post',$r['id'],$old,$r,$r['moderation_reason']);if($old['status']!=='published'&&$r['status']==='published')queue_new_video_alerts($r);notification($r['author_id'],'moderation','Post reviewed','Your post is now '.$r['status'].'.','/post/'.$r['id'],$r['id']);return $r;
    case 'admin_list_complaints':$out=[];foreach(rows('complaints') as $c){$post=rec('posts',$c['id']);if(!$post)continue;$u=rec('profiles',$post['author_id']);$out[]=$c+['post_id'=>$post['id'],'caption'=>$post['caption'],'author_username'=>$u['username']??'deleted','post_status'=>$post['status']];}return page(filtered($out,$p,['status','forward_status']),$p,true);
    case 'admin_complaint_detail':$post=rec('posts',(string)($p['p_post_id']??''));check($post!==null,'Post not found.',404);$c=rec('complaints',$post['id']);check($c!==null,'Complaint not found.',404);return ['post'=>post_card($post,true),'complaint'=>$c,'author'=>public_profile(rec('profiles',$post['author_id'])),'notes'=>rows('complaint_notes',null,$post['id']),'authority'=>rec('authorities',$c['authority_id']??''),'history'=>array_values(array_filter(rows('admin_logs'),fn($r)=>$r['target_type']==='complaint'&&$r['target_id']===$post['id']))];
    case 'admin_update_complaint':
      $post=(string)($p['p_post_id']??'');$c=rec('complaints',$post);check($c!==null,'Complaint not found.',404);$old=$c;$action=enum_value($p['p_action']??'',['under_review','resolve','reject','reopen','set_authority','record_response','mark_forwarded']);
      if($action==='set_authority'){$a=rec('authorities',(string)($p['p_authority_id']??''));check($a!==null&&$a['is_active'],'Choose an active authority.');$c['authority_id']=$a['id'];$c['authority_name']=$a['name'];}
      elseif($action==='mark_forwarded'){$c['forward_status']='forwarded';$c['forwarded_at']=now();$c['status']='forwarded';}
      elseif($action==='record_response'){$c['authority_response']=text($p['p_response']??'',4000);check($c['authority_response']!=='','Enter the response.');$c['authority_responded_at']=now();}else $c['status']=['under_review'=>'under_review','resolve'=>'resolved','reject'=>'rejected','reopen'=>'submitted'][$action];
      put('complaints',$c,$c['user_id'],$post);log_action($name,'complaint',$post,$old,$c,text($p['p_note']??'',1000));return $c;
    case 'admin_add_complaint_note':$post=(string)($p['p_post_id']??'');check(rec('complaints',$post)!==null,'Complaint not found.',404);$note=text($p['p_note']??'',4000);check($note!=='','Enter a note.');put('complaint_notes',['note'=>$note,'admin_username'=>$actor['username'],'author_username'=>$actor['username']],$id,$post);log_action($name,'complaint',$post,null,['note'=>$note]);return null;
    case 'admin_list_authorities':return rows('authorities');
    case 'admin_upsert_authority':
      staff(true);$target=$p['p_id']??uid();$old=rec('authorities',$target);$r=['id'=>$target,'name'=>text($p['p_name']??'',150),'department'=>text($p['p_department']??'',150),'jurisdiction'=>text($p['p_jurisdiction']??'',150),'email'=>email_address($p['p_email']??''),'is_active'=>(bool)($p['p_is_active']??true)];check($r['name']!=='','Enter a name.');put('authorities',$r);log_action($name,'authority',$target,$old,$r);return $target;
    case 'admin_list_reports':$out=[];foreach(rows('reports') as $r){$u=rec('profiles',$r['reported_user_id']);$out[]=$r+['reported_username'=>$u['username']??null];}return page(filtered($out,$p),$p,true);
    case 'admin_review_report':
      $r=rec('reports',(string)($p['p_report_id']??''));check($r!==null,'Report not found.',404);$old=$r;$action=enum_value($p['p_action']??'',['dismiss','resolve','remove_content','suspend_user','ban_user','escalate','actioned','dismissed','reopen','under_review']);$r['admin_note']=text($p['p_note']??'',2000);$r['admin_action']=$action;$r['status']=in_array($action,['dismiss','dismissed'],true)?'rejected':($action==='reopen'?'pending':($action==='under_review'?'under_review':'resolved'));$r['reviewed_at']=now();$r['reviewed_by_username']=$actor['username'];
      if($action==='remove_content'){if($r['target_type']==='post')admin_rpc('admin_moderate_post',['p_post_id'=>$r['target_id'],'p_action'=>'remove','p_reason'=>$r['admin_note']]);elseif($r['target_type']==='comment')del('comments',$r['target_id']);}
      if(in_array($action,['suspend_user','ban_user'],true))admin_rpc('admin_manage_user',['p_user_id'=>$r['reported_user_id'],'p_action'=>$action==='ban_user'?'ban':'suspend','p_reason'=>$r['admin_note']]);
      put('reports',$r,$r['reporter_id'],$r['target_id']);log_action($name,'report',$r['id'],$old,$r,$r['admin_note']);return $r;
    case 'admin_safety_overview':return safety_overview();
    case 'admin_list_earnings':$out=[];foreach(rows('earnings') as $e){$u=rec('profiles',$e['user_id']);$post=!empty($e['post_id'])?rec('posts',$e['post_id']):null;$out[]=$e+['username'=>$u['username']??null,'post_caption'=>$post['caption']??null,'user_open_reports'=>count(array_filter(rows('reports'),fn($r)=>$r['reported_user_id']===$e['user_id']&&in_array($r['status'],['pending','under_review'],true)))];}return page(filtered($out,$p),$p,true);
    case 'admin_review_earning':case 'admin_reverse_earning':
      $r=rec('earnings',(string)($p['p_earning_id']??''));check($r!==null,'Earning not found.',404);$old=$r;
      if($name==='admin_reverse_earning'){check($r['status']==='approved','Only approved earnings can be reversed.');check(wallet($r['user_id'])['available_paise']>=$r['amount_paise'],'Funds have already been reserved or withdrawn.');$r['status']='reversed';}else{check($r['status']==='pending','This earning has already been reviewed.');$r['status']=!empty($p['p_approve'])?'approved':'rejected';}
      $r['note']=text($p['p_reason']??'',1000);$r['reviewed_at']=now();$r['reviewed_by_username']=$actor['username'];put('earnings',$r,$r['user_id'],$r['post_id']??$r['competition_id']??null);log_action($name,'earning',$r['id'],$old,$r,$r['note']);notification($r['user_id'],'reward','Reward updated','Your reward is '.$r['status'].'.','/earnings');return $r;
    case 'admin_competition_prize_weeks':
      staff(true);
      return array_map(
        fn($snapshot)=>['id'=>$snapshot['id'],'end'=>$snapshot['competition']['end']],
        competition_prize_weeks(12)
      );
    case 'admin_one_chance_move_to_week':
      // Re-enter an already-viral video into the current One Chance week. Only viral, published,
      // public videos qualify; votes, vote locks and the video itself are left exactly as they are.
      $post=rec('posts',text($p['p_post_id']??'',36));
      check($post!==null,'Video not found.',404);
      check(($post['kind']??'')==='video'&&($post['status']??'')==='published'&&($post['visibility']??'public')==='public','Only published public videos can enter One Chance.');
      check(!empty($post['viral_at']),'This video is not viral, so it cannot enter One Chance.');
      check(one_chance_category_allowed($post,true),'This category is not part of One Chance.');
      check(!one_chance_is_current($post),'This video is already in this week\'s One Chance.');
      $reason=text($p['p_reason']??'',500);check($reason!=='','Enter a reason.');
      $old=$post;$post['viral_at']=now();$post['viral_requalified_from']=$old['viral_at'];
      put('posts',$post,$post['author_id']);
      log_action($name,'post',$post['id'],['viral_at'=>$old['viral_at']],['viral_at'=>$post['viral_at']],$reason);
      return ['post_id'=>$post['id'],'viral_at'=>$post['viral_at']];
    case 'admin_grant_bonus':
      $target=(string)($p['p_user_id']??'');$amount=$p['p_amount_paise']??null;$reason=text($p['p_reason']??'',1000);
      $profile=rec('profiles',$target);
      check($profile!==null&&is_int($amount)&&$amount>0&&$amount<=100000000&&$reason!=='','Enter a user, valid amount and reason.');
      $competitionId=text($p['p_competition_id']??'',40)?:null;
      if($competitionId!==null){
        $snapshot=rec('leaderboard_snapshots',$competitionId);
        check($snapshot!==null,'Select a finalized leaderboard week.');
        check(($profile['status']??'')==='active'&&in_array($target,array_column($snapshot['entries'],'user_id'),true),'Select an active creator who qualified that week.');
        foreach(rows('earnings',$target,$competitionId) as $existing){
          check(($existing['competition_id']??null)!==$competitionId||$existing['status']!=='approved','This creator already has an approved prize for that week.');
        }
      }
      $earning=['user_id'=>$target,'type'=>'bonus','post_id'=>null,'amount_paise'=>$amount,'status'=>'approved','reference'=>'bonus:'.uid(),'note'=>$reason,'reviewed_at'=>now(),'reviewed_by_username'=>$actor['username']];
      if($competitionId!==null)$earning['competition_id']=$competitionId;
      $r=put('earnings',$earning,$target,$competitionId);
      log_action($name,'earning',$r['id'],null,$r,$reason);
      notification($target,'reward',$competitionId?'Weekly prize credited':'Bonus awarded',$competitionId?'Your weekly leaderboard prize has been added to your wallet.':'A bonus has been added to your wallet.','/earnings');
      return $r['id'];
    case 'admin_list_withdrawals':$out=[];foreach(rows('withdrawals') as $w){$u=rec('profiles',$w['user_id']);$email=q('SELECT email FROM oj_credentials WHERE user_id=?',[$w['user_id']])->fetchColumn();$out[]=$w+['username'=>$u['username']??null,'email'=>$email,'available_paise'=>wallet($w['user_id'])['available_paise']];}return page(filtered($out,$p),$p,true);
    case 'admin_process_withdrawal':
      $r=rec('withdrawals',(string)($p['p_withdrawal_id']??''));check($r!==null,'Withdrawal not found.',404);$old=$r;$action=enum_value($p['p_action']??'',['approve','reject','mark_paid']);
      if($action==='approve')check($r['status']==='requested','Only requested withdrawals can be approved.');elseif($action==='reject')check(in_array($r['status'],['requested','approved'],true),'This withdrawal cannot be rejected.');else check($r['status']==='approved','Approve the withdrawal first.');
      $r['admin_note']=text($p['p_note']??'',1000);$r['payment_reference']=text($p['p_payment_reference']??'',200)?:null;if($action==='mark_paid')check($r['payment_reference']!==null,'A payment reference is required.');
      $r['status']=['approve'=>'approved','reject'=>'rejected','mark_paid'=>'paid'][$action];$r['processed_at']=now();$r['processed_by_username']=$actor['username'];if($action==='mark_paid')$r['paid_at']=now();put('withdrawals',$r,$r['user_id']);withdrawal_event($r,$old['status'],$r['status'],$r['admin_note']);log_action($name,'withdrawal',$r['id'],$old,$r,$r['admin_note']);notification($r['user_id'],'withdrawal','Withdrawal updated','Your withdrawal is '.$r['status'].'.','/withdraw');return $r;
    case 'admin_withdrawal_events':return rows('withdrawal_events',null,(string)($p['p_withdrawal_id']??''));
    case 'admin_list_settings':ensure_viral_entry_settings();return rows('settings');
    case 'admin_update_setting':
      $key=(string)($p['p_key']??'');$r=rec('settings',$key);check($r!==null,'Unknown setting.');$old=$r;$value=$p['p_value']??null;
      if(in_array($key,['engagement.hot_threshold','engagement.share_threshold'],true))check(is_int($value)&&$value>=10,'Viral requires at least 10 Hots and 10 Shares.');
      if($key==='one_chance.lock_hours')check(is_int($value)&&$value>=1&&$value<=168,'Lock time must be between 1 and 168 hours.');
      if($key==='one_chance.vote_window_hours')check(is_int($value)&&$value>=1&&$value<=168,'Voting window must be between 1 and 168 hours.');
      if($key==='one_chance.wait_hours')check(is_int($value)&&$value>=1&&$value<=720,'Wait must be between 1 and 720 hours.');
      if($key==='one_chance.entry_paise')check(is_int($value)&&$value>=100,'Entry amount must be at least ₹1.');
      if($key==='one_chance.upi_id'){$value=text($value,100);check((bool)preg_match('/^[a-zA-Z0-9._-]{2,80}@[a-zA-Z0-9.-]{2,30}$/',$value),'Enter a valid UPI ID.');}else if($key==='one_chance.category_access')validate_one_chance_category_access($value);else if($key==='categories.config')validate_category_config($value);else if($key==='home.controls')validate_home_controls($value);else if(str_starts_with($key,'layout.'))validate_layout_order($key,$value);else if(is_bool($r['value']))check(is_bool($value),'Choose true or false.');else{check(is_int($value)&&$value>=0&&$value<=100000000,'Enter a valid whole number.');if(str_ends_with($key,'threshold'))check($value>=1&&$value<=1000000,'Threshold is outside supported limits.');if($key==='withdrawals.min_paise')check($value>=100&&$value<=setting('withdrawals.max_paise',5000000),'Minimum is outside withdrawal limits.');if($key==='withdrawals.max_paise')check($value>=setting('withdrawals.min_paise',10000),'Maximum must be at least the minimum.');if(str_starts_with($key,'uploads.'))check($value>0&&$value<=($key==='uploads.max_video_seconds'?600:100),'Upload limit is outside supported limits.');}
      if($r['is_dangerous'])check(!empty($p['p_confirm'])&&trim((string)($p['p_reason']??''))!=='','Confirm this change and enter a reason.');$r['value']=$value;$r['updated_by']=$id;put('settings',$r);log_action($name,'setting',$key,$old,$r,text($p['p_reason']??'',1000));return $r;
    case 'admin_list_announcements':return rows('announcements');
    case 'admin_upsert_announcement':
      $target=$p['p_id']??uid();$old=rec('announcements',$target);$r=['id'=>$target,'title'=>text($p['p_title']??'',150),'message'=>text($p['p_message']??'',3000),'image_url'=>$p['p_image_url']??null,'cta_label'=>isset($p['p_cta_label'])?text($p['p_cta_label'],60):null,'cta_url'=>$p['p_cta_url']??null,'starts_at'=>$p['p_starts_at']??now(),'ends_at'=>$p['p_ends_at']??null,'is_active'=>(bool)($p['p_is_active']??true)];check($r['title']!==''&&$r['message']!=='','Enter title and message.');foreach(['image_url','cta_url'] as $k)if($r[$k])check(str_starts_with($r[$k],'/')&&!str_starts_with($r[$k],'//')||filter_var($r[$k],FILTER_VALIDATE_URL)&&str_starts_with($r[$k],'https://'),'Use an HTTPS URL or a relative path.');check(strtotime($r['starts_at'])!==false&&(!$r['ends_at']||strtotime($r['ends_at'])>strtotime($r['starts_at'])),'Invalid announcement dates.');put('announcements',$r);log_action($name,'announcement',$target,$old,$r);
      if(!empty($p['p_notify'])&&$r['is_active'])foreach(rows('profiles') as $u)if($u['status']==='active')notification($u['id'],'announcement',$r['title'],$r['message'],$r['cta_url']&&str_starts_with($r['cta_url'],'/')?$r['cta_url']:'/notifications');return $target;
    case 'admin_list_deletion_requests':return page(filtered(rows('deletion_requests'),$p),$p,true);
    case 'admin_process_deletion_request':
      $r=rec('deletion_requests',(string)($p['p_request_id']??''));check($r!==null,'Request not found.',404);$old=$r;$action=enum_value($p['p_action']??'',['processing','complete','reject']);check(in_array($r['status'],['pending','processing'],true),'Request is already closed.');
      if($action==='complete'){
        check($r['user_id']!==$id,'You cannot delete your own account here.');$u=rec('profiles',$r['user_id']);check($u!==null&&$u['role']!=='admin','Demote this administrator before deletion.');check(wallet($u['id'])['in_process_paise']===0,'Resolve outstanding withdrawals first.');
        foreach(['posts','comments','messages','notifications','push_tokens','payout_details','blocks','follows','bookmarks','engagements','objects'] as $kind)foreach(rows($kind,$u['id']) as $item){if($kind==='objects'&&!empty($item['disk_path'])&&is_file($item['disk_path']))unlink($item['disk_path']);del($kind,$item['id']);}
        q('DELETE FROM oj_sessions WHERE user_id=?',[$u['id']]);q('DELETE FROM oj_credentials WHERE user_id=?',[$u['id']]);del('profiles',$u['id']);$r['status']='completed';
      }else $r['status']=$action==='processing'?'processing':'rejected';$r['admin_note']=text($p['p_note']??'',1000);$r['processed_at']=now();$r['processed_by_username']=$actor['username'];put('deletion_requests',$r,$r['user_id']);log_action($name,'deletion_request',$r['id'],$old,$r,$r['admin_note']);return $r;
    case 'admin_list_inquiries':return page(filtered(rows('business_inquiries'),$p),$p,true);
    case 'admin_update_inquiry':$r=rec('business_inquiries',(string)($p['p_id']??''));check($r!==null,'Inquiry not found.',404);$old=$r;$r['status']=enum_value($p['p_status']??'',['new','contacted','in_progress','closed','resolved','rejected']);$r['admin_note']=text($p['p_note']??'',2000);put('business_inquiries',$r,$r['user_id']);log_action($name,'inquiry',$r['id'],$old,$r,$r['admin_note']);return null;
    case 'admin_list_logs':return page(filtered(rows('admin_logs'),$p),$p,true);
    default:fail(404,'NOT_FOUND','Admin operation not found.');
    }
}
