<?php
declare(strict_types=1);
/** OJASSS Pub Events & Nightlife. Venues, events, view-only bar menus, and event entry bookings.
 *  Menus are informational only: OJASSS never sells or delivers drinks. Bookings are entry tickets,
 *  paid by UPI + UTR (admin verifies) and/or game coins. All RPCs run under the global mutex. */

const PUB_TYPES = ['live_music','dj','standup','pub_show','special'];
const PUB_MENU_CATS = ['mocktails','soft_drinks','juices','coffee_tea','snacks','starters','combos','beverages'];

function pub_img($v): string { $v = text($v ?? '', 300); check($v === '' || (bool)preg_match('~^(/|https://)[^\s"<>]+$~', $v), 'Image must be an uploaded file or https link.'); return $v; }
function pub_event_state(array $e): string {
    if (($e['status'] ?? 'draft') !== 'published') return $e['status'] ?? 'draft';
    if (strtotime($e['ends_at']) < time()) return 'ended';
    $sold = (int)($e['sold'] ?? 0);
    if ($sold >= (int)$e['capacity']) return 'sold_out';
    $open = empty($e['book_from']) || strtotime($e['book_from']) <= time();
    $close = empty($e['book_until']) || strtotime($e['book_until']) > time();
    return $open && $close ? 'on_sale' : ($open ? 'booking_closed' : 'coming_soon');
}
function pub_event_out(array $e, bool $admin = false): array {
    $v = rec('pub_venues', $e['venue_id']);
    $out = $e + ['state' => pub_event_state($e), 'left' => max(0, (int)$e['capacity'] - (int)($e['sold'] ?? 0)),
        'venue' => $v ? array_intersect_key($v, array_flip(['id','name','city','area','address','logo','photo','hours','rules','phone'])) : null];
    if (!$admin) unset($out['created_by']);
    return $out;
}
function pub_booking_ref(string $id): string { return 'PB' . strtoupper(substr(str_replace('-', '', $id), 0, 10)); }

function pubs_rpc(string $name, array $p): array {
    global $actor;
    switch ($name) {
    case 'pubs_list': {
        $events = [];
        foreach (rows('pub_events') as $e) if (($e['status'] ?? '') === 'published' && strtotime($e['ends_at']) >= time() - 3600) $events[] = pub_event_out($e);
        usort($events, fn($a, $b) => strcmp($a['starts_at'], $b['starts_at']));
        $venues = array_values(array_filter(rows('pub_venues'), fn($v) => ($v['status'] ?? '') === 'published'));
        $menu = [];
        $live = array_flip(array_column($venues, 'id'));
        foreach (rows('pub_menu') as $m) if (isset($live[$m['venue_id']]) && ($m['status'] ?? 'published') === 'published') $menu[] = $m;
        return ['events' => $events, 'venues' => $venues, 'menu' => $menu, 'upi_id' => setting('one_chance.upi_id', '')];
    }
    case 'pubs_event': {
        $e = rec('pub_events', text($p['p_id'] ?? '', 36)); check($e !== null && ($e['status'] ?? '') !== 'draft', 'Event not found.', 404);
        $menu = array_values(array_filter(rows('pub_menu'), fn($m) => $m['venue_id'] === $e['venue_id'] && ($m['status'] ?? 'published') === 'published'));
        $mine = $actor ? array_map(fn($b) => $b + ['ref' => pub_booking_ref($b['id'])], array_values(array_filter(rows('pub_bookings', $actor['id']), fn($b) => $b['event_id'] === $e['id']))) : [];
        return ['event' => pub_event_out($e), 'menu' => $menu, 'my_bookings' => $mine, 'upi_id' => setting('one_chance.upi_id', '')];
    }
    case 'pubs_book': {
        $u = need_user(); rate('pub-book:' . $u['id'], 10, 3600);
        $e = rec('pub_events', text($p['p_id'] ?? '', 36)); check($e !== null, 'Event not found.', 404);
        check(pub_event_state($e) === 'on_sale', 'Booking is not open for this event.', 409);
        check(($p['p_age_ok'] ?? false) === true, 'Confirm you meet the age requirement.');
        $qty = $p['p_qty'] ?? 0; check(is_int($qty) && $qty >= 1 && $qty <= 10, 'Choose 1 to 10 entries.');
        check($qty <= (int)$e['capacity'] - (int)($e['sold'] ?? 0), 'Only ' . max(0, (int)$e['capacity'] - (int)($e['sold'] ?? 0)) . ' entries left.', 409);
        $amount = $qty * (int)$e['price'];
        $coins = $p['p_coins'] ?? 0; check(is_int($coins) && $coins >= 0 && $coins <= $amount, 'Invalid coin amount.');
        $utr = null;
        if ($amount - $coins > 0) {
            $utr = strtoupper(text($p['p_utr'] ?? '', 40)); check((bool)preg_match('/^[A-Z0-9]{8,30}$/', $utr), 'Enter the UPI reference (UTR).');
            foreach (rows('pub_bookings') as $x) check(($x['utr'] ?? '') !== $utr, 'This UTR was already used.');
        }
        $nm = text($p['p_name'] ?? '', 80); $ph = text($p['p_phone'] ?? '', 20);
        check($nm !== '' && preg_match('/^[0-9+ ]{10,15}$/', $ph) === 1, 'Enter your name and phone number.');
        $b = put('pub_bookings', ['user_id' => $u['id'], 'username' => $u['username'], 'event_id' => $e['id'], 'title' => $e['title'], 'qty' => $qty, 'amount' => $amount,
            'coins' => $coins, 'upi_amount' => $amount - $coins, 'utr' => $utr, 'name' => $nm, 'phone' => $ph,
            'status' => $amount - $coins > 0 ? 'pending' : 'confirmed', 'note' => null], $u['id'], $e['id']);
        if ($coins > 0) coin_move($u['id'], -$coins, 'pub', $b['id'], 'Pub event · ' . $e['title']);
        $e['sold'] = (int)($e['sold'] ?? 0) + $qty; put('pub_events', $e);
        return $b + ['ref' => pub_booking_ref($b['id'])];
    }
    }
    $admin = staff(true);
    switch ($name) {
    case 'pubs_admin_get': {
        return ['venues' => array_reverse(rows('pub_venues')), 'events' => array_map(fn($e) => pub_event_out($e, true), array_reverse(rows('pub_events'))),
            'menu' => rows('pub_menu'), 'bookings' => array_map(fn($b) => $b + ['ref' => pub_booking_ref($b['id'])], array_slice(array_reverse(rows('pub_bookings')), 0, 200))];
    }
    case 'pubs_admin_venue': {
        $id = text($p['p_id'] ?? '', 36); $old = $id ? rec('pub_venues', $id) : null; check(!$id || $old, 'Venue not found.', 404);
        if (($p['p_delete'] ?? false) === true) { foreach (rows('pub_events') as $e) check($e['venue_id'] !== $id, 'Remove this venue’s events first.'); del('pub_venues', $id); log_action($name, 'pub_venue', $id, $old, null); return ['deleted' => true]; }
        $v = ($old ?? []) + ['id' => $id ?: uid()];
        foreach (['name' => 80, 'city' => 60, 'area' => 80, 'address' => 200, 'phone' => 20, 'hours' => 120, 'rules' => 600, 'about' => 600] as $k => $max) $v[$k] = text($p['p_' . $k] ?? ($v[$k] ?? ''), $max);
        check($v['name'] !== '' && $v['city'] !== '', 'Enter the venue name and city.');
        $v['logo'] = pub_img($p['p_logo'] ?? ($v['logo'] ?? '')); $v['photo'] = pub_img($p['p_photo'] ?? ($v['photo'] ?? ''));
        $v['status'] = enum_value($p['p_status'] ?? ($v['status'] ?? 'draft'), ['draft', 'published']);
        $v = put('pub_venues', $v); log_action($name, 'pub_venue', $v['id'], $old, $v); return $v;
    }
    case 'pubs_admin_event': {
        $id = text($p['p_id'] ?? '', 36); $old = $id ? rec('pub_events', $id) : null; check(!$id || $old, 'Event not found.', 404);
        $e = ($old ?? []) + ['id' => $id ?: uid(), 'sold' => 0, 'created_by' => $admin['id']];
        $e['venue_id'] = text($p['p_venue_id'] ?? ($e['venue_id'] ?? ''), 36); check(rec('pub_venues', $e['venue_id']) !== null, 'Choose a venue.');
        foreach (['title' => 100, 'host' => 100, 'about' => 1500, 'rules' => 800, 'policy' => 800, 'ticket_name' => 60] as $k => $max) $e[$k] = text($p['p_' . $k] ?? ($e[$k] ?? ''), $max);
        check($e['title'] !== '', 'Enter the event title.');
        $e['type'] = enum_value($p['p_type'] ?? ($e['type'] ?? ''), PUB_TYPES);
        $e['age'] = enum_value($p['p_age'] ?? ($e['age'] ?? '18'), ['all', '18', '21', '25']);
        $e['cover'] = pub_img($p['p_cover'] ?? ($e['cover'] ?? ''));
        foreach (['starts_at', 'ends_at', 'book_from', 'book_until'] as $k) {
            $raw = $p['p_' . $k] ?? ($e[$k] ?? '');
            if ($raw === '' || $raw === null) { check(!in_array($k, ['starts_at', 'ends_at'], true), 'Enter start and end time.'); $e[$k] = null; continue; }
            $t = strtotime((string)$raw); check($t !== false, 'Invalid ' . str_replace('_', ' ', $k) . '.'); $e[$k] = gmdate('Y-m-d\TH:i:s\Z', $t);
        }
        check(strtotime($e['ends_at']) > strtotime($e['starts_at']), 'End time must be after the start.');
        $cap = $p['p_capacity'] ?? ($e['capacity'] ?? null); check(is_int($cap) && $cap >= (int)$e['sold'] && $cap <= 100000, 'Capacity must cover tickets already sold.'); $e['capacity'] = $cap;
        $price = $p['p_price'] ?? ($e['price'] ?? null); check(is_int($price) && $price >= 0 && $price <= 100000, 'Enter a ticket price (0 for free entry).'); $e['price'] = $price;
        $st = enum_value($p['p_status'] ?? ($e['status'] ?? 'draft'), ['draft', 'published', 'cancelled']);
        if ($st === 'cancelled' && ($old['status'] ?? '') !== 'cancelled') {
            foreach (rows('pub_bookings', null, $e['id']) as $b) {
                if (in_array($b['status'], ['pending', 'confirmed'], true)) {
                    if ((int)$b['coins'] > 0) coin_move($b['user_id'], (int)$b['coins'], 'refund', $b['id'], 'Refund · event cancelled');
                    $b['status'] = 'cancelled'; $b['note'] = 'Event cancelled by organiser.' . ((int)$b['upi_amount'] > 0 ? ' UPI refund will be processed by OJASSS.' : ''); put('pub_bookings', $b, $b['user_id'], $e['id']);
                    notification($b['user_id'], 'system', 'Event cancelled', $e['title'] . ' has been cancelled. ' . ((int)$b['coins'] > 0 ? 'Your coins were refunded.' : 'We will contact you about your refund.'), '/tickets/pubs/' . $e['id']);
                }
            }
        }
        $e['status'] = $st;
        $e = put('pub_events', $e); log_action($name, 'pub_event', $e['id'], $old, $e); return pub_event_out($e, true);
    }
    case 'pubs_admin_menu': {
        $id = text($p['p_id'] ?? '', 36); $old = $id ? rec('pub_menu', $id) : null; check(!$id || $old, 'Item not found.', 404);
        if (($p['p_delete'] ?? false) === true) { del('pub_menu', $id); log_action($name, 'pub_menu', $id, $old, null); return ['deleted' => true]; }
        $m = ($old ?? []) + ['id' => $id ?: uid()];
        $m['venue_id'] = text($p['p_venue_id'] ?? ($m['venue_id'] ?? ''), 36); check(rec('pub_venues', $m['venue_id']) !== null, 'Choose a venue.');
        $m['category'] = enum_value($p['p_category'] ?? ($m['category'] ?? ''), PUB_MENU_CATS);
        $m['name'] = text($p['p_name'] ?? ($m['name'] ?? ''), 80); check($m['name'] !== '', 'Enter the item name.');
        $m['about'] = text($p['p_about'] ?? ($m['about'] ?? ''), 200);
        $price = $p['p_price'] ?? ($m['price'] ?? null); check(is_int($price) && $price >= 0 && $price <= 100000, 'Enter the price shown by the venue.'); $m['price'] = $price;
        $m['image'] = pub_img($p['p_image'] ?? ($m['image'] ?? ''));
        $m['available'] = (bool)($p['p_available'] ?? ($m['available'] ?? true));
        $m['age_restricted'] = (bool)($p['p_age_restricted'] ?? ($m['age_restricted'] ?? false)) || $m['category'] === 'beverages';
        $m['status'] = enum_value($p['p_status'] ?? ($m['status'] ?? 'published'), ['draft', 'published']);
        $m = put('pub_menu', $m); log_action($name, 'pub_menu', $m['id'], $old, $m); return $m;
    }
    case 'pubs_admin_booking': {
        $b = rec('pub_bookings', text($p['p_id'] ?? '', 36)); check($b !== null, 'Booking not found.', 404);
        $s = enum_value($p['p_status'] ?? '', ['confirmed', 'rejected', 'attended']);
        if ($s === 'attended') check($b['status'] === 'confirmed', 'Only confirmed bookings can be checked in.');
        else check($b['status'] === 'pending', 'Only pending bookings can be reviewed.');
        if ($s === 'rejected') {
            if ((int)$b['coins'] > 0) coin_move($b['user_id'], (int)$b['coins'], 'refund', $b['id'], 'Refund · booking rejected');
            $e = rec('pub_events', $b['event_id']); if ($e) { $e['sold'] = max(0, (int)$e['sold'] - (int)$b['qty']); put('pub_events', $e); }
        }
        $b['status'] = $s; $b['note'] = text($p['p_note'] ?? '', 200) ?: null; put('pub_bookings', $b, $b['user_id'], $b['event_id']);
        if ($s !== 'attended') notification($b['user_id'], 'system', $s === 'confirmed' ? 'Pub event booking confirmed' : 'Booking not confirmed', $s === 'confirmed' ? $b['title'] . ' · ' . $b['qty'] . ' entry' : ($b['note'] ?? 'Payment could not be verified.'), '/tickets/pubs/' . $b['event_id']);
        log_action($name, 'pub_booking', $b['id'], null, $s, $b['note']); return $b + ['ref' => pub_booking_ref($b['id'])];
    }
    }
    fail(404, 'NOT_FOUND', 'Unknown pubs operation.');
}
