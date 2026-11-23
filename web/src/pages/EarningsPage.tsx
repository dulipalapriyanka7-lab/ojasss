import { MemberTasks } from '@/pages/MemberProgram';
import { WeeklyUsageCard } from '@/pages/WeeklyUsage';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Clock, Flame, Gift, IndianRupee, Info, MousePointerClick, PiggyBank, Rocket, Sparkles, Wallet } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { earnings, withdrawals, type Earning, type EarningType } from '@/api';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, EmptyState, ErrorState, Skeleton, StatusBadge } from '@/components/ui/Feedback';
import { Segmented, Stat, Tabs } from '@/components/ui/Misc';
import { ConfirmDialog } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { usePublicSettings } from '@/hooks/usePostActions';
import { date, dateTime, rupees } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import { useSeo } from '@/lib/seo';

const EarningsChart = lazy(() => import('@/components/EarningsChart'));

const TYPE_META: Record<EarningType, { label: string; icon: typeof Rocket; tone: string }> = {
  viral: { label: 'Viral reward', icon: Rocket, tone: 'bg-viral-soft text-viral' },
  cta_click: { label: 'CTA click', icon: MousePointerClick, tone: 'bg-info-soft text-info' },
  bonus: { label: 'Bonus', icon: Sparkles, tone: 'bg-brand-soft text-brand-ink' },
  referral: { label: 'Referral', icon: Gift, tone: 'bg-success-soft text-success' },
};

function Transactions() {
  const [type, setType] = useState<'all' | EarningType>('all');
  const q = useInfiniteQuery({
    queryKey: ['earnings', 'list', type],
    queryFn: ({ pageParam }) => earnings.list({ limit: 25, offset: pageParam, type: type === 'all' ? null : type }),
    initialPageParam: 0,
    getNextPageParam: (last: Earning[], all) => (last.length < 25 ? undefined : all.flat().length),
  });
  const items = q.data?.pages.flat() ?? [];
  return (
    <div>
      <Segmented
        label="Transaction type"
        size="sm"
        value={type}
        onChange={setType}
        className="mb-3 max-w-full overflow-x-auto"
        items={[{ value: 'all', label: 'All' }, { value: 'viral', label: 'Viral' }, { value: 'cta_click', label: 'CTA' }, { value: 'referral', label: 'Referral' }, { value: 'bonus', label: 'Bonus' }]}
      />
      {q.isPending ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
      ) : items.length === 0 ? (
        <EmptyState icon={PiggyBank} title="No earnings yet" description="When your posts go VIRAL or people tap your call-to-action, rewards show up here." action={<ButtonLink to="/upload">Create a post</ButtonLink>} compact />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {items.map((e) => {
            const meta = TYPE_META[e.type];
            const thumb = mediaUrl(e.post?.thumbnail_path);
            return (
              <li key={e.id} className="flex items-center gap-3 p-3 sm:p-4">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}><meta.icon aria-hidden size={20} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{meta.label}</p>
                  <p className="truncate text-xs text-fg-3">
                    {e.post ? <Link to={`/post/${e.post.id}`} className="hover:underline">{e.post.caption || 'Your post'}</Link> : e.note ?? '—'}
                  </p>
                  <p className="text-xs text-fg-3">{dateTime(e.created_at)} · Ref {e.reference}</p>
                </div>
                {thumb && <img src={thumb} alt="" className="hidden size-11 rounded-lg object-cover sm:block" loading="lazy" />}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-display font-semibold tabular">{rupees(e.amount_paise)}</span>
                  <StatusBadge status={e.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {q.hasNextPage && <Button variant="ghost" className="mt-3 w-full" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button>}
    </div>
  );
}

function WithdrawalHistory() {
  const qc = useQueryClient();
  const toast = useToast();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['earnings', 'withdrawals'], queryFn: () => withdrawals.list({ limit: 50 }) });
  if (q.isPending) return <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />;
  if (q.data.length === 0) {
    return <EmptyState icon={Wallet} title="No withdrawals yet" description="Once your approved balance reaches the minimum, you can withdraw to UPI or your bank." compact />;
  }
  return (
    <>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {q.data.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-2"><ArrowUpRight aria-hidden size={20} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{w.payout_method === 'upi' ? 'UPI' : 'Bank transfer'} · {w.payout_masked}</p>
              <p className="text-xs text-fg-3">Requested {dateTime(w.created_at)}{w.paid_at ? ` · Paid ${date(w.paid_at)}` : ''}</p>
              {w.payment_reference && <p className="text-xs text-fg-3">UTR / Ref: <span className="font-mono">{w.payment_reference}</span></p>}
              {w.note && <p className="mt-1 text-xs text-danger">{w.note}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-display font-semibold tabular">{rupees(w.amount_paise)}</span>
              <StatusBadge status={w.status} />
            </div>
            {w.status === 'requested' && <Button variant="ghost" size="sm" onClick={() => setCancelId(w.id)}>Cancel</Button>}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        title="Cancel this withdrawal?"
        description="The amount returns to your available balance immediately."
        confirmLabel="Cancel withdrawal"
        tone="danger"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          try {
            await withdrawals.cancel(cancelId!);
            toast.success('Withdrawal cancelled');
            setCancelId(null);
            await qc.invalidateQueries({ queryKey: ['earnings'] });
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

export default function EarningsPage() {
  useSeo({ title: 'Earnings', noindex: true });
  const [bucket, setBucket] = useState<'day' | 'week' | 'month'>('day');
  const [tab, setTab] = useState<'transactions' | 'withdrawals'>('transactions');
  const { data: settings } = usePublicSettings();
  const wallet = useQuery({ queryKey: ['earnings', 'wallet'], queryFn: earnings.wallet });
  const series = useQuery({
    queryKey: ['earnings', 'series', bucket],
    queryFn: () => earnings.series(bucket, bucket === 'day' ? 30 : bucket === 'week' ? 12 : 12),
  });
  const w = wallet.data;
  const canWithdraw = !!w && Number(w.available_paise) >= Number(w.min_withdrawal_paise) && Number(w.in_process_paise) === 0;

  return (
    <Page width="lg">
      <PageHeader
        title="Earnings"
        description="Rewards are calculated and reviewed by OJASSS. Approved rewards become available to withdraw."
        actions={<ButtonLink to="/earnings/withdraw" leading={<Wallet aria-hidden size={18} />} aria-disabled={!canWithdraw} className={!canWithdraw ? 'pointer-events-none opacity-50' : ''}>Withdraw</ButtonLink>}
      />

      <WeeklyUsageCard />
      <div id="tasks" ref={el=>{if(el&&window.location.hash==='#tasks')window.setTimeout(()=>el.scrollIntoView({behavior:'smooth',block:'start'}),300);}} className="scroll-mt-20"><MemberTasks /></div>
      {wallet.isError ? (
        <ErrorState error={wallet.error} onRetry={() => void wallet.refetch()} />
      ) : (
        <>
          <div className="relative mb-4 overflow-hidden rounded-3xl bg-[#14121b] p-6 text-white shadow-float sm:p-8">
            <div aria-hidden className="absolute -top-24 -right-16 size-72 rounded-full bg-[#ff7a1a] opacity-30 blur-3xl" />
            <div aria-hidden className="absolute -bottom-28 left-10 size-72 rounded-full bg-[#e0337a] opacity-25 blur-3xl" />
            <p className="relative text-sm font-medium text-white/70">Available to withdraw</p>
            {w ? <p className="relative mt-1 font-display text-4xl font-bold tabular sm:text-5xl">{rupees(w.available_paise)}</p> : <Skeleton className="relative mt-2 h-12 w-48 !bg-white/10" />}
            <p className="relative mt-3 text-sm text-white/70">
              {w && Number(w.in_process_paise) > 0
                ? <>{rupees(w.in_process_paise)} is being processed.</>
                : w ? <>Minimum withdrawal {rupees(w.min_withdrawal_paise)}.</> : ' '}
            </p>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {w ? (
              <>
                <Stat label="Received" value={rupees(w.lifetime_paise)} icon={<IndianRupee aria-hidden size={16} className="text-fg-3" />} hint="Approved rewards received" />
                <Stat label="Pending" value={rupees(w.pending_paise)} icon={<Clock aria-hidden size={16} className="text-warning" />} hint="Awaiting review" />
                <Stat label="Paid to you" value={rupees(w.withdrawn_paise)} icon={<ArrowUpRight aria-hidden size={16} className="text-success" />} hint="Completed payouts" />
                <Stat label="This month" value={rupees(w.this_month_paise)} icon={<Sparkles aria-hidden size={16} className="text-brand" />} hint="Approved + pending" />
              </>
            ) : Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        </>
      )}

      <Card className="mb-8 p-4 sm:p-6" as="section">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Earnings over time</h2>
          <Segmented label="Chart period" size="sm" value={bucket} onChange={setBucket} items={[{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} />
        </div>
        {series.isError ? (
          <ErrorState error={series.error} onRetry={() => void series.refetch()} compact />
        ) : series.data ? (
          <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}><EarningsChart data={series.data} bucket={bucket} /></Suspense>
        ) : <Skeleton className="h-64 rounded-xl" />}
      </Card>

      <Card className="mb-8 p-4 sm:p-6" as="section">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Info aria-hidden size={18} className="text-fg-3" /> How rewards work</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          <li className="rounded-2xl bg-hot-soft p-4"><Flame aria-hidden className="text-hot" size={22} /><p className="mt-2 text-sm font-semibold">1 · Reach 10 Fires</p><p className="text-xs text-fg-2">Members like your posts with the Fire button.</p></li>
          <li className="rounded-2xl bg-speak-soft p-4"><Sparkles aria-hidden className="text-speak" size={22} /><p className="mt-2 text-sm font-semibold">2 · Reach 10 Shares</p><p className="text-xs text-fg-2">Together with 10 Fires, this automatically makes your post Viral.</p></li>
          <li className="rounded-2xl bg-viral-soft p-4"><Rocket aria-hidden className="text-viral" size={22} /><p className="mt-2 text-sm font-semibold">3 · Automatic VIRAL · {rupees(settings?.['rewards.viral_paise'] ?? 5000)}</p><p className="text-xs text-fg-2">Your post appears in One Chance automatically. Any configured reward is reviewed by our team.</p></li>
        </ol>
        <p className="mt-3 text-xs text-fg-3">Unique CTA clicks earn {rupees(settings?.['rewards.cta_click_paise'] ?? 50)} each. Rewards obtained through fake accounts or artificial engagement are reversed. See the <Link to="/earnings-terms" className="font-semibold underline">earnings terms</Link>.</p>
      </Card>

      <Tabs label="Earnings history" value={tab} onChange={setTab} items={[{ value: 'transactions', label: 'Transactions' }, { value: 'withdrawals', label: 'Withdrawals' }]} className="mb-4" />
      {tab === 'transactions' ? <Transactions /> : <WithdrawalHistory />}
    </Page>
  );
}
