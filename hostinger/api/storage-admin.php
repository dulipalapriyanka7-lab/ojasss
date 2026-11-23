<?php
declare(strict_types=1);
// Admin storage tools: usage report, temporary-file cleanup, and automatic video compression.
// Member uploads are never deleted here; only temporary files and old deploy copies are removed.

const STORAGE_COMPRESS_OVER = 100 * 1048576; // videos above 100 MB are compressed
const STORAGE_COMPRESS_TARGET = 50 * 1048576; // to roughly 50 MB, HD (720p)

function storage_dir_size(string $dir, int $budgetFiles = 200000): int {
    if (!is_dir($dir)) return 0;
    $total = 0; $n = 0;
    try {
        $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) { if ($f->isFile()) $total += $f->getSize(); if (++$n > $budgetFiles) break; }
    } catch (Throwable) { /* unreadable folder: report what was counted */ }
    return $total;
}

/** Folders that only hold temporary or replaceable files, with the rule for what may be removed. */
function storage_temp_targets(): array {
    global $config;
    $home = getenv('HOME') ?: dirname($config['private_dir'], 3);
    $p = $config['private_dir'];
    return [
        'video_downloads' => ['label' => 'Prepared video downloads (older than 1 hour)', 'glob' => [$p.'/video-downloads/*'], 'age' => 3600],
        'old_game_copies' => ['label' => 'Old Monster Fight copies (the newest backup is kept)', 'dirs' => glob($p.'/monster-fight.prev-v*') ?: [], 'keepNewest' => 1],
        'deploy_backups' => ['label' => 'Old website deploy backups (the newest 2 are kept)', 'dirs' => glob($home.'/ojasss-backup-v*') ?: [], 'keepNewest' => 2],
        'deploy_leftovers' => ['label' => 'Leftover upload archives', 'glob' => [$home.'/*.tgz', $home.'/*.tar'], 'age' => 3600],
        'php_tmp' => ['label' => 'Temporary files (older than 1 day)', 'glob' => [$home.'/tmp/*', $p.'/tmp/*'], 'age' => 86400],
    ];
}

function storage_temp_plan(): array {
    $plan = [];
    foreach (storage_temp_targets() as $key => $t) {
        $items = [];
        foreach ($t['glob'] ?? [] as $g) foreach (glob($g) ?: [] as $f) if (filemtime($f) < time() - ($t['age'] ?? 0)) $items[] = $f;
        if (isset($t['dirs'])) {
            $dirs = $t['dirs'];
            usort($dirs, fn($a, $b) => filemtime($b) <=> filemtime($a));
            $items = array_merge($items, array_slice($dirs, $t['keepNewest'] ?? 0));
        }
        $bytes = 0;
        foreach ($items as $f) $bytes += is_dir($f) ? storage_dir_size($f) : (int)@filesize($f);
        $plan[$key] = ['label' => $t['label'], 'items' => $items, 'bytes' => $bytes];
    }
    return $plan;
}

function storage_remove(string $path): void {
    if (is_link($path) || is_file($path)) { @unlink($path); return; }
    if (!is_dir($path)) return;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) $f->isDir() && !$f->isLink() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    @rmdir($path);
}

function storage_ffmpeg(): ?string {
    global $config;
    if (!function_exists('exec') || in_array('exec', array_map('trim', explode(',', (string)ini_get('disable_functions'))), true)) return null;
    $home = getenv('HOME') ?: dirname($config['private_dir'], 3);
    foreach ([$home.'/bin/ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'] as $bin) if (is_file($bin) && is_executable($bin)) return $bin;
    return null;
}

function storage_usage(): array {
    global $config;
    $byBucket = [];
    foreach (q("SELECT JSON_UNQUOTE(JSON_EXTRACT(data,'$.bucket')) b, COALESCE(SUM(CAST(JSON_EXTRACT(data,'$.size') AS UNSIGNED)),0) s, COUNT(*) n FROM oj_records WHERE kind='objects' GROUP BY b")->fetchAll(PDO::FETCH_ASSOC) as $r)
        $byBucket[] = ['bucket' => (string)$r['b'], 'bytes' => (int)$r['s'], 'files' => (int)$r['n']];
    $uploads = array_sum(array_column($byBucket, 'bytes'));
    $plan = storage_temp_plan();
    $temp = array_sum(array_column($plan, 'bytes'));
    $limitGb = (int)setting('storage.plan_gb', 100);
    $big = (int)q("SELECT COUNT(*) FROM oj_records WHERE kind='objects' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.mime_type')) LIKE 'video/%' AND CAST(JSON_EXTRACT(data,'$.size') AS UNSIGNED)>? AND JSON_EXTRACT(data,'$.compressed') IS NULL", [STORAGE_COMPRESS_OVER])->fetchColumn();
    return [
        'uploads_bytes' => $uploads, 'buckets' => $byBucket,
        'temp_bytes' => $temp,
        'temp' => array_map(fn($k, $v) => ['key' => $k, 'label' => $v['label'], 'bytes' => $v['bytes'], 'count' => count($v['items'])], array_keys($plan), $plan),
        'game_bytes' => storage_dir_size($config['private_dir'].'/monster-fight'),
        'plan_bytes' => $limitGb * 1073741824,
        'disk_free_bytes' => (int)(@disk_free_space($config['private_dir']) ?: 0),
        'compression' => ['available' => storage_ffmpeg() !== null, 'waiting' => $big, 'over_mb' => 100, 'target_mb' => 50],
        'checked_at' => now(),
    ];
}

function storage_admin_rpc(string $name, array $p): array {
    $admin = staff(true);
    if ($name === 'admin_storage_usage') return storage_usage();
    if ($name === 'admin_storage_cleanup') {
        check(($p['p_confirm'] ?? false) === true, 'Confirm the cleanup first.');
        $plan = storage_temp_plan(); $freed = 0; $removed = 0;
        foreach ($plan as $t) foreach ($t['items'] as $f) {
            $size = is_dir($f) ? storage_dir_size($f) : (int)@filesize($f);
            storage_remove($f);
            if (!file_exists($f)) { $freed += $size; $removed++; }
        }
        log_action($name, 'storage', null, null, ['freed_bytes' => $freed, 'removed' => $removed], 'Temporary storage cleanup');
        return ['freed_bytes' => $freed, 'removed' => $removed, 'usage' => storage_usage()];
    }
    if ($name === 'admin_storage_plan') {
        $gb = $p['p_plan_gb'] ?? null;
        check(is_int($gb) && $gb >= 1 && $gb <= 10000, 'Enter your hosting plan size in GB.');
        put('settings', ['id' => 'storage.plan_gb', 'key' => 'storage.plan_gb', 'value' => $gb, 'is_public' => false]);
        log_action($name, 'storage', null, null, ['plan_gb' => $gb], '');
        return storage_usage();
    }
    fail(404, 'NOT_FOUND', 'Storage operation not found.');
}

/** CLI: compress one waiting video (over 100 MB) to about 50 MB in 720p H.264. Same file name, so links keep working. */
function storage_compress_next(): string {
    global $config;
    $ff = storage_ffmpeg();
    if ($ff === null) return 'ffmpeg not available';
    $row = q("SELECT data FROM oj_records WHERE kind='objects' AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.mime_type')) LIKE 'video/%' AND CAST(JSON_EXTRACT(data,'$.size') AS UNSIGNED)>? AND JSON_EXTRACT(data,'$.compressed') IS NULL ORDER BY created_at DESC LIMIT 1", [STORAGE_COMPRESS_OVER])->fetchColumn();
    if (!$row) return 'nothing to compress';
    $o = json_decode($row, true, 512, JSON_THROW_ON_ERROR);
    $src = $o['disk_path'] ?? '';
    if (!is_file($src)) { $o['compressed'] = 'missing'; put('objects', $o, $o['user_id']); return 'source missing'; }
    $probe = dirname($ff).'/ffprobe';
    $dur = 0.0;
    if (is_file($probe)) { $out = []; exec(escapeshellarg($probe).' -v error -show_entries format=duration -of csv=p=0 '.escapeshellarg($src), $out); $dur = (float)($out[0] ?? 0); }
    if ($dur <= 0) $dur = 60.0;
    // bitrate that lands near 50 MB, never above 5 Mbit/s and never below 600 kbit/s
    $videoK = (int)max(600, min(5000, (STORAGE_COMPRESS_TARGET * 8 / 1000 / $dur) - 128));
    $tmp = $src.'.compressing.mp4';
    $scale = "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'";
    $cmd = escapeshellarg($ff).' -y -v error -i '.escapeshellarg($src).' -vf '.escapeshellarg($scale).' -c:v libx264 -preset veryfast -b:v '.$videoK.'k -maxrate '.(int)($videoK * 1.3).'k -bufsize '.($videoK * 2).'k -c:a aac -b:a 128k -movflags +faststart '.escapeshellarg($tmp).' 2>&1';
    $out = []; $code = 0; exec($cmd, $out, $code);
    if ($code !== 0 || !is_file($tmp) || filesize($tmp) < 1024) { @unlink($tmp); $o['compressed'] = 'failed'; put('objects', $o, $o['user_id']); return 'ffmpeg failed: '.implode(' ', array_slice($out, -2)); }
    $newSize = filesize($tmp);
    if ($newSize >= $o['size']) { @unlink($tmp); $o['compressed'] = 'kept_original'; put('objects', $o, $o['user_id']); return 'original was smaller'; }
    if (!rename($tmp, $src)) { @unlink($tmp); return 'could not replace file'; }
    $o['original_size'] = $o['size']; $o['size'] = $newSize; $o['mime_type'] = 'video/mp4'; $o['compressed'] = now();
    put('objects', $o, $o['user_id']);
    return 'compressed '.round($o['original_size'] / 1048576).' MB -> '.round($newSize / 1048576).' MB';
}
