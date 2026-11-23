<?php
$actor=$alice;denied(fn()=>rpc_route('admin_ojasss_pg_status',[]),403,'gateway status restricted to admins');$actor=$mod;denied(fn()=>rpc_route('admin_ojasss_pg_save',[]),403,'moderators cannot configure gateway');$actor=$admin;
$originalPrivate=$config['private_dir'];$config['private_dir']=$originalPrivate.'/pg-'.uid();mkdir($config['private_dir'],0700,true);
try{
 $summary=rpc_route('admin_ojasss_pg_status',[]);ok($summary['status']==='setup_pending'&&!$summary['payments_active'],'gateway begins inactive');
 $secret=str_repeat('test-secret-',4);$saved=rpc_route('admin_ojasss_pg_save',['gateway_url'=>'https://pay.example.com/','merchant_id'=>'merchant-123','webhook_secret'=>$secret]);ok($saved['status']==='details_saved'&&$saved['gateway_url']==='https://pay.example.com'&&$saved['secret_saved'],'gateway details saved');ok(!str_contains(json_encode($saved),$secret)&&!array_key_exists('webhook_secret',$saved),'gateway response never reveals secret');ok(ojasss_pg_config()['webhook_secret']===$secret,'secret retained privately');
 rpc_route('admin_ojasss_pg_save',['gateway_url'=>'https://pay.example.com','merchant_id'=>'merchant-123','webhook_secret'=>'']);ok(ojasss_pg_config()['webhook_secret']===$secret,'blank secret preserves stored secret');
 foreach(['http://pay.example.com','https://user:secret@pay.example.com','https://127.0.0.1','https://pay.example.com?token=secret','https://pay.example.com/#bad'] as $url)denied(fn()=>rpc_route('admin_ojasss_pg_save',['gateway_url'=>$url,'merchant_id'=>'merchant-123']),422,'unsafe gateway URL rejected');
 denied(fn()=>rpc_route('admin_ojasss_pg_save',['webhook_secret'=>'short']),422,'short webhook secret rejected');
 $status=rpc_route('admin_ojasss_pg_status',[]);ok(!$status['payments_active'],'saving details cannot activate real payments');$logs=array_filter(rows('admin_logs'),fn($r)=>$r['action']==='configure_ojasss_pg');ok(!str_contains(json_encode(array_values($logs)),$secret),'gateway logs never expose secret');
}finally{if(is_file($config['private_dir'].'/ojasss-pg.json'))unlink($config['private_dir'].'/ojasss-pg.json');rmdir($config['private_dir']);$config['private_dir']=$originalPrivate;}
