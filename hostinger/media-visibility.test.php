<?php
// The fast streaming path must enforce the same visibility as the feed.
$mediaOwner=fixture('media_owner');$mediaViewer=fixture('media_viewer');
$mediaPost=put('posts',['author_id'=>$mediaOwner['id'],'kind'=>'video','media_path'=>'unused.mp4','thumbnail_path'=>null,'category'=>'entertainment','visibility'=>'public','status'=>'published','shares_count'=>0],$mediaOwner['id']);
$actor=null;ok(readable_post_media($mediaPost),'public media readable anonymously');
$privateMedia=$mediaPost;$privateMedia['visibility']='private';ok(!readable_post_media($privateMedia),'private media hidden anonymously');
$followersMedia=$mediaPost;$followersMedia['visibility']='followers';ok(!readable_post_media($followersMedia),'followers media hidden anonymously');
$actor=$mediaViewer;ok(!readable_post_media($followersMedia),'nonfollowers cannot stream followers media');
put('follows',['user_id'=>$mediaViewer['id'],'target_id'=>$mediaOwner['id']],$mediaViewer['id'],$mediaOwner['id']);
ok(readable_post_media($followersMedia),'followers can stream followers media');ok(!readable_post_media($privateMedia),'followers cannot stream private media');
$actor=$mediaOwner;ok(readable_post_media($privateMedia),'owner can stream private media');
$draftMedia=$mediaPost;$draftMedia['status']='pending_review';ok(readable_post_media($draftMedia),'owner can preview pending media');
$actor=$mediaViewer;ok(!readable_post_media($draftMedia),'pending media hidden from other viewers');
$deletedMedia=$mediaPost;$deletedMedia['status']='deleted';ok(!readable_post_media($deletedMedia),'deleted media cannot stream');
$expiredMedia=$mediaPost;$expiredMedia['category']='news';$expiredMedia['created_at']=gmdate(DATE_ATOM,time()-49*3600);ok(!readable_post_media($expiredMedia),'expired news cannot stream');
put('blocks',['user_id'=>$mediaViewer['id'],'target_id'=>$mediaOwner['id']],$mediaViewer['id'],$mediaOwner['id']);ok(!readable_post_media($mediaPost),'blocked media cannot stream');
$actor=null;$mediaOwner['status']='suspended';put('profiles',$mediaOwner,$mediaOwner['id']);ok(!readable_post_media($mediaPost),'inactive creator media cannot stream');
$orphanMedia=$mediaPost;$orphanMedia['author_id']=uid();ok(!readable_post_media($orphanMedia),'missing creator media cannot stream');
