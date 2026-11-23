<?php
declare(strict_types=1);
// Business & E-Commerce hub: account type, admin-approved business owners, admin-managed products and promotion tasks.

const BIZ_CATEGORIES=['gold_silver','electronics','fashion','food_kitchen','education','refurbished','real_estate','daily_needs'];

function biz_is_admin(?array $u): bool { return $u!==null&&($u['role']??'')==='admin'; }
function biz_live(): bool { return (bool)setting('business.live',false); }
function biz_me(array $u): array { return ['account_type'=>$u['account_type']??null,'business_status'=>$u['business_status']??null,'business_name'=>$u['business_name']??null,'business_category'=>$u['business_category']??null,'business_city'=>$u['business_city']??null]; }
function biz_profile(array $u): array { return public_profile($u)+['business_name'=>$u['business_name']??($u['display_name']??''),'business_category'=>$u['business_category']??null,'business_city'=>$u['business_city']??null]; }
function biz_product_out(array $p): array {
 $o=$p['owner_id']?rec('profiles',$p['owner_id']):null;
 return $p+['owner'=>$o?['id'=>$o['id'],'username'=>$o['username'],'business_name'=>$o['business_name']??$o['display_name']??'','avatar_path'=>$o['avatar_path']??null]:null];
}
function biz_products(?string $owner=null,bool $all=false): array {
 $r=array_values(array_filter(rows('biz_products'),fn($p)=>($all||(($p['status']??'active')==='active'&&!biz_expired($p)))&&($owner===null||($p['owner_id']??null)===$owner)));
 return array_map('biz_product_out',$r);
}
function biz_expired(array $p): bool { $e=$p['deal_ends_at']??null; return $e!==null&&$e!==''&&strtotime((string)$e)<=time(); }
function biz_order_out(array $o): array { $p=rec('biz_products',$o['product_id']); return $o+['product'=>$p?['id'=>$p['id'],'title'=>$p['title'],'image_url'=>$p['image_url']??'']:null]; }
/** Progress of a promotion task: distinct buyers (approved/delivered orders after the task started) who joined with the taker's referral code or bought through the task link. Pays the reward once when the target is met. */
function biz_task_eval(array $t): array {
 $prod=rec('biz_products',$t['product_id']);$need=max(1,(int)($prod['task_members']??$t['need']??1));$buyers=[];
 foreach(rows('biz_orders',null,$t['product_id']) as $o){
  if(!in_array($o['status'],['approved','delivered'],true)||$o['user_id']===$t['user_id']||($o['created_at']??'')<$t['created_at'])continue;
  $b=rec('profiles',$o['user_id']);
  if(($o['task_id']??'')===$t['id']||($b&&($b['referred_by']??'')===$t['user_id']))$buyers[$o['user_id']]=$b['username']??'';
 }
 $t['progress']=count($buyers);$t['need']=$need;$t['buyers']=array_values($buyers);
 $reward=(int)($prod['task_reward']??$t['reward']??0);$t['reward']=$reward;
 if($t['progress']>=$need&&($t['status']??'')!=='completed'&&$reward>0){
  $key=hash('sha256','biztask:'.$t['id']);
  if(!rec('earnings',$key))put('earnings',['id'=>$key,'user_id'=>$t['user_id'],'type'=>'business_task','post_id'=>null,'amount_paise'=>$reward*100,'status'=>'approved','reference'=>'biztask:'.$t['id'],'note'=>'Product promotion task: '.($prod['title']??''),'reviewed_at'=>now(),'reviewed_by_username'=>'system'],$t['user_id']);
  $t['status']='completed';$t['completed_at']=now();
 }
 put('biz_tasks',$t,$t['user_id'],$t['product_id']);
 return $t;
}
function biz_tasks_for_product(string $pid): void { foreach(rows('biz_tasks',null,$pid) as $t)if(($t['status']??'')!=='completed')biz_task_eval($t); }
function biz_approved(): array { return array_values(array_filter(rows('profiles'),fn($u)=>($u['account_type']??'')==='business'&&($u['business_status']??'')==='approved'&&($u['status']??'')==='active')); }
function biz_money($v): int { check(is_numeric($v)&&$v>=0&&$v<=100000000,'Enter a valid amount.'); return (int)round((float)$v); }

function business_rpc(string $name,array $p): mixed {
 global $actor;
 switch($name){
  case 'business_me': return biz_me(need_user());
  case 'business_set_account_type':
   $u=need_user();$t=enum_value($p['p_type']??'',['personal','business','realestate']);
   $u['account_type']=$t;
   if($t==='business'){
    $u['business_name']=text($p['p_business_name']??'',80);check($u['business_name']!=='','Enter your business name.');
    $u['business_category']=enum_value($p['p_category']??'',BIZ_CATEGORIES);
    $u['business_city']=text($p['p_city']??'',60);
    if(($u['business_status']??'')!=='approved')$u['business_status']='pending';
    $u['business_requested_at']=now();
   }
   put('profiles',$u,$u['id']);return biz_me($u);
  case 'business_hub':
   $admin=biz_is_admin($actor);$live=biz_live();
   if(!$live&&!$admin)return ['live'=>false,'can_view'=>false,'me'=>$actor?biz_me($actor):null];
   $mine=$actor&&($actor['business_status']??'')==='approved'?biz_products($actor['id'],true):[];
   return ['live'=>$live,'can_view'=>true,'is_admin'=>$admin,'me'=>$actor?biz_me($actor):null,'products'=>biz_products(),'profiles'=>array_map('biz_profile',array_slice(biz_approved(),0,30)),'my_products'=>$mine,'coins'=>$actor?coin_balance($actor['id']):0,'upi_id'=>setting('one_chance.upi_id',''),'my_tasks'=>$actor?array_map(fn($t)=>($t['status']??'')==='completed'?$t:biz_task_eval($t),rows('biz_tasks',$actor['id'])):[],'referral_code'=>$actor['referral_code']??null,'my_orders'=>$actor?array_map('biz_order_out',array_slice(array_reverse(rows('biz_orders',$actor['id'])),0,20)):[]];
  case 'business_admin_list':
   staff();$all=rows('profiles');
   $req=array_values(array_filter($all,fn($u)=>($u['account_type']??'')==='business'));
   usort($req,fn($a,$b)=>strcmp((string)($b['business_requested_at']??''),(string)($a['business_requested_at']??'')));
   return ['live'=>biz_live(),'requests'=>array_map(fn($u)=>biz_profile($u)+['business_status'=>$u['business_status']??'pending','requested_at'=>$u['business_requested_at']??null],$req),'products'=>biz_products(null,true)];
  case 'business_admin_review':
   staff(true);$u=rec('profiles',(string)($p['p_user_id']??''));check($u!==null,'User not found.',404);
   $u['business_status']=($p['p_approve']??false)?'approved':'rejected';$u['business_reviewed_at']=now();put('profiles',$u,$u['id']);return ['ok'=>true,'business_status'=>$u['business_status']];
  case 'business_admin_update':
   staff(true);$u=rec('profiles',(string)($p['p_user_id']??''));check($u!==null&&($u['account_type']??'')==='business','Business not found.',404);
   $u['business_name']=text($p['p_business_name']??'',80);check($u['business_name']!=='','Enter the business name.');
   $u['business_category']=enum_value($p['p_category']??'',BIZ_CATEGORIES);$u['business_city']=text($p['p_city']??'',60);
   put('profiles',$u,$u['id']);return ['ok'=>true];
  case 'business_admin_delete':
   staff(true);$u=rec('profiles',(string)($p['p_user_id']??''));check($u!==null,'User not found.',404);
   foreach(biz_products($u['id'],true) as $pr)del('biz_products',$pr['id']);
   foreach(['business_status','business_name','business_category','business_city','business_requested_at','business_reviewed_at'] as $k)unset($u[$k]);
   $u['account_type']='personal';put('profiles',$u,$u['id']);return ['ok'=>true];
  case 'business_admin_set_live':
   staff(true);$r=rec('settings','business.live')??['id'=>'business.live','key'=>'business.live','is_public'=>true];$r['value']=(bool)($p['p_live']??false);put('settings',$r);return ['live'=>$r['value']];
  case 'business_admin_save_product':
   staff();$v=$p['product']??[];check(is_array($v),'Invalid product.');
   $old=!empty($v['id'])?rec('biz_products',(string)$v['id']):null;
   $owner=(string)($v['owner_id']??'');$o=rec('profiles',$owner);
   check($o!==null&&($o['business_status']??'')==='approved','Assign the product to an approved business.');
   $ends=$v['deal_ends_at']??null;if($ends!==null&&$ends!==''){check(strtotime((string)$ends)!==false,'Invalid deal end time.');$ends=gmdate('Y-m-d\TH:i:s.v\Z',strtotime((string)$ends));}else $ends=null;
   $img=text($v['image_url']??'',500);check($img===''||preg_match('~^https://~',$img)===1,'Image link must start with https://');
   $row=($old??[])+['id'=>$v['id']??null];
   $row=array_merge($row,['title'=>text($v['title']??'',90),'image_url'=>$img,'category'=>enum_value($v['category']??'',BIZ_CATEGORIES),'price'=>biz_money($v['price']??0),'mrp'=>biz_money($v['mrp']??0),'owner_id'=>$owner,'deal_ends_at'=>$ends,'city'=>city_clean($v['city']??''),'task_reward'=>biz_money($v['task_reward']??0),'task_members'=>max(1,min(100,(int)($v['task_members']??5))),'status'=>enum_value($v['status']??'active',['active','hidden'])]);
   check($row['title']!=='','Enter a product name.');
   if(!$row['id'])unset($row['id']);
   return biz_product_out(put('biz_products',$row,$owner));
  case 'business_admin_delete_product':
   staff();del('biz_products',(string)($p['p_id']??''));return ['ok'=>true];
  case 'business_order_submit':
   $u=need_user();rate('biz-order:'.$u['id'],6,3600);
   $prod=rec('biz_products',text($p['p_product_id']??'',36));check($prod!==null&&($prod['status']??'active')==='active','This product is no longer available.',404);
   check(!biz_expired($prod),'This deal has ended.',410);
   $price=(int)$prod['price'];$coins=$p['p_coins']??0;check(is_int($coins)&&$coins>=0&&$coins<=$price,'Invalid coin amount.');
   $utr=null;if($coins<$price){$utr=strtoupper(text($p['p_utr']??'',40));check((bool)preg_match('/^[A-Z0-9]{8,30}$/',$utr),'Enter the 12-digit UPI reference (UTR) from your payment.');
   foreach(rows('biz_orders') as $x)check(($x['utr']??'')!==$utr,'This UTR was already submitted.');}
   $o=['user_id'=>$u['id'],'username'=>$u['username'],'product_id'=>$prod['id'],'title'=>$prod['title'],'amount'=>$price,'coins_used'=>$coins,'upi_amount'=>$price-$coins,'utr'=>$utr,
    'name'=>text($p['p_name']??'',80),'phone'=>text($p['p_phone']??'',20),'address'=>text($p['p_address']??'',300),'status'=>'pending','note'=>null,'task_id'=>text($p['p_task_id']??'',36)?:null];
   check($o['name']!==''&&preg_match('/^[0-9+ ]{10,15}$/',$o['phone'])===1&&$o['address']!=='','Enter your name, phone and delivery address.');
   $o=put('biz_orders',$o,$u['id'],$prod['id']);
   if($coins>0)coin_move($u['id'],-$coins,'business',$o['id'],'Paid for '.$prod['title']);
   return biz_order_out($o);
  case 'business_task_take':
   $u=need_user();$prod=rec('biz_products',text($p['p_product_id']??'',36));
   check($prod!==null&&($prod['status']??'active')==='active'&&!biz_expired($prod)&&(int)($prod['task_reward']??0)>0,'This task is not available.',404);
   check($prod['owner_id']!==$u['id'],'You cannot take a task on your own product.');
   foreach(rows('biz_tasks',$u['id'],$prod['id']) as $t)return biz_task_eval($t);
   return biz_task_eval(put('biz_tasks',['user_id'=>$u['id'],'username'=>$u['username'],'product_id'=>$prod['id'],'title'=>$prod['title'],'status'=>'active','need'=>(int)$prod['task_members'],'reward'=>(int)$prod['task_reward']],$u['id'],$prod['id']));
  case 'business_admin_tasks':
   staff();return array_map(fn($t)=>($t['status']??'')==='completed'?$t:biz_task_eval($t),array_reverse(rows('biz_tasks')));
  case 'business_admin_orders':
   staff();return array_map('biz_order_out',array_slice(array_reverse(rows('biz_orders')),0,100));
  case 'business_admin_order_update':
   staff();$o=rec('biz_orders',text($p['p_id']??'',36));check($o!==null,'Order not found.',404);check(!(($o['status']??'')==='rejected'&&(int)($o['coins_used']??0)>0),'This order was rejected and its coins were refunded.');
   $o['status']=enum_value($p['p_status']??'',['approved','rejected','delivered']);$o['note']=text($p['p_note']??'',200)?:null;
   if($o['status']==='rejected'&&(int)($o['coins_used']??0)>0)coin_move($o['user_id'],(int)$o['coins_used'],'refund',$o['id'],'Refund · order rejected');
   $o=put('biz_orders',$o,$o['user_id'],$o['product_id']);biz_tasks_for_product($o['product_id']);return biz_order_out($o);
 }
 fail(404,'NOT_FOUND','Unknown function.');
}
