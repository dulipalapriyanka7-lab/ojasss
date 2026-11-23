<?php
$actor=$alice;
$profile=rpc_route('update_profile',['p_address'=>'Vijayawada, Andhra Pradesh','p_bio'=>'My story','p_phone'=>'+91 9876543210']);
ok($profile['address']==='Vijayawada, Andhra Pradesh'&&$profile['bio']==='My story'&&$profile['phone']==='+91 9876543210','setup profile fields persist');
ok(!array_key_exists('address',public_profile(rec('profiles',$alice['id']))),'address stays private');
$child=new_profile(uid(),'New member');$actor=$child;$profile=rpc_route('complete_onboarding',['p_username'=>'new_member','p_display_name'=>'New member','p_phone'=>'+91 9988776655','p_address'=>'My home','p_bio'=>'A new creator','p_country'=>'IN']);
ok($profile['onboarded']&&$profile['address']==='My home'&&$profile['phone']==='+91 9988776655'&&$profile['bio']==='A new creator','first profile setup saves all fields');
$entry=['label'=>'Fresh entertainment','description'=>'Stories and fun','enabled'=>false,'deleted'=>false];
denied(fn()=>rpc_route('admin_update_setting',['p_key'=>'categories.config','p_value'=>['entertainment'=>$entry]]),403,'members cannot change category controls');
$actor=$mod;denied(fn()=>rpc_route('admin_update_setting',['p_key'=>'categories.config','p_value'=>['entertainment'=>$entry]]),403,'moderators cannot change category controls');
$actor=$admin;$prior=rec('settings','categories.config');
try{
 denied(fn()=>rpc_route('admin_update_setting',['p_key'=>'categories.config','p_value'=>['unknown'=>$entry]]),422,'unknown category rejected');
 denied(fn()=>rpc_route('admin_update_setting',['p_key'=>'categories.config','p_value'=>['news'=>array_replace($entry,['enabled'=>'yes'])]]),422,'non boolean category toggle rejected');
 $all=[];foreach(layout_orders()['layout.category_order'] as $id)$all[$id]=$entry;
 denied(fn()=>rpc_route('admin_update_setting',['p_key'=>'categories.config','p_value'=>$all]),422,'cannot disable every upload category');
 rpc_route('admin_update_setting',['p_key'=>'categories.config','p_value'=>['entertainment'=>$entry]]);
 ok(rpc_route('public_settings',[])['categories.config']['entertainment']['label']==='Fresh entertainment','category names published to clients');
 $actor=$alice;rpc_route('save_category_preferences',['p_selected'=>[],'p_show_all'=>true]);
 ok(count(array_filter(rpc_route('feed',[]),fn($p)=>$p['source_category']==='entertainment'))===0,'disabled category excluded from main feed');
 $request=$videoRequest;$request['category']='entertainment';$request['contentOrigin']='new_content';denied(fn()=>function_route('create-post',$request),422,'disabled category cannot receive uploads');
 denied(fn()=>rpc_route('save_category_preferences',['p_selected'=>['entertainment'],'p_show_all'=>false]),422,'disabled category cannot be selected alone');
 $actor=$admin;$entry['deleted']=true;rpc_route('admin_update_setting',['p_key'=>'categories.config','p_value'=>['entertainment'=>$entry]]);
 ok(!category_available('entertainment')&&rec('posts',$viralPost['id'])!==null,'deleting a category preserves posts');
 $entry['deleted']=false;$entry['enabled']=true;rpc_route('admin_update_setting',['p_key'=>'categories.config','p_value'=>['entertainment'=>$entry]]);ok(category_available('entertainment'),'deleted category can be restored');
}finally{put('settings',$prior);}
$actor=$alice;
$raw=[];for($i=0;$i<10;$i++){$copy=$viralPost;$copy['id']=uid();$copy['viral_at']=now();$copy['category']='entertainment';$copy['status']='published';$copy['visibility']='public';$copy['created_at']=now();$raw[]=put('posts',$copy,$alice['id']);}
$a=random_feed_order($raw,'first-seed');$b=random_feed_order($raw,'second-seed');
ok(array_column($a,'id')===array_column(random_feed_order(array_reverse($raw),'first-seed'),'id'),'random ordering stable regardless of source order');
ok(array_column($a,'id')!==array_column($b,'id'),'different seed varies feed order');
foreach([null,'one_chance'] as $category){$args=['p_mode'=>'for_you','p_seed'=>'test-seed','p_category'=>$category,'p_limit'=>100];$full=rpc_route('feed',$args);$first=rpc_route('feed',array_replace($args,['p_limit'=>3]));$second=rpc_route('feed',array_replace($args,['p_limit'=>3,'p_offset'=>3]));ok(count($full)>=6&&array_column(array_merge($first,$second),'id')===array_slice(array_column($full,'id'),0,6),'random feed pages consistent without duplicates: '.($category??'main'));}
foreach($raw as $copy)del('posts',$copy['id']);
