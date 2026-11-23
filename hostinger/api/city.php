<?php
declare(strict_types=1);
// My City: each member picks a city; videos and business products carry a city; admins see a per-city report.

function city_clean($v): ?string { $c=trim(preg_replace('/\s+/',' ',text($v??'',60))); return $c===''?null:mb_convert_case($c,MB_CASE_TITLE); }
function city_rpc(string $name,array $p): mixed {
 if($name==='city_set'){ $u=need_user(); $c=city_clean($p['p_city']??''); check($c!==null&&mb_strlen($c)>=2,'Choose your city.'); $u['city']=$c; put('profiles',$u,$u['id']); return ['city'=>$c]; }
 if($name==='city_report'){
  staff(true); $out=[];
  $row=function(?string $c)use(&$out){ $k=$c??'Not set'; return $out[$k]??=['city'=>$k,'users'=>0,'videos'=>0,'products'=>0,'orders'=>0,'order_amount'=>0]; };
  foreach(rows('profiles') as $u){ if(($u['status']??'')!=='active')continue; $k=$u['city']??null; $r=$row($k); $r['users']++; $out[$k??'Not set']=$r; }
  foreach(rows('posts') as $x){ $k=$x['city']??null; $r=$row($k); $r['videos']++; $out[$k??'Not set']=$r; }
  foreach(rows('biz_products') as $x){ $k=$x['city']??null; $r=$row($k); $r['products']++; $out[$k??'Not set']=$r; }
  foreach(rows('biz_orders') as $o){ if(!in_array($o['status'],['approved','delivered'],true))continue; $prod=rec('biz_products',$o['product_id']); $k=$prod['city']??null; $r=$row($k); $r['orders']++; $r['order_amount']+=(int)$o['amount']; $out[$k??'Not set']=$r; }
  $list=array_values($out); usort($list,fn($a,$b)=>($b['users']+$b['videos'])<=>($a['users']+$a['videos']));
  return $list;
 }
 fail(404,'NOT_FOUND','Unknown function.');
}
