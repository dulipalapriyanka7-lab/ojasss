<?php
declare(strict_types=1);
function ojasss_pg_config():array {
 global $config;$file=$config['private_dir'].'/ojasss-pg.json';if(!is_file($file))return ['gateway_url'=>'','merchant_id'=>'','webhook_secret'=>'','saved_at'=>null];
 return json_decode(file_get_contents($file),true,512,JSON_THROW_ON_ERROR);
}
function ojasss_pg_summary(array $data):array {
 $complete=!empty($data['gateway_url'])&&!empty($data['merchant_id'])&&!empty($data['webhook_secret']);
 return ['name'=>'OJASSS PG','provider'=>'youpi','status'=>$complete?'details_saved':'setup_pending','gateway_url'=>$data['gateway_url']??'','merchant_id'=>$data['merchant_id']??'','secret_saved'=>!empty($data['webhook_secret']),'saved_at'=>$data['saved_at']??null,'payments_active'=>false];
}
function ojasss_pg_admin(string $name,array $p):array {
 staff(true);$previous=ojasss_pg_config();if($name==='admin_ojasss_pg_status')return ojasss_pg_summary($previous);
 $url=rtrim(text($p['gateway_url']??'',500),'/');if($url!==''){$parts=parse_url($url);check(is_array($parts)&&($parts['scheme']??'')==='https'&&!isset($parts['user'],$parts['pass'])&&!isset($parts['query'])&&!isset($parts['fragment'])&&(!isset($parts['port'])||$parts['port']===443)&&isset($parts['host'])&&str_contains($parts['host'],'.')&&!filter_var($parts['host'],FILTER_VALIDATE_IP)&&filter_var($url,FILTER_VALIDATE_URL)!==false,'Enter the HTTPS address of your hosted YouPI gateway.');check(!isset($parts['user'])&&!isset($parts['pass']),'Gateway address cannot include credentials.');}
 $merchant=text($p['merchant_id']??'',200);check($merchant===''||(bool)preg_match('/^[a-zA-Z0-9_.-]{1,200}$/',$merchant),'Enter a valid merchant ID or public key.');
 $secret=$p['webhook_secret']??'';check(is_string($secret)&&strlen($secret)<=512,'Webhook secret is too long.');if($secret!=='')check(strlen($secret)>=32&&!preg_match('/[\x00-\x1f\x7f]/',$secret),'Use a webhook secret of at least 32 characters.');
 $data=['gateway_url'=>$url,'merchant_id'=>$merchant,'webhook_secret'=>$secret!==''?$secret:($previous['webhook_secret']??''),'saved_at'=>now()];global $config;$file=$config['private_dir'].'/ojasss-pg.json';$tmp=$file.'.'.bin2hex(random_bytes(6)).'.tmp';
 check(file_put_contents($tmp,json_encode($data,JSON_THROW_ON_ERROR),LOCK_EX)!==false,'Could not save gateway details.',503);chmod($tmp,0600);if(!rename($tmp,$file)){@unlink($tmp);fail(503,'GATEWAY_SAVE','Could not save gateway details.');}
 log_action('configure_ojasss_pg','setting','ojasss_pg',null,['provider'=>'youpi','secret_saved'=>!empty($data['webhook_secret']),'payments_active'=>false]);return ojasss_pg_summary($data);
}
