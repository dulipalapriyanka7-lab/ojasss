<?php
declare(strict_types=1);
/** OJASSS Tickets: manual-review resale marketplace.
 *  Sellers submit event details + private proof (receipts bucket). Admin reviews before anything is listed.
 *  Buyers pay OJASSS by UPI + UTR; the listing is reserved atomically (RPCs run under the global mutex),
 *  admin confirms the payment and arranges the authorised transfer, then marks it sold. Nothing is auto-verified. */

const TICKET_CATS=['movies','events','shows','sports','concerts','theatre','comedy','music','festivals','pops','drinks','amusement'];
const TICKET_SOURCES=['bookmyshow','district','other'];

function ticket_fee_pct(): int { return max(0,min(30,(int)setting('tickets.fee_percent',0))); }
function ticket_expired(array $t): bool { return isset($t['event_at'])&&strtotime($t['event_at'])<=time(); }
function ticket_status(array $t): string {
    $s=$t['status']??'pending_review';
    return in_array($s,['pending_review','listed','reserved'],true)&&ticket_expired($t)?'expired':$s;
}
/** Public view: never includes proof, booking reference or seller contact. */
function ticket_public(array $t): array {
    $fee=intdiv((int)$t['price']*ticket_fee_pct(),100);
    return ['id'=>$t['id'],'category'=>$t['category'],'title'=>$t['title'],'venue'=>$t['venue'],'city'=>$t['city'],'event_at'=>$t['event_at'],
        'quantity'=>$t['quantity'],'seats'=>$t['seats'],'source'=>$t['source'],'original_price'=>$t['original_price'],'price'=>$t['price'],
        'fee'=>$fee,'total'=>(int)$t['price']+$fee,'verified'=>(bool)($t['verified']??false),'status'=>ticket_status($t),
        'seller'=>$t['username']??'member','created_at'=>$t['created_at'],'poster'=>$t['poster']??''];
}
function ticket_owner_view(array $t): array {
    return ticket_public($t)+['reason'=>$t['reason']??null,'has_proof'=>!empty($t['proof_path'])];
}
function ticket_order_view(array $o,bool $admin=false): array {
    $t=rec('tickets',$o['ticket_id']);
    $v=['id'=>$o['id'],'status'=>$o['status'],'amount'=>$o['amount'],'fee'=>$o['fee'],'total'=>$o['total'],'utr'=>$o['utr'],'note'=>$o['note']??null,
        'created_at'=>$o['created_at'],'ticket'=>$t?ticket_public($t):null];
    if ($admin) $v+=['buyer'=>$o['username'],'buyer_name'=>$o['name'],'buyer_phone'=>$o['phone'],'seller'=>$t['username']??null,'seller_id'=>$t['user_id']??null];
    return $v;
}

function tickets_rpc(string $name,array $p): array {
    switch ($name) {
    case 'tickets_market': {
        $cat=(string)($p['p_category']??'');$city=mb_strtolower(trim((string)($p['p_city']??'')));$qs=mb_strtolower(trim((string)($p['p_q']??'')));
        $max=(int)($p['p_max_price']??0);$qty=(int)($p['p_quantity']??0);
        $out=[];
        foreach (rows('tickets') as $t) {
            if (ticket_status($t)!=='listed') continue;
            if ($cat!==''&&$t['category']!==$cat) continue;
            if ($city!==''&&mb_strtolower($t['city'])!==$city) continue;
            if ($qs!==''&&!str_contains(mb_strtolower($t['title'].' '.$t['venue']),$qs)) continue;
            if ($max>0&&(int)$t['price']>$max) continue;
            if ($qty>0&&(int)$t['quantity']<$qty) continue;
            $out[]=ticket_public($t);
        }
        usort($out,fn($a,$b)=>strcmp($a['event_at'],$b['event_at']));
        return ['fee_percent'=>ticket_fee_pct(),'upi_id'=>setting('one_chance.upi_id',''),'listings'=>array_slice($out,0,100)];
    }
    case 'tickets_mine': {
        $u=need_user();
        $listings=array_map('ticket_owner_view',array_reverse(rows('tickets',$u['id'])));
        $orders=array_map('ticket_order_view',array_reverse(rows('ticket_orders',$u['id'])));
        return ['listings'=>$listings,'orders'=>$orders];
    }
    case 'tickets_submit': {
        $u=need_user();rate('ticket-submit:'.$u['id'],10,86400);
        $t=['user_id'=>$u['id'],'username'=>$u['username'],
            'category'=>enum_value($p['p_category']??'',TICKET_CATS),'source'=>enum_value($p['p_source']??'',TICKET_SOURCES),
            'title'=>text($p['p_title']??'',120),'venue'=>text($p['p_venue']??'',120),'city'=>text($p['p_city']??'',60),
            'seats'=>text($p['p_seats']??'',80)?:'General Admission','booking_ref'=>strtoupper(text($p['p_booking_ref']??'',40))];
        check($t['title']!==''&&$t['venue']!==''&&$t['city']!=='','Enter the event name, venue and city.');
        check(mb_strlen($t['booking_ref'])>=4,'Enter the booking ID from your confirmation.');
        $at=strtotime((string)($p['p_event_at']??''));check($at!==false,'Enter the event date and time.');
        check($at>time()+3600,'This event has already started or is too close to list.');
        $t['event_at']=gmdate('Y-m-d\TH:i:s\Z',$at);
        $qty=$p['p_quantity']??0;check(is_int($qty)&&$qty>=1&&$qty<=10,'Choose 1 to 10 tickets.');$t['quantity']=$qty;
        $orig=$p['p_original_price']??0;$price=$p['p_price']??0;
        check(is_int($orig)&&$orig>=1&&$orig<=500000,'Enter the original total price.');
        check(is_int($price)&&$price>=1,'Enter your selling price.');
        check($price<=$orig,'Resale above the original price is not allowed. Lower your selling price.');
        $t['original_price']=$orig;$t['price']=$price;$t['original_price_source']='seller';
        check(($p['p_transferable']??false)===true,'Confirm the ticket is allowed to be transferred or resold.');
        check(($p['p_authorised']??false)===true,'Confirm you own this booking and are allowed to list it.');
        $path=text($p['p_proof_path']??'',200);$o=rec('objects',hash('sha256','receipts/'.$path));
        check($o&&$o['user_id']===$u['id']&&$o['bucket']==='receipts','Upload your ticket proof first.');
        $t['proof_path']=$path;
        // Same booking cannot be listed twice while an earlier listing is still live or sold.
        $key=hash('sha256',$t['source'].'|'.$t['booking_ref']);
        foreach (rows('tickets') as $x) if (($x['booking_key']??'')===$key&&!in_array(ticket_status($x),['rejected','cancelled','expired'],true)) fail(409,'DUPLICATE','This booking has already been listed.');
        $t['booking_key']=$key;$t['status']='pending_review';$t['verified']=false;$t['reason']=null;
        return ticket_owner_view(put('tickets',$t,$u['id']));
    }
    case 'tickets_update': {
        $u=need_user();$t=owned('tickets',text($p['p_id']??'',36));$st=ticket_status($t);
        if (($p['p_action']??'')==='cancel') {
            check(in_array($st,['pending_review','listed'],true),'A reserved or sold listing cannot be cancelled.');
            $t['status']='cancelled';return ticket_owner_view(put('tickets',$t,$u['id']));
        }
        check(in_array($st,['pending_review','listed'],true),'The price cannot change after the ticket is reserved or sold.');
        $price=$p['p_price']??0;check(is_int($price)&&$price>=1&&$price<=(int)$t['original_price'],'Price must be between ₹1 and the original price.');
        $t['price']=$price;return ticket_owner_view(put('tickets',$t,$u['id']));
    }
    case 'tickets_buy': {
        $u=need_user();rate('ticket-buy:'.$u['id'],6,3600);
        $t=rec('tickets',text($p['p_id']??'',36));check($t!==null,'Listing not found.',404);
        check(ticket_status($t)==='listed','This ticket is no longer available.',409);
        check($t['user_id']!==$u['id'],'You cannot buy your own ticket.');
        $fee0=intdiv((int)$t['price']*ticket_fee_pct(),100);$total0=(int)$t['price']+$fee0;
        $coins=$p['p_coins']??0;check(is_int($coins)&&$coins>=0&&$coins<=$total0,'Invalid coin amount.');
        $utr=null;if($coins<$total0){$utr=strtoupper(text($p['p_utr']??'',40));check((bool)preg_match('/^[A-Z0-9]{8,30}$/',$utr),'Enter the UPI reference (UTR) from your payment.');
        foreach (rows('ticket_orders') as $x) check(($x['utr']??'')!==$utr,'This UTR was already submitted.');}
        $name=text($p['p_name']??'',80);$phone=text($p['p_phone']??'',20);
        check($name!==''&&preg_match('/^[0-9+ ]{10,15}$/',$phone)===1,'Enter your name and phone number.');
        $fee=intdiv((int)$t['price']*ticket_fee_pct(),100);
        $o=put('ticket_orders',['user_id'=>$u['id'],'username'=>$u['username'],'ticket_id'=>$t['id'],'amount'=>(int)$t['price'],'fee'=>$fee,'total'=>(int)$t['price']+$fee,
            'utr'=>$utr,'coins'=>$coins,'upi_amount'=>$total0-$coins,'name'=>$name,'phone'=>$phone,'status'=>'pending','note'=>null],$u['id'],$t['id']);
        if($coins>0)coin_move($u['id'],-$coins,'ticket',$o['id'],'Ticket · '.$t['title']);
        $t['status']='reserved';$t['order_id']=$o['id'];put('tickets',$t,$t['user_id']);
        return ticket_order_view($o);
    }
    }
    $admin=staff(true);
    switch ($name) {
    case 'tickets_admin_list': {
        return array_map(function($t){$v=ticket_owner_view($t);$v['booking_ref']=$t['booking_ref'];$v['proof_path']=$t['proof_path'];$v['user_id']=$t['user_id'];return $v;},array_slice(array_reverse(rows('tickets')),0,150));
    }
    case 'tickets_admin_review': {
        $t=rec('tickets',text($p['p_id']??'',36));check($t!==null,'Listing not found.',404);
        check(ticket_status($t)==='pending_review','Only listings pending review can be reviewed.');$old=$t;
        $d=enum_value($p['p_decision']??'',['approve','reject']);$reason=text($p['p_reason']??'',300);
        if ($d==='approve') {$t['status']='listed';$t['verified']=($p['p_verified']??false)===true;$t['reason']=null;}
        else {check($reason!=='','Enter a reason for rejecting.');$t['status']='rejected';$t['reason']=$reason;}
        put('tickets',$t,$t['user_id']);log_action($name,'ticket',$t['id'],$old,$t,$reason);
        notification($t['user_id'],'system',$d==='approve'?'Your ticket is listed':'Ticket listing rejected',$d==='approve'?$t['title'].' is now visible to buyers.':$reason,'/tickets?tab=listings');
        return ticket_owner_view($t);
    }
    case 'tickets_admin_orders': {
        return array_map(fn($o)=>ticket_order_view($o,true),array_slice(array_reverse(rows('ticket_orders')),0,100));
    }
    case 'tickets_admin_order_update': {
        $o=rec('ticket_orders',text($p['p_id']??'',36));check($o!==null,'Order not found.',404);$old=$o;
        $s=enum_value($p['p_status']??'',['paid','transferred','rejected']);$note=text($p['p_note']??'',200)?:null;
        check($o['status']!=='rejected'&&$o['status']!=='transferred','This order is already closed.');
        $t=rec('tickets',$o['ticket_id']);
        if ($s==='rejected') {check($note!==null,'Enter a reason.');if((int)($o['coins']??0)>0)coin_move($o['user_id'],(int)$o['coins'],'refund',$o['id'],'Refund · ticket order rejected');if($t&&($t['order_id']??'')===$o['id']&&$t['status']==='reserved'){$t['status']=ticket_expired($t)?'expired':'listed';unset($t['order_id']);put('tickets',$t,$t['user_id']);}}
        if ($s==='transferred'&&$t) {$t['status']='sold';put('tickets',$t,$t['user_id']);}
        $o['status']=$s;$o['note']=$note;put('ticket_orders',$o,$o['user_id'],$o['ticket_id']);log_action($name,'ticket_order',$o['id'],$old,$o,$note);
        $msg=['paid'=>'Payment confirmed. We are arranging the ticket transfer.','transferred'=>'Your ticket has been transferred. Check your booking app or messages.','rejected'=>'Payment could not be verified: '.$note][$s];
        notification($o['user_id'],'system','Ticket order update',$msg,'/tickets?tab=mine');
        if ($t&&$s!=='rejected') notification($t['user_id'],'system','Your ticket sale',$s==='paid'?'A buyer paid for '.$t['title'].'. The admin will contact you for the transfer.':$t['title'].' is marked sold.','/tickets?tab=listings');
        return ticket_order_view($o,true);
    }
    case 'tickets_admin_poster': {
        $t=rec('tickets',text($p['p_id']??'',36));check($t!==null,'Listing not found.',404);
        $v=text($p['p_poster']??'',300);check($v===''||(bool)preg_match('~^(/|https://)[^\s"<>]+$~',$v),'Invalid image.');
        $t['poster']=$v;put('tickets',$t,$t['user_id']);log_action($name,'ticket',$t['id'],null,$v);return ticket_owner_view($t);
    }
    case 'tickets_admin_fee': {
        $v=$p['p_fee_percent']??null;check(is_int($v)&&$v>=0&&$v<=30,'Fee must be 0–30%.');
        put('settings',['id'=>'tickets.fee_percent','key'=>'tickets.fee_percent','value'=>$v,'is_public'=>false]);log_action($name,'tickets',null,null,$v);return ['fee_percent'=>$v];
    }
    }
    fail(404,'NOT_FOUND','Unknown tickets operation.');
}
