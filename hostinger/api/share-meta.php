<?php
declare(strict_types=1);
function share_public_post(?array $post,?array $author):bool {
 return $post!==null&&$author!==null&&($post['status']??'')==='published'&&($post['visibility']??'public')==='public'&&($author['status']??'')==='active'&&!post_expired($post);
}
function share_metadata(?array $post,?array $author,string $site,string $path):array {
 $image=$site.'/icons/icon-512.png';$title='OJASSS — Short videos & posters';$description='Watch, create and discover videos on OJASSS.';$video=null;$type='website';
 if(in_array(parse_url($path,PHP_URL_PATH),['/register','/login'],true)){$title=parse_url($path,PHP_URL_PATH)==='/register'?'Create your OJASSS account':'Sign in to OJASSS';$description='Join OJASSS to share your talent, respect creators and discover videos you enjoy.';}
 if(share_public_post($post,$author)){
  $title=($author['display_name']?:'@'.$author['username']).' on OJASSS';$description=mb_substr(trim($post['caption']??'')?:'Watch this video on OJASSS.',0,180);$encode=fn($key)=>implode('/',array_map('rawurlencode',explode('/',$key)));
  $thumbnail=$post['kind']==='poster'?$post['media_path']:($post['thumbnail_path']??null);if($thumbnail)$image=$site.'/api/storage/v1/object/public/media/'.$encode($thumbnail);
  if($post['kind']==='video'){$type='video.other';$video=$site.'/api/storage/v1/object/public/media/'.$encode($post['media_path']);}
 }
 return ['title'=>$title,'description'=>$description,'url'=>$site.$path,'image'=>$image,'video'=>$video,'type'=>$type,'video_type'=>$video?($post['mime_type']??'video/mp4'):null,'width'=>$video?(int)($post['width']??0):0,'height'=>$video?(int)($post['height']??0):0];
}
function share_html(string $html,array $meta):string {
 $escape=fn($value)=>htmlspecialchars((string)$value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
 $html=preg_replace('~<title>.*?</title>~s','',$html);$html=preg_replace('~<meta\b[^>]*(?:property|name)=["\x27](?:og:[^"\x27]*|twitter:[^"\x27]*|al:[^"\x27]*|description)["\x27][^>]*>~i','',$html);$html=preg_replace('~<link\b[^>]*rel=["\x27]canonical["\x27][^>]*>~i','',$html);
 $tags='<title>'.$escape($meta['title']).'</title><meta name="description" content="'.$escape($meta['description']).'"><link rel="canonical" href="'.$escape($meta['url']).'">';
 $properties=['og:site_name'=>'OJASSS','og:title'=>$meta['title'],'og:description'=>$meta['description'],'og:type'=>$meta['type'],'og:url'=>$meta['url'],'og:image'=>$meta['image'],'og:image:secure_url'=>$meta['image'],'og:image:alt'=>$meta['title'],'al:android:url'=>$meta['url'],'al:android:package'=>'com.ojasss.app','al:android:app_name'=>'OJASSS','al:web:url'=>$meta['url'],'al:web:should_fallback'=>'true'];
 if(str_ends_with($meta['image'],'/icons/icon-512.png'))$properties+=['og:image:width'=>512,'og:image:height'=>512,'og:image:type'=>'image/png'];
 if($meta['video']){$properties+=['og:video'=>$meta['video'],'og:video:secure_url'=>$meta['video'],'og:video:type'=>$meta['video_type']];if($meta['width']&&$meta['height'])$properties+=['og:video:width'=>$meta['width'],'og:video:height'=>$meta['height']];}
 foreach($properties as $key=>$value)$tags.='<meta property="'.$key.'" content="'.$escape($value).'">';foreach(['twitter:card'=>'summary_large_image','twitter:title'=>$meta['title'],'twitter:description'=>$meta['description'],'twitter:image'=>$meta['image']] as $key=>$value)$tags.='<meta name="'.$key.'" content="'.$escape($value).'">';
 return str_replace('</head>',$tags.'</head>',$html);
}
