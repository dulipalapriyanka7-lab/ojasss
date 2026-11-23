<?php
declare(strict_types=1);
function apply_signup_referral(array $user,$raw):array {
 if(!empty($user['referred']))return $user;$code=strtoupper(text($raw??'',32));if($code==='')return $user;
 check((bool)preg_match('/^[A-Z0-9]{6,32}$/',$code),'Enter a valid referral code or leave it blank.');check(strtotime($user['created_at'])>=time()-604800,'Referral codes can be added within 7 days of joining.');$inviter=null;
 foreach(rows('profiles') as $profile)if(strtoupper(trim($profile['referral_code']??''))===$code){$inviter=$profile;break;}
 check($inviter!==null&&$inviter['status']==='active','Referral code was not found. Check it or leave it blank.');check($inviter['id']!==$user['id'],'You cannot use your own referral code.');
 $user['referred']=true;$user['referred_by']=$inviter['id'];$user['referred_at']=now();$amount=(int)setting('rewards.referral_paise',0);$key=hash('sha256','referral:'.$user['id']);
 if($amount>0&&!rec('earnings',$key))put('earnings',['id'=>$key,'user_id'=>$inviter['id'],'type'=>'referral','post_id'=>null,'amount_paise'=>$amount,'status'=>'pending','reference'=>'referral:'.$user['id'],'note'=>'New member joined with referral code','reviewed_at'=>null,'reviewed_by_username'=>null],$inviter['id'],$user['id']);
 return $user;
}
