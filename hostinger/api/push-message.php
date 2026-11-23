<?php
declare(strict_types=1);
function push_delivery_tokens(array $notification,array $tokens):array {
 return array_slice(array_values(array_filter($tokens,fn($token)=>($notification['delivery']??'all')!=='android'||($token['platform']??'')==='android')),0,20);
}
function push_message(array $notification,array $token,string $site):array {
 $path=$notification['link']??'';
 $link=$path&&preg_match('~^/[A-Za-z0-9/_?=&.%\-]*$~',$path)&&!str_starts_with($path,'//')?$path:'/notifications';
 $title=mb_substr($notification['title'],0,140);$body=mb_substr($notification['body'],0,500);
 $message=['token'=>$token['token'],'data'=>['notification_id'=>$notification['id'],'type'=>$notification['type'],'link'=>$link]];
 $image=$notification['image_url']??null;if($image&&str_starts_with($image,rtrim($site,'/').'/api/storage/v1/object/public/media/'))$message['data']['image_url']=$image;else $image=null;
 if(!empty($notification['category']))$message['data']['category']=$notification['category'];
 if(!empty($notification['category_label']))$message['data']['category_label']=$notification['category_label'];
 $displayBody=!empty($notification['category_label'])?$notification['category_label'].' · '.$body:$body;
 if(($token['platform']??'')==='android'){
  $message['data']+=['title'=>$title,'body'=>$body];$message['android']=['priority'=>'HIGH'];
  if(!empty($notification['campaign_id'])){$message['notification']=['title'=>$title,'body'=>$displayBody];$message['android']['notification']=['channel_id'=>'announcements','click_action'=>'OPEN_OJASSS_LINK','tag'=>$notification['id']];if($image)$message['android']['notification']['image']=$image;}
 }else{
  $message['notification']=['title'=>$title,'body'=>$displayBody];
  $message['webpush']=['fcm_options'=>['link'=>rtrim($site,'/').$link],'notification'=>['icon'=>rtrim($site,'/').'/icons/icon-192.png','tag'=>$notification['id']]];
  if($image)$message['webpush']['notification']['image']=$image;
 }
 return $message;
}
