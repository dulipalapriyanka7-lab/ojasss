<?php
declare(strict_types=1);
/** OJASSS Real Estate: owner/agent property listings (admin-reviewed), verified agents, saved homes,
 *  enquiries, and a configurable reward for each verified listing (paid once, only after admin approval). */

const RE_KINDS = ['house','apartment','villa','plot','commercial','pg'];
const RE_DEALS = ['rent','sale','lease'];
const RE_FURNISH = ['unfurnished','semi','furnished'];

function re_reward_paise(): int { return max(0, min(1000000, (int)setting('realestate.reward_paise', 3000))); }
function re_img_list($v): array {
    check(is_array($v) && count($v) >= 1 && count($v) <= 12, 'Add 1 to 12 property photos.');
    $out = [];
    foreach ($v as $u) { $u = (string)$u; check((bool)preg_match('~^https://[^\s"<>]{8,400}$~', $u), 'Invalid photo.'); $out[] = $u; }
    return $out;
}
function re_dupe_key(array $l): string {
    $n = fn($s) => preg_replace('/[^a-z0-9]/', '', strtolower((string)$s));
    return hash('sha256', $n($l['address']) . '|' . $n($l['city']) . '|' . $n($l['bhk']) . '|' . $l['deal']);
}
/** Public view: hides the owner's private proof and exact phone until they ask to contact. */
function re_public(array $l): array {
    $a = !empty($l['agent_id']) ? rec('re_agents', $l['agent_id']) : null;
    return array_intersect_key($l, array_flip(['id','title','kind','deal','area','city','bhk','baths','sqft','price','price_unit','furnishing','amenities','about','photos','created_at','approved_at','owner_name','owner_role','market']))
        + ['lat' => isset($l['lat']) ? round((float)$l['lat'], 2) : null, 'lng' => isset($l['lng']) ? round((float)$l['lng'], 2) : null, 'address' => '']
        + ['agent' => $a && ($a['status'] ?? '') === 'verified' ? array_intersect_key($a, array_flip(['id','name','agency','city','photo'])) : null];
}
function re_agent_public(array $a): array {
    $count = count(array_filter(rows('re_listings'), fn($l) => ($l['agent_id'] ?? '') === $a['id'] && ($l['status'] ?? '') === 'approved'));
    return array_intersect_key($a, array_flip(['id','name','agency','city','photo','phone','whatsapp','about'])) + ['listings' => $count];
}

function realestate_rpc(string $name, array $p): array {
    global $actor;
    switch ($name) {
    case 're_home': {
        $city = mb_strtolower(trim((string)($p['p_city'] ?? '')));
        $list = array_values(array_filter(rows('re_listings'), fn($l) => ($l['status'] ?? '') === 'approved' && ($city === '' || mb_strtolower($l['city']) === $city)));
        usort($list, fn($a, $b) => strcmp($b['approved_at'] ?? '', $a['approved_at'] ?? ''));
        $agents = array_values(array_filter(rows('re_agents'), fn($a) => ($a['status'] ?? '') === 'verified' && ($city === '' || mb_strtolower($a['city']) === $city)));
        $saved = $actor ? array_values(array_map(fn($s) => $s['listing_id'], rows('re_saved', $actor['id']))) : [];
        $cities = array_values(array_unique(array_map(fn($l) => $l['city'], array_filter(rows('re_listings'), fn($l) => ($l['status'] ?? '') === 'approved'))));
        return ['listings' => array_map('re_public', array_slice($list, 0, 200)), 'agents' => array_map('re_agent_public', $agents), 'saved' => $saved,
            'cities' => $cities, 'reward_rupees' => intdiv(re_reward_paise(), 100), 'me_agent' => $actor ? rec('re_agents', $actor['id']) : null];
    }
    case 're_listing': {
        $l = rec('re_listings', text($p['p_id'] ?? '', 36)); check($l && (($l['status'] ?? '') === 'approved' || ($actor && $l['user_id'] === $actor['id'])), 'Listing not found.', 404);
        return re_public($l);
    }
    case 're_contact': {
        $u = need_user(); rate('re-contact:' . $u['id'], 40, 3600);
        $l = rec('re_listings', text($p['p_id'] ?? '', 36)); check($l && ($l['status'] ?? '') === 'approved', 'Listing not found.', 404);
        put('re_enquiries', ['listing_id' => $l['id'], 'title' => $l['title'], 'user_id' => $u['id'], 'username' => $u['username'], 'to' => $l['agent_id'] ? 'agent' : 'owner', 'note' => text($p['p_note'] ?? '', 300)], $u['id'], $l['id']);
        $a = !empty($l['agent_id']) ? rec('re_agents', $l['agent_id']) : null;
        return ['name' => $a['name'] ?? $l['owner_name'], 'phone' => $a['phone'] ?? $l['phone'], 'whatsapp' => $a['whatsapp'] ?? $l['phone'], 'address' => $l['address']];
    }
    case 're_save': {
        $u = need_user(); $id = text($p['p_id'] ?? '', 36); check(rec('re_listings', $id) !== null, 'Listing not found.', 404);
        $key = hash('sha256', $u['id'] . '|' . $id);
        if (rec('re_saved', $key)) { del('re_saved', $key); return ['saved' => false]; }
        put('re_saved', ['id' => $key, 'listing_id' => $id], $u['id']); return ['saved' => true];
    }
    case 're_submit': {
        $u = need_user(); rate('re-submit:' . $u['id'], 10, 86400);
        $l = ['user_id' => $u['id'], 'username' => $u['username'],
            'kind' => enum_value($p['p_kind'] ?? '', RE_KINDS), 'deal' => enum_value($p['p_deal'] ?? '', RE_DEALS),
            'title' => text($p['p_title'] ?? '', 90), 'address' => text($p['p_address'] ?? '', 200), 'area' => text($p['p_area'] ?? '', 80), 'city' => text($p['p_city'] ?? '', 60),
            'owner_name' => text($p['p_owner_name'] ?? '', 80), 'owner_role' => enum_value($p['p_owner_role'] ?? 'owner', ['owner','agent']),
            'phone' => text($p['p_phone'] ?? '', 20), 'bhk' => text($p['p_bhk'] ?? '', 10), 'furnishing' => enum_value($p['p_furnishing'] ?? 'unfurnished', RE_FURNISH),
            'about' => text($p['p_about'] ?? '', 1200), 'proof' => text($p['p_proof'] ?? '', 400)];
        check($l['title'] !== '' && $l['address'] !== '' && $l['city'] !== '' && $l['owner_name'] !== '', 'Enter title, address, city and owner/agent name.');
        check(preg_match('/^[0-9+ ]{10,15}$/', $l['phone']) === 1, 'Enter a valid contact number.');
        foreach (['baths' => [0, 20], 'sqft' => [50, 1000000], 'price' => [1, 10000000000]] as $k => [$lo, $hi]) { $v = $p['p_' . $k] ?? null; check(is_int($v) && $v >= $lo && $v <= $hi, 'Enter a valid ' . ($k === 'sqft' ? 'area' : $k) . '.'); $l[$k] = $v; }
        $l['price_unit'] = $l['deal'] === 'sale' ? 'total' : 'month';
        $am = $p['p_amenities'] ?? []; check(is_array($am) && count($am) <= 20, 'Too many amenities.'); $l['amenities'] = array_values(array_map(fn($a) => text((string)$a, 30), $am));
        $l['photos'] = re_img_list($p['p_photos'] ?? null);
        check(($p['p_authorised'] ?? false) === true, 'Confirm you own this property or are authorised to list it.');
        foreach (['lat' => [-90, 90], 'lng' => [-180, 180]] as $k => [$lo, $hi]) { $v = $p['p_' . $k] ?? null; $l[$k] = is_numeric($v) && $v >= $lo && $v <= $hi ? round((float)$v, 5) : null; }
        $agent = rec('re_agents', $u['id']); $l['agent_id'] = $agent && ($agent['status'] ?? '') === 'verified' ? $agent['id'] : null;
        $l['dupe_key'] = re_dupe_key($l);
        $l['duplicate_of'] = null;
        foreach (rows('re_listings') as $x) if (($x['dupe_key'] ?? '') === $l['dupe_key'] && !in_array($x['status'], ['rejected','removed'], true)) { $l['duplicate_of'] = $x['id']; break; }
        $l['status'] = 'pending'; $l['reward'] = 'pending'; $l['reward_paise'] = re_reward_paise(); $l['reason'] = null;
        return put('re_listings', $l, $u['id']);
    }
    // Uploader marks the home as sold / rented (or available again). Only the person who listed it.
    case 're_mark': {
        $u = need_user(); $l = owned('re_listings', text($p['p_id'] ?? '', 36));
        check(($l['status'] ?? '') === 'approved', 'Only live listings can be marked.');
        $m = enum_value($p['p_market'] ?? '', ['available', 'sold', 'rented']);
        check($m !== 'sold' || $l['deal'] === 'sale', 'Only sale listings can be marked sold.');
        check($m !== 'rented' || $l['deal'] !== 'sale', 'Only rent/lease listings can be marked rented.');
        $l['market'] = $m; $l['market_at'] = now(); put('re_listings', $l, $u['id']); return $l;
    }
    case 're_mine': {
        $u = need_user();
        return ['listings' => array_reverse(rows('re_listings', $u['id'])), 'agent' => rec('re_agents', $u['id'])];
    }
    case 're_agent_apply': {
        $u = need_user();
        $old = rec('re_agents', $u['id']);
        $a = ($old ?? []) + ['id' => $u['id'], 'user_id' => $u['id'], 'username' => $u['username']];
        foreach (['name' => 80, 'agency' => 80, 'city' => 60, 'about' => 400] as $k => $max) $a[$k] = text($p['p_' . $k] ?? ($a[$k] ?? ''), $max);
        $a['phone'] = text($p['p_phone'] ?? ($a['phone'] ?? ''), 20); $a['whatsapp'] = text($p['p_whatsapp'] ?? ($a['whatsapp'] ?? $a['phone']), 20);
        check($a['name'] !== '' && $a['city'] !== '' && preg_match('/^[0-9+ ]{10,15}$/', $a['phone']) === 1, 'Enter your name, city and phone number.');
        $photo = text($p['p_photo'] ?? ($a['photo'] ?? ''), 400); check($photo === '' || (bool)preg_match('~^https://[^\s"<>]+$~', $photo), 'Invalid photo.'); $a['photo'] = $photo;
        if (($a['status'] ?? '') !== 'verified') $a['status'] = 'pending';
        $u2 = rec('profiles', $u['id']); if ($u2 && ($u2['account_type'] ?? '') !== 'business') { $u2['account_type'] = 'realestate'; put('profiles', $u2, $u2['id']); }
        return put('re_agents', $a, $u['id']);
    }
    }
    $admin = staff(true);
    switch ($name) {
    case 're_admin_get': {
        $all = array_reverse(rows('re_listings'));
        return ['listings' => $all, 'agents' => array_reverse(rows('re_agents')), 'enquiries' => array_slice(array_reverse(rows('re_enquiries')), 0, 200),
            'reward_paise' => re_reward_paise(), 'rewards' => array_values(array_filter($all, fn($l) => in_array($l['reward'] ?? '', ['credited','rejected'], true)))];
    }
    case 're_admin_listing': {
        $l = rec('re_listings', text($p['p_id'] ?? '', 36)); check($l !== null, 'Listing not found.', 404); $old = $l;
        check($l['user_id'] !== $admin['id'], 'You cannot review your own listing.');
        $act = enum_value($p['p_action'] ?? '', ['approve', 'reject', 'remove']);
        $reason = text($p['p_reason'] ?? '', 300);
        if ($act === 'approve') {
            check(($p['p_verified'] ?? false) === true, 'Confirm ownership/authorisation was verified.');
            $l['status'] = 'approved'; $l['approved_at'] = now(); $l['reason'] = null;
            $pay = ($p['p_reward'] ?? false) === true && empty($l['duplicate_of']) && ($l['reward'] ?? '') === 'pending';
            if ($pay && (int)$l['reward_paise'] > 0) {
                $eid = hash('sha256', 're-reward:' . $l['id']);
                if (!rec('earnings', $eid)) put('earnings', ['id' => $eid, 'user_id' => $l['user_id'], 'type' => 'bonus', 'post_id' => null, 'amount_paise' => (int)$l['reward_paise'], 'status' => 'approved',
                    'reference' => 're-reward:' . $l['id'], 'note' => 'Real estate listing reward · ' . $l['title'], 'reviewed_at' => now(), 'reviewed_by_username' => $admin['username']], $l['user_id']);
                $l['reward'] = 'credited'; $l['reward_at'] = now();
            } elseif (($l['reward'] ?? '') === 'pending') { $l['reward'] = 'rejected'; }
        } else {
            check($reason !== '', 'Enter a reason.');
            $l['status'] = $act === 'reject' ? 'rejected' : 'removed'; $l['reason'] = $reason;
            if (($l['reward'] ?? '') === 'pending') $l['reward'] = 'rejected';
        }
        put('re_listings', $l, $l['user_id']); log_action($name, 're_listing', $l['id'], $old, $l, $reason);
        $msg = $act === 'approve' ? ($l['reward'] === 'credited' ? 'Your property is live and ₹' . intdiv((int)$l['reward_paise'], 100) . ' was added to your earnings.' : 'Your property is now live.') : $reason;
        notification($l['user_id'], 'system', $act === 'approve' ? 'Property listing approved' : 'Property listing ' . ($act === 'reject' ? 'not approved' : 'removed'), $msg, '/real-estate?tab=mine');
        return $l;
    }
    case 're_admin_agent': {
        $a = rec('re_agents', text($p['p_id'] ?? '', 36)); check($a !== null, 'Agent not found.', 404); $old = $a;
        check($a['user_id'] !== $admin['id'], 'You cannot verify yourself.');
        $a['status'] = enum_value($p['p_status'] ?? '', ['verified', 'rejected', 'pending']); $a['verified_at'] = $a['status'] === 'verified' ? now() : null;
        put('re_agents', $a, $a['user_id']); log_action($name, 're_agent', $a['id'], $old, $a);
        notification($a['user_id'], 'system', $a['status'] === 'verified' ? 'You are a verified agent' : 'Agent profile update', $a['status'] === 'verified' ? 'Your agent profile now shows the verified badge on OJASSS Real Estate.' : 'Your agent profile was not verified.', '/real-estate');
        return $a;
    }
    case 're_admin_reward': {
        $v = $p['p_reward_paise'] ?? null; check(is_int($v) && $v >= 0 && $v <= 1000000, 'Reward must be ₹0–₹10,000.');
        put('settings', ['id' => 'realestate.reward_paise', 'key' => 'realestate.reward_paise', 'value' => $v, 'is_public' => false]); log_action($name, 'realestate', null, null, $v);
        return ['reward_paise' => $v];
    }
    }
    fail(404, 'NOT_FOUND', 'Unknown real estate operation.');
}
