import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { admin, type StorageUsage } from '@/api/admin';
import { Button } from '@/components/ui/Button';
import { Card, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';

const size = (b: number) => b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB';
const BUCKET: Record<string, string> = { media: 'Videos & posters', avatars: 'Profile pictures', receipts: 'Payment receipts', voices: 'Voice & chat', chat: 'Chat files' };

/** Storage usage for the admin dashboard; `tools` adds the temporary-file cleanup and plan size. */
export function StorageAdminPanel({ tools = false }: { tools?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin', 'storage'], queryFn: admin.storageUsage, refetchInterval: 120_000, staleTime: 60_000 });
  const [confirm, setConfirm] = useState(false);
  const [planGb, setPlanGb] = useState('');
  const set = (u: StorageUsage) => qc.setQueryData(['admin', 'storage'], u);
  const clean = useMutation({
    mutationFn: admin.storageCleanup,
    onSuccess: (r) => { set(r.usage); setConfirm(false); toast.success(`Freed ${size(r.freed_bytes)} (${r.removed} items)`); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Cleanup failed'),
  });
  const plan = useMutation({
    mutationFn: (gb: number) => admin.storagePlan(gb),
    onSuccess: (u) => { set(u); setPlanGb(''); toast.success('Plan size saved'); },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save'),
  });

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />;
  if (!q.data) return <Skeleton className="mb-4 h-32 rounded-2xl" />;
  const u = q.data;
  const used = u.uploads_bytes + u.temp_bytes + u.game_bytes;
  const pct = u.plan_bytes > 0 ? Math.min(100, (used / u.plan_bytes) * 100) : 0;
  const tone = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-400' : 'bg-gradient-to-r from-fuchsia-500 to-orange-400';

  return (
    <Card className="mb-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><HardDrive size={16} aria-hidden className="text-brand" />Storage</h2>
        <span className="text-xs text-fg-3">{size(used)} of {size(u.plan_bytes)} plan · {pct.toFixed(0)}%</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
        <div className={`h-full rounded-full ${tone}`} style={{ width: pct + '%' }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {u.buckets.filter((b) => b.bytes > 0).sort((a, b) => b.bytes - a.bytes).map((b) => (
          <div key={b.bucket} className="rounded-lg bg-white/5 px-2.5 py-2"><dt className="text-fg-3">{BUCKET[b.bucket] ?? b.bucket}</dt><dd className="font-semibold">{size(b.bytes)} <span className="font-normal text-fg-3">· {b.files} files</span></dd></div>
        ))}
        <div className="rounded-lg bg-white/5 px-2.5 py-2"><dt className="text-fg-3">Game files</dt><dd className="font-semibold">{size(u.game_bytes)}</dd></div>
        <div className="rounded-lg bg-white/5 px-2.5 py-2"><dt className="text-fg-3">Temporary (can be freed)</dt><dd className="font-semibold">{size(u.temp_bytes)}</dd></div>
      </dl>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-fg-3">
        <Sparkles size={13} aria-hidden className="mt-0.5 shrink-0 text-viral" />
        {u.compression.available
          ? <>Videos over {u.compression.over_mb} MB are compressed automatically to about {u.compression.target_mb} MB HD. {u.compression.waiting} waiting.</>
          : <>Automatic compression is off: the video tool (ffmpeg) is not installed on the server. {u.compression.waiting} videos over {u.compression.over_mb} MB.</>}
      </p>
      {tools && (
        <div className="mt-4 border-t border-line pt-4">
          <ul className="mb-3 space-y-1 text-xs">
            {u.temp.map((t) => <li key={t.key} className="flex justify-between gap-2"><span className="text-fg-2">{t.label}</span><span className="shrink-0 font-semibold">{t.count ? size(t.bytes) : '—'}</span></li>)}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <Button size="sm" variant="secondary" disabled={u.temp_bytes === 0} onClick={() => setConfirm(true)}><Trash2 size={14} aria-hidden />Free {size(u.temp_bytes)}</Button>
            <form className="ml-auto flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const n = Number(planGb); if (Number.isInteger(n) && n > 0) plan.mutate(n); }}>
              <label htmlFor="plan-gb" className="text-xs text-fg-3">Hosting plan (GB)</label>
              <Input id="plan-gb" inputMode="numeric" className="!h-9 w-20 text-sm" placeholder={String(Math.round(u.plan_bytes / 1073741824))} value={planGb} onChange={(e) => setPlanGb(e.target.value.replace(/\D/g, ''))} />
              <Button size="sm" type="submit" loading={plan.isPending} disabled={!planGb}>Save</Button>
            </form>
          </div>
          <p className="mt-2 text-[11px] text-fg-3">Only temporary files and old deploy copies are removed. Member uploads are never touched.</p>
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Free temporary storage?"
        description={`This permanently removes ${size(u.temp_bytes)} of temporary files and old backup copies (the newest backups are kept). Member videos and pictures are not touched.`}
        confirmLabel="Free space" loading={clean.isPending} onConfirm={() => clean.mutate()} />
    </Card>
  );
}
