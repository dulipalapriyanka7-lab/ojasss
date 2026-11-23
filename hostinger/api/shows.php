<?php
declare(strict_types=1);
/** OJASSS premiere shows: seat-map booking for a single screening.
 *  Seats are held for 10 minutes while the member pays (UPI + UTR, optional game coins),
 *  then wait for admin confirmation. Admin can block seats already sold on other platforms
 *  (BookMyShow / District / other) and adjust section prices. All RPCs run under the global mutex. */

const SHOW_HOLD_SECONDS = 600;
const SHOW_SOURCES = ['bookmyshow','district','other','admin'];

/** Alankar A/C 4K Dolby, Vijayawada — Recliner, Balcony, First Class (aisles split each row into blocks). */
function show_default_layout(): array {
    $rows = fn(array $letters, array $blocks) => array_map(fn($l) => ['r'=>$l,'blocks'=>$blocks], $letters);
    $wide = [[1,6],[7,13],[14,20],[21,26]];
    return [
        ['key'=>'recliner','name'=>'RECLINER','price'=>295,'rows'=>$rows(['Y','Z'],[[1,4],[5,9],[10,14],[15,18]])],
        ['key'=>'balcony','name'=>'BALCONY','price'=>145,'rows'=>$rows(['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'],$wide)],
        ['key'=>'first','name'=>'FIRST CLASS','price'=>100,'rows'=>$rows(['P','Q','R','S'],$wide)],
    ];
}
function show_seed(): array {
    $id='muta-mestri-alankar';
    $s=rec('shows',$id);
    if ($s) return $s;
    return put('shows',['id'=>$id,'title'=>'Muta Mestri','language'=>'Telugu','format'=>'2D','runtime'=>'2h 43m',
        'poster'=>'/shows/muta-mestri.jpg','theatre'=>'Alankar A/C 4K Dolby Surround','city'=>'Vijayawada',
        'starts_at'=>'2026-11-23T02:31:00Z','status'=>'open','tag'=>'Premium Premiere Show','sections'=>show_default_layout()]);
}
function show_valid_seat(array $show, string $seat): ?array {
    if (!preg_match('/^([a-z]+):([A-Z]):(\d{1,2})$/',$seat,$m)) return null;
    foreach ($show['sections'] as $sec) if ($sec['key']===$m[1]) foreach ($sec['rows'] as $row) if ($row['r']===$m[2])
        foreach ($row['blocks'] as [$a,$b]) if ((int)$m[3]>=$a && (int)$m[3]<=$b) return $sec;
    return null;
}
/** Seat map state, releasing expired holds first. */
function show_state(string $id): array {
    $st=rec('show_seats',$id) ?? ['id'=>$id,'blocked'=>[],'taken'=>[]];
    $st['blocked']=(array)($st['blocked']??[]); $st['taken']=(array)($st['taken']??[]);
    $changed=false;
    foreach (array_unique(array_values($st['taken'])) as $oid) {
        $o=rec('show_orders',$oid);
        $dead=!$o || in_array($o['status'],['rejected','expired','cancelled'],true) || ($o['status']==='held' && strtotime($o['expires_at'])<time());
        if (!$dead) continue;
        if ($o && $o['status']==='held') { $o['status']='expired'; put('show_orders',$o,$o['user_id'],$id); if ((int)($o['coins']??0)>0) coin_move($o['user_id'],(int)$o['coins'],'refund',$o['id'],'Refund · seat hold expired'); }
        foreach ($st['taken'] as $seat=>$x) if ($x===$oid) { unset($st['taken'][$seat]); $changed=true; }
    }
    if ($changed) put('show_seats',$st);
    return $st;
}
function show_public(array $show, array $st, ?string $uid): array {
    $seats=[];
    foreach ($st['blocked'] as $seat=>$src) $seats[$seat]='b:'.$src;
    foreach ($st['taken'] as $seat=>$oid) { $o=rec('show_orders',$oid); $seats[$seat]=$o&&$o['user_id']===$uid?'mine':($o&&$o['status']==='confirmed'?'sold':'held'); }
    return ['show'=>$show,'seats'=>$seats,'upi_id'=>setting('one_chance.upi_id',''),'now'=>gmdate('Y-m-d\TH:i:s\Z')];
}
function show_order_out(array $o): array { return array_intersect_key($o,array_flip(['id','show_id','seats','amount','coins','upi_amount','status','utr','expires_at','created_at','note','name','phone','username'])); }

/** Signed e-ticket token: "OJT1.<orderId>.<hmac>". Only confirmed bookings get one. */
function show_ticket_sig(string $oid): string { global $config; return substr(hash_hmac('sha256','show-ticket|'.$oid,(string)$config['secret']),0,24); }
function show_ticket_token(string $oid): string { return 'OJT1.'.$oid.'.'.show_ticket_sig($oid); }
function show_booking_ref(string $oid): string { return 'OJ'.strtoupper(substr(str_replace('-','',$oid),0,10)); }

function shows_rpc(string $name, array $p): array {
    global $actor;
    $show=show_seed();
    $id=text($p['p_id']??$show['id'],60);
    if ($id!==$show['id']) { $show=rec('shows',$id); check($show!==null,'Show not found.',404); }
    switch ($name) {
    case 'show_get': {
        $st=show_state($id); $out=show_public($show,$st,$actor['id']??null);
        $out['my_orders']=$actor?array_map('show_order_out',array_reverse(rows('show_orders',$actor['id'],$id))):[];
        return $out;
    }
    case 'show_hold': {
        $u=need_user(); rate('show-hold:'.$u['id'],20,3600);
        check(($show['status']??'open')==='open' && strtotime($show['starts_at'])>time(),'Booking for this show is closed.',410);
        $st=show_state($id);
        foreach (rows('show_orders',$u['id'],$id) as $o) check($o['status']!=='held' || strtotime($o['expires_at'])<time(),'Finish or cancel your current seat hold first.');
        $want=$p['p_seats']??[]; check(is_array($want)&&count($want)>=1&&count($want)<=10,'Choose 1 to 10 seats.');
        $amount=0;$seats=[];
        foreach ($want as $seat) {
            $seat=(string)$seat; $sec=show_valid_seat($show,$seat); check($sec!==null,'Invalid seat.');
            check(!isset($st['blocked'][$seat]) && !isset($st['taken'][$seat]),'Seat '.str_replace(':',' ',substr($seat,strpos($seat,':')+1)).' was just taken. Pick another.',409);
            $seats[]=$seat; $amount+=(int)$sec['price'];
        }
        $seats=array_values(array_unique($seats));
        $o=put('show_orders',['user_id'=>$u['id'],'username'=>$u['username'],'show_id'=>$id,'seats'=>$seats,'amount'=>$amount,'coins'=>0,'upi_amount'=>$amount,
            'status'=>'held','expires_at'=>gmdate('Y-m-d\TH:i:s\Z',time()+SHOW_HOLD_SECONDS),'utr'=>null,'note'=>null],$u['id'],$id);
        foreach ($seats as $seat) $st['taken'][$seat]=$o['id'];
        put('show_seats',$st);
        return show_order_out($o);
    }
    case 'show_pay': {
        $u=need_user();
        $o=owned('show_orders',text($p['p_order']??'',36)); show_state($id); $o=rec('show_orders',$o['id']);
        check($o['status']==='held','Your seat hold expired. Please choose seats again.',410);
        $coins=$p['p_coins']??0; check(is_int($coins)&&$coins>=0&&$coins<=$o['amount'],'Invalid coin amount.');
        $rest=$o['amount']-$coins; $utr=null;
        if ($rest>0) {
            $utr=strtoupper(text($p['p_utr']??'',40)); check((bool)preg_match('/^[A-Z0-9]{8,30}$/',$utr),'Enter the 12-digit UPI reference (UTR).');
            foreach (rows('show_orders') as $x) check(($x['utr']??'')!==$utr,'This UTR was already used.');
        }
        $name2=text($p['p_name']??'',80); $phone=text($p['p_phone']??'',20);
        check($name2!=='' && preg_match('/^[0-9+ ]{10,15}$/',$phone)===1,'Enter your name and phone number.');
        if ($coins>0) coin_move($u['id'],-$coins,'show',$o['id'],'Seats · '.$show['title']);
        $o['coins']=$coins;$o['upi_amount']=$rest;$o['utr']=$utr;$o['name']=$name2;$o['phone']=$phone;
        $o['status']=$rest>0?'pending':'confirmed';
        return show_order_out(put('show_orders',$o,$u['id'],$id));
    }
    case 'show_ticket': {
        $u=need_user(); $o=owned('show_orders',text($p['p_order']??'',36));
        $out=['order'=>show_order_out($o),'show'=>$show,'booking_ref'=>show_booking_ref($o['id']),'qr'=>null,'checked_in'=>$o['checked_in']??null];
        if ($o['status']==='confirmed') $out['qr']=show_ticket_token($o['id']);
        return $out;
    }
    case 'show_cancel': {
        $u=need_user(); $o=owned('show_orders',text($p['p_order']??'',36));
        check($o['status']==='held','Only an unpaid hold can be cancelled.');
        $o['status']='cancelled'; put('show_orders',$o,$u['id'],$id); show_state($id); return show_order_out($o);
    }
    }
    $admin=staff(true);
    switch ($name) {
    case 'show_admin_get': {
        $st=show_state($id);
        return ['show'=>$show,'blocked'=>$st['blocked'],'taken'=>$st['taken'],'orders'=>array_map('show_order_out',array_reverse(rows('show_orders',null,$id)))];
    }
    case 'show_admin_save': {
        $old=$show;
        $show['title']=text($p['p_title']??$show['title'],80)?:$show['title'];
        if (isset($p['p_starts_at'])) { $t=strtotime((string)$p['p_starts_at']); check($t!==false,'Invalid show time.'); $show['starts_at']=gmdate('Y-m-d\TH:i:s\Z',$t); }
        if (isset($p['p_status'])) $show['status']=enum_value($p['p_status'],['open','closed']);
        $prices=$p['p_prices']??[];
        if (is_array($prices)) foreach ($show['sections'] as &$sec) if (isset($prices[$sec['key']])) { $v=$prices[$sec['key']]; check(is_int($v)&&$v>=1&&$v<=5000,'Price must be ₹1–₹5000.'); $sec['price']=$v; }
        unset($sec);
        put('shows',$show); log_action($name,'show',$id,$old,$show); return $show;
    }
    case 'show_admin_block': {
        $st=show_state($id); $src=(string)($p['p_source']??'');
        check($src===''||in_array($src,SHOW_SOURCES,true),'Invalid source.');
        $list=$p['p_seats']??[]; check(is_array($list)&&count($list)>=1&&count($list)<=200,'Choose seats.');
        foreach ($list as $seat) { $seat=(string)$seat; check(show_valid_seat($show,$seat)!==null,'Invalid seat.');
            if ($src==='') unset($st['blocked'][$seat]); else { check(!isset($st['taken'][$seat]),'A member already holds '.$seat.'.'); $st['blocked'][$seat]=$src; } }
        put('show_seats',$st); log_action($name,'show',$id,null,['seats'=>$list,'source'=>$src]); return ['blocked'=>$st['blocked']];
    }
    case 'show_admin_verify': {
        $tok=trim((string)($p['p_token']??''));
        check((bool)preg_match('/^OJT1\.([0-9a-f-]{36})\.([0-9a-f]{24})$/',$tok,$m),'This is not an OJASSS ticket.');
        check(hash_equals(show_ticket_sig($m[1]),$m[2]),'Ticket signature is invalid.');
        $o=rec('show_orders',$m[1]); check($o!==null,'Booking not found.',404);
        check($o['status']==='confirmed','This booking is '.$o['status'].', not confirmed.');
        $first=empty($o['checked_in']);
        if ($first && !empty($p['p_check_in'])) { $o['checked_in']=now(); put('show_orders',$o,$o['user_id'],$o['show_id']); }
        return ['ok'=>true,'already_checked_in'=>!$first,'checked_in'=>$o['checked_in']??null,'order'=>show_order_out($o),'booking_ref'=>show_booking_ref($o['id'])];
    }
    case 'show_admin_order': {
        $o=rec('show_orders',text($p['p_order']??'',36)); check($o!==null,'Booking not found.',404);
        $s=enum_value($p['p_status']??'',['confirmed','rejected']); check($o['status']==='pending','Only bookings waiting for payment review can change.');
        $o['status']=$s; $o['note']=text($p['p_note']??'',200)?:null; put('show_orders',$o,$o['user_id'],$id);
        if ($s==='rejected' && (int)$o['coins']>0) coin_move($o['user_id'],(int)$o['coins'],'refund',$o['id'],'Refund · booking rejected');
        show_state($id);
        notification($o['user_id'],'system',$s==='confirmed'?'Your seats are confirmed':'Booking not confirmed',$s==='confirmed'?$show['title'].' · '.count($o['seats']).' seat(s) at '.$show['theatre']:($o['note']??'Payment could not be verified.'),'/premiere');
        log_action($name,'show_order',$o['id'],null,$s,$o['note']); return show_order_out($o);
    }
    }
    fail(404,'NOT_FOUND','Unknown show operation.');
}
