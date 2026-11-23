<?php
declare(strict_types=1);
/** Private user feedback: members submit, only admins read/manage. Attachments live in the private
 *  receipts bucket (owner + admin visible). The user is always taken from the session, never the client. */

const FB_CATS = ['suggestion','feature','bug','complaint','other'];
const FB_STATUS = ['new','review','resolved','closed'];

function fb_out(array $f, bool $admin): array {
    $keep = ['id','category','subject','message','attachment_path','status','created_at','updated_at'];
    if ($admin) { $keep = array_merge($keep, ['user_id','username','display_name','admin_notes','assigned_to','ref']); }
    return array_intersect_key($f, array_flip($keep)) + ['ref' => $f['ref'] ?? null];
}

function feedback_rpc(string $name, array $p): array {
    if ($name === 'feedback_submit') {
        $u = need_user();
        rate('feedback:' . $u['id'], 5, 86400);
        rate('feedback-burst:' . $u['id'], 2, 120);
        $cat = enum_value($p['p_category'] ?? '', FB_CATS);
        $subject = text($p['p_subject'] ?? '', 100); $message = text($p['p_message'] ?? '', 1000);
        check(mb_strlen($subject) >= 3, 'Enter a subject (at least 3 characters).');
        check(mb_strlen($message) >= 10, 'Write at least 10 characters.');
        $path = text($p['p_attachment'] ?? '', 200);
        if ($path !== '') {
            check((bool)preg_match('~^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$~i', $path), 'Invalid attachment.');
            $o = rec('objects', hash('sha256', 'receipts/' . $path));
            check($o && $o['user_id'] === $u['id'] && $o['bucket'] === 'receipts' && str_starts_with($o['mime_type'], 'image/'), 'Attachment upload not found.');
        }
        $id = uid();
        $f = put('user_feedback', ['id' => $id, 'ref' => 'FB' . strtoupper(substr(str_replace('-', '', $id), 0, 8)),
            'user_id' => $u['id'], 'username' => $u['username'], 'display_name' => $u['display_name'] ?? $u['username'],
            'category' => $cat, 'subject' => $subject, 'message' => $message, 'attachment_path' => $path ?: null,
            'status' => 'new', 'admin_notes' => '', 'assigned_to' => null], $u['id']);
        return ['ok' => true, 'ref' => $f['ref']];
    }
    if ($name === 'feedback_mine') {
        $u = need_user();
        return array_map(fn($f) => fb_out($f, false), array_reverse(rows('user_feedback', $u['id'])));
    }
    $admin = staff(true);
    if ($name === 'feedback_admin_list') {
        $st = (string)($p['p_status'] ?? ''); $q = mb_strtolower(trim((string)($p['p_q'] ?? '')));
        $all = array_reverse(rows('user_feedback'));
        $out = [];
        foreach ($all as $f) {
            if ($st !== '' && $f['status'] !== $st) continue;
            if ($q !== '' && !str_contains(mb_strtolower($f['subject'] . ' ' . $f['message'] . ' ' . $f['username'] . ' ' . ($f['ref'] ?? '')), $q)) continue;
            $out[] = fb_out($f, true);
        }
        $counts = array_fill_keys(FB_STATUS, 0); foreach ($all as $f) $counts[$f['status']] = ($counts[$f['status']] ?? 0) + 1;
        return ['items' => array_slice($out, 0, 300), 'counts' => $counts, 'total' => count($all)];
    }
    if ($name === 'feedback_admin_update') {
        $f = rec('user_feedback', text($p['p_id'] ?? '', 36)); check($f !== null, 'Feedback not found.', 404); $old = $f;
        if (isset($p['p_status'])) $f['status'] = enum_value($p['p_status'], FB_STATUS);
        if (isset($p['p_notes'])) $f['admin_notes'] = text($p['p_notes'], 2000);
        if (($p['p_assign_me'] ?? false) === true) $f['assigned_to'] = $admin['username'];
        put('user_feedback', $f, $f['user_id']); log_action($name, 'user_feedback', $f['id'], ['status' => $old['status']], ['status' => $f['status']]);
        return fb_out($f, true);
    }
    fail(404, 'NOT_FOUND', 'Unknown feedback operation.');
}
