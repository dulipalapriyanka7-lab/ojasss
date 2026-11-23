<?php
declare(strict_types=1);
// The One Chance week follows the leaderboard week (admin setting; default Sunday 00:00 IST,
// so each week closes on Saturday at 11:59 PM).
function one_chance_week(?int $instant=null): array {
 $cfg=setting('competition.config',competition_defaults());
 $zone=new DateTimeZone($cfg['timezone']??'Asia/Kolkata');
 $date=(new DateTimeImmutable('@'.($instant??time())))->setTimezone($zone);
 $day=(int)($cfg['start_day']??7);$hour=(int)($cfg['start_hour']??0);
 $start=$date->modify('-'.(((int)$date->format('N')-$day+7)%7).' days')->setTime($hour,0);
 if($start>$date)$start=$start->modify('-1 week');
 return [$start->getTimestamp(),$start->modify('+1 week')->getTimestamp()];
}
function one_chance_cycle_ends_at(): int {
 return one_chance_week()[1];
}
function one_chance_is_current(array $post): bool {
 $viralAt=strtotime((string)($post['viral_at']??''));
 [$start,$end]=one_chance_week();
 return $viralAt!==false && $viralAt>=$start && $viralAt<$end;
}
function one_chance_video_eligible(array $post): bool {
 return one_chance_category_allowed($post)&&category_available('one_chance')
  &&one_chance_is_current($post)&&($post['kind']??'')==='video'&&($post['status']??'')==='published'
  &&($post['visibility']??'public')==='public'&&!post_expired($post);
}
// Voting rule: a video enters One Chance with votes LOCKED. A verified Rs 10 payment opens
// votes at once; otherwise they open free 48 hours after the video went Viral. Once open,
// votes stay open until the weekly cycle ends.
function one_chance_voting_opens_at(array $post): ?int {
 if(!one_chance_video_eligible($post)||!one_chance_category_allowed($post,true))return null;
 // Each approved payment opens voting for an admin-set window (default 12 hours).
 $paid=rec('one_chance_paid_entries',$post['id']);
 if($paid&&strtotime($paid['ends_at']??'')>time())return strtotime($paid['opens_at']??$paid['created_at']??'now')?:0;
 // a creator with an active paid One Chance membership also skips the 48-hour vote lock
 if(!empty($post['author_id'])&&one_chance_membership((string)$post['author_id'])!==null)return 0;
 // Votes open only after an admin-approved payment; unpaid videos stay locked all week.
 return one_chance_cycle_ends_at();
}
function one_chance_vote_window_hours(): int { return max(1,min(168,(int)setting('one_chance.vote_window_hours',12))); }
function one_chance_voting_until(array $post): ?int {
 $opens=one_chance_voting_opens_at($post);if($opens===null)return null;
 $end=one_chance_cycle_ends_at();
 if($opens<=time()){$paid=rec('one_chance_paid_entries',$post['id']);if($paid&&strtotime($paid['ends_at']??'')>time())return min($end,strtotime($paid['ends_at']));}
 return $end;
}
/** True while votes are still locked, i.e. the creator can pay to open them now. */
function one_chance_lock_hours(): int { return max(1,min(168,(int)setting('one_chance.lock_hours',48))); }
/** Loop: votes stay locked 48 h after going Viral, and 48 h again after every paid 12 h window. Payment is accepted only after that lock. */
function one_chance_unlock_available_at(array $post): int {
 $paid=rec('one_chance_paid_entries',$post['id']);
 $base=$paid?strtotime($paid['ends_at']):strtotime((string)($post['viral_at']??''));
 return ($base?:time())+one_chance_lock_hours()*3600;
}
function one_chance_video_can_renew(array $post): bool {
 $opens=one_chance_voting_opens_at($post);
 // Payment is accepted any time votes are locked, unless a paid window is already scheduled.
 $paid=rec('one_chance_paid_entries',$post['id']);
 if($paid&&strtotime($paid['ends_at']??'')>time())return false;
 return $opens!==null&&$opens>time()&&one_chance_cycle_ends_at()>time();
}
function one_chance_week_votes(string $postId): array {
 [$start,$end]=one_chance_week();
 return array_values(array_filter(rows('one_chance_votes',null,$postId),static function(array $vote)use($start,$end): bool {
  $at=strtotime($vote['created_at']);
  return $at>=$start && $at<$end;
 }));
}
function one_chance_reset_to_viral_wait(): void {
 // A one-time product migration requested by the owner: erase the old paid
 // placement/vote state without touching any original posts or payment history.
 if(rec('system','one_chance_viral_wait_reset_v1'))return;
 foreach(['one_chance_votes','leaderboard_results','one_chance_memberships'] as $kind){
  foreach(rows($kind) as $row)del($kind,$row['id']);
 }
 put('system',['id'=>'one_chance_viral_wait_reset_v1','applied_at'=>now()]);
}
function one_chance_membership(string $user): ?array {
 $m=rec('one_chance_memberships',$user);
 if(!$m||($m['payment_verified']??false)!==true||strtotime($m['starts_at'])>time())return null;
 // A reservation never survives the leaderboard reset, even if its original package
 // duration crosses into the next weekly cycle.
 [, $placementEnd]=one_chance_week(strtotime($m['starts_at']));
 $effectiveEnd=min(strtotime($m['ends_at']),$placementEnd);
 if($effectiveEnd<=time())return null;
 $m['ends_at']=gmdate('Y-m-d\\TH:i:s\\Z',$effectiveEnd);
 return $m;
}
function one_chance_default_packages(): array {
 // A viral video has exactly two paths to One Chance: the 48-hour free wait,
 // or this single verified ₹10 fast-entry plan. There are no paid rankings.
 return [['id'=>'viral-fast-entry','name'=>'Voting Renewal','price_paise'=>(int)setting('one_chance.entry_paise',1000),'duration_days'=>2,'placement'=>'featured','position'=>0,'description'=>'Open voting on this video for 12 hours after payment verification.','active'=>true,'sort_order'=>10]];
}
function one_chance_packages(bool $activeOnly=true): array {
 // Deliberately ignore legacy multi-position package settings. Payment history
 // is retained, but future entry is always the single ₹10 fast-entry plan.
 return one_chance_default_packages();
}
function one_chance_package(string $id,bool $activeOnly=true): ?array {foreach(one_chance_packages($activeOnly) as $item)if($item['id']===$id)return $item;return null;}
function one_chance_validate_package(array $input, ?array $old=null): array {
 $id=$old['id']??text($input['id']??'',40);if($id==='')$id='pkg-'.bin2hex(random_bytes(5));
 check((bool)preg_match('/^[a-z0-9-]{3,40}$/',$id),'Package ID may use lowercase letters, numbers and hyphens.');
 $name=text($input['name']??'',60);$description=text($input['description']??'',220);$price=$input['price_paise']??null;$days=$input['duration_days']??null;$order=$input['sort_order']??100;
 check($name!==''&&$description!=='','Enter a package name and description.');
 check(is_int($price)&&$price>=1000&&$price<=1000000,'Package price must be at least ₹10.');
 check(is_int($days)&&$days>=1&&$days<=90,'Package duration must be between 1 and 90 days.');
 check(is_int($order)&&$order>=0&&$order<=9999,'Enter a valid display order.');
 $position=$input['position']??null;check(is_int($position)&&$position>=1&&$position<=99,'Choose a leaderboard position from Top 1 to Top 99.');
 return ['id'=>$id,'name'=>$name,'price_paise'=>$price,'duration_days'=>$days,'placement'=>'top','position'=>$position,'description'=>$description,'active'=>($input['active']??true)===true,'sort_order'=>$order];
}
function one_chance_eligible(string $user): bool {
 foreach(rows('posts',$user) as $post)if(one_chance_video_can_renew($post))return true;
 return false;
}
function one_chance_occupied_positions(): array { return []; }
function one_chance_request_card(array $r,bool $admin=false): array {
 $card=array_intersect_key($r,array_flip(['id','user_id','post_id','created_at','status','amount_paise','duration_days','upi_id','receipt_path','utr','submitted_at','reviewed_at','reason','starts_at','ends_at','package_id','package_name','placement','position']));
 if($admin){$u=rec('profiles',$r['user_id']);$card['username']=$u['username']??'Unknown';$card['display_name']=$u['display_name']??'';}return $card;
}
function one_chance_rpc(string $name,array $p): array {
 $u=need_user();$id=$u['id'];
 $postId=text($p['p_post_id']??'',36);
 if(in_array($name,['one_chance_status','one_chance_request'],true)){
  $requests=array_values(array_filter(rows('one_chance_requests',$id),fn($r)=>($r['post_id']??'')===$postId));
  $post=$postId!==''?owned('posts',$postId):null;
  $votingUntil=$post?one_chance_voting_until($post):null;
  $eligible=$post!==null&&one_chance_video_can_renew($post);
  if($name==='one_chance_status')return ['eligible'=>$eligible,'voting_until'=>$votingUntil?gmdate(DATE_ATOM,$votingUntil):null,'membership'=>null,'occupied_positions'=>[],'upi_id'=>setting('one_chance.upi_id','kasturivamsikrishn@ybl'),'packages'=>one_chance_packages(),'coins'=>coin_balance($id),'requests'=>array_map('one_chance_request_card',$requests)];
 }
 if($name==='one_chance_cancel'){
  $r=owned('one_chance_requests',(string)($p['p_request_id']??''));check($r['status']==='awaiting_payment','Only an unpaid payment request can be cancelled.');$r['status']='cancelled';$r['reason']='Cancelled by member before payment.';put('one_chance_requests',$r,$id);return one_chance_request_card($r);
 }
 if($name==='one_chance_request'){
  check($eligible,'This video is no longer eligible for One Chance entry.');
  foreach($requests as $r)if(in_array($r['status'],['awaiting_payment','pending_review'],true))return one_chance_request_card($r);
  rate('one-chance-request:'.$id,40,86400);
  $package=one_chance_package(text($p['p_package_id']??'',40));check($package!==null,'Choose an available promotion package.');
  $r=put('one_chance_requests',($post?['post_id'=>$postId]:[])+['user_id'=>$id,'status'=>'awaiting_payment','amount_paise'=>$package['price_paise'],'duration_days'=>$package['duration_days'],'package_id'=>$package['id'],'package_name'=>$package['name'],'placement'=>$package['placement'],'position'=>$package['position'],'upi_id'=>setting('one_chance.upi_id','kasturivamsikrishn@ybl'),'receipt_path'=>null,'utr'=>null,'reason'=>null],$id);return one_chance_request_card($r);
 }
 $r=owned('one_chance_requests',(string)($p['p_request_id']??''));check($r['status']==='awaiting_payment','This payment has already been submitted.');
 if($name==='one_chance_pay_coins'){$c=intdiv((int)$r['amount_paise'],100);check($c>0,'This package cannot be paid with coins.');coin_move($id,-$c,'one_chance',$r['id'],'One Chance · '.($r['package_name']??'package'));
  $r['paid_coins']=$c;$r['utr']='COINS-'.strtoupper(substr($r['id'],0,12));$r['status']='pending_review';$r['submitted_at']=now();put('one_chance_requests',$r,$id);return one_chance_request_card($r);}
 $path=text($p['p_receipt_path']??'',200);$o=rec('objects',hash('sha256','receipts/'.$path));check($o&&$o['user_id']===$id&&$o['bucket']==='receipts'&&str_starts_with($o['mime_type'],'image/'),'Upload your payment screenshot first.');
 $utr=text($p['p_utr']??'',40);check((bool)preg_match('/^[a-zA-Z0-9-]{8,40}$/',$utr),'Enter the UPI transaction reference (UTR).');
 $r['receipt_path']=$path;$r['utr']=$utr;$r['status']='pending_review';$r['submitted_at']=now();put('one_chance_requests',$r,$id);return one_chance_request_card($r);
}
function one_chance_admin(string $name,array $p): array {
 $admin=staff(true);
 if($name==='admin_one_chance_packages')return one_chance_packages(false);
 if($name==='admin_save_one_chance_package'){
  $id=text($p['p_id']??'',40);$items=one_chance_packages(false);$existing=null;
  foreach($items as $index=>$item)if($item['id']===$id){$existing=$item;unset($items[$index]);break;}
  $package=one_chance_validate_package(['id'=>$id,'name'=>$p['p_name']??'','description'=>$p['p_description']??'','price_paise'=>$p['p_price_paise']??null,'duration_days'=>$p['p_duration_days']??null,'placement'=>$p['p_placement']??'','position'=>$p['p_position']??null,'active'=>$p['p_active']??true,'sort_order'=>$p['p_sort_order']??100],$existing);
  foreach($items as $item)check($item['id']!==$package['id'],'Package ID already exists.');
  foreach($items as $item)check((int)($item['position']??0)!==$package['position'],'A package already exists for Top '.$package['position'].'. Edit that package instead.');
  $items[]=$package;usort($items,fn($a,$b)=>$a['sort_order']<=>$b['sort_order']);put('settings',['id'=>'one_chance.packages','key'=>'one_chance.packages','value'=>array_values($items),'description'=>'One Chance promotion packages','is_public'=>false,'is_dangerous'=>false,'updated_by'=>$admin['id']]);
  log_action($name,'one_chance_package',$package['id'],$existing,$package,'');return $package;
 }
 if($name==='admin_one_chance_requests')return array_map(fn($r)=>one_chance_request_card($r,true),page(rows('one_chance_requests'),$p));
 $r=rec('one_chance_requests',(string)($p['p_request_id']??''));check($r!==null,'Payment request was not found.',404);check($r['status']==='pending_review','Only pending payments can be reviewed.');$old=$r;
 $decision=enum_value($p['p_decision']??'',['approve','reject']);$reason=text($p['p_reason']??'',500);
 if(!empty($r['paid_coins'])){$p['p_verified']=true;$p['p_verified_utr']=$r['utr'];}
 if($decision==='approve'){
  check(($p['p_verified']??false)===true,'Verify the actual bank or UPI payment before approving.');
  $postId=$r['post_id']??'';
  if($postId!==''){
   $post=rec('posts',$postId);
   check($post&&$post['author_id']===$r['user_id']&&one_chance_video_can_renew($post),'This video is no longer eligible for voting renewal.');
  }else check(one_chance_eligible($r['user_id']),'The member no longer has a published One Chance post.');
  $utr=strtoupper(text($p['p_verified_utr']??'',40));check((bool)preg_match('/^[A-Z0-9-]{8,40}$/',$utr),'Enter the verified bank transaction reference.');$key=hash('sha256',$utr);check(!rec('one_chance_utr',$key),'This transaction has already been used.');
  $current=$postId===''?one_chance_membership($r['user_id']):null;$start=$current['starts_at']??now();$opensTs=time();$end=gmdate('Y-m-d\TH:i:s\Z',$postId!==''?min(one_chance_cycle_ends_at(),$opensTs+one_chance_vote_window_hours()*3600):max(time(),$current?strtotime($current['ends_at']):0)+((int)$r['duration_days']*86400));
  put('one_chance_utr',['id'=>$key,'request_id'=>$r['id']],$r['user_id'],$r['id']);
  if($postId!=='')put('one_chance_paid_entries',['id'=>$postId,'request_id'=>$r['id'],'opens_at'=>date(DATE_ATOM,$opensTs),'ends_at'=>$end,'window_hours'=>one_chance_vote_window_hours()],$r['user_id'],$postId);
  else put('one_chance_memberships',['id'=>$r['user_id'],'user_id'=>$r['user_id'],'starts_at'=>$start,'ends_at'=>$end,'payment_verified'=>true,'request_id'=>$r['id'],'amount_paise'=>$r['amount_paise'],'duration_days'=>$r['duration_days'],'package_id'=>$r['package_id']??'viral-fast-entry','package_name'=>$r['package_name']??'Viral Fast Entry','placement'=>'featured','position'=>0],$r['user_id']);
  $r['status']='approved';$r['verified_utr']=$utr;$r['starts_at']=$start;$r['ends_at']=$end;
 }else{check($reason!=='','Enter a reason for rejecting the payment.');$r['status']='rejected';if(!empty($r['paid_coins']))coin_move($r['user_id'],(int)$r['paid_coins'],'refund',$r['id'],'Refund · One Chance rejected');}
 $r['reason']=$reason;$r['reviewed_at']=now();$r['reviewed_by']=$admin['id'];put('one_chance_requests',$r,$r['user_id']);log_action($name,'one_chance_payment',$r['id'],$old,$r,$reason);
 $video=$r['post_id']??'';
 $approvedText=$video!==''?'Payment approved. Voting on your One Chance video is open now for '.one_chance_vote_window_hours().' hours.':($r['package_name']??'One Chance promotion').' is active for '.$r['duration_days'].' days.';
 notification($r['user_id'],'system',$decision==='approve'?'One Chance promotion activated':'Payment needs attention',$decision==='approve'?$approvedText:$reason,$video!==''?'/post/'.$video:'/one-chance');
 return one_chance_request_card($r,true);
}
