import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, Clapperboard, Flag, Flame, Image as ImageIcon, IndianRupee, Rocket, Scale, ShieldAlert,
  Trash2, UserPlus, Users, Wallet,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { admin, type Metric } from '@/api/admin';
import { Kpi, RangePicker, rangeFor, SectionTitle, type Range } from '@/components/admin/AdminUI';
import { StorageAdminPanel } from '@/components/admin/StorageAdminPanel';
import { Card, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { Select } from '@/components/ui/Field';
import { useAuth } from '@/hooks/useAuth';
import { count, rupees } from '@/lib/format';

const Charts = {
  Trend: lazy(() => import('@/components/admin/AdminCharts').then((m) => ({ default: m.TrendChart }))),
  Breakdown: lazy(() => import('@/components/admin/AdminCharts').then((m) => ({ default: m.BreakdownBars }))),
};

function bucketFor(r: Range): 'hour' | 'day' | 'week' {
  const days = (new Date(r.to).getTime() - new Date(r.from).getTime()) / 86_400_000;
  return days <= 2 ? 'hour' : days <= 120 ? 'day' : 'week';
}

function Trend({ metric, range, title, money, color }: { metric: Metric; range: Range; title: string; money?: boolean; color?: string }) {
  const bucket = bucketFor(range);
  const q = useQuery({ queryKey: ['admin', 'ts', metric, range.from, range.to, bucket], queryFn: () => admin.timeseries(metric, range.from, range.to, bucket) });
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} compact />
        : !q.data ? <Skeleton className="h-56 rounded-xl" />
        : (
          <Suspense fallback={<Skeleton className="h-56 rounded-xl" />}>
            <Charts.Trend data={q.data} bucket={bucket} name={title} color={color} format={money ? (v) => rupees(v).replace('.00', '') : (v) => count(v)} />
          </Suspense>
        )}
    </Card>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [range, setRange] = useState<Range>(() => rangeFor('7d'));
  const q = useQuery({ queryKey: ['admin', 'dashboard', range.from, range.to], queryFn: () => admin.dashboard(range.from, range.to), refetchInterval: 60_000 });
  const d = q.data;

  return (
    <>
      <SectionTitle title="Dashboard" description="Live platform health from the production database." actions={<RangePicker value={range} onChange={setRange} />} />
      {isAdmin && <StorageAdminPanel />}
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !d ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : (
        <>
          {Number(d.child_safety_open) > 0 && (
            <button type="button" onClick={() => navigate('/admin/safety')} className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-danger/40 bg-danger-soft p-4 text-left text-danger">
              <ShieldAlert aria-hidden size={22} />
              <span className="flex-1 font-semibold">{d.child_safety_open} child-safety report{Number(d.child_safety_open) === 1 ? '' : 's'} need immediate review</span>
              <span className="text-sm font-semibold underline">Review now</span>
            </button>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi label="Total users" value={count(d.total_users)} icon={Users} hint={`${count(d.suspended_users)} restricted`} onClick={() => navigate('/admin/users')} />
            <Kpi label="Active users" value={count(d.active_users)} icon={Activity} tone="success" hint="In selected range" />
            <Kpi label="New users" value={count(d.new_users)} icon={UserPlus} tone="brand" hint="In selected range" />
            <Kpi label="Videos" value={count(d.videos)} icon={Clapperboard} onClick={() => navigate('/admin/videos')} hint={`${count(d.new_posts)} new posts in range`} />
            <Kpi label="Posters" value={count(d.posters)} icon={ImageIcon} onClick={() => navigate('/admin/posters')} hint={`${count(d.pending_review)} awaiting review`} />
            <Kpi label="Open complaints" value={count(d.complaints_open)} icon={Scale} tone={Number(d.complaints_open) ? 'warning' : 'neutral'} onClick={() => navigate('/admin/complaints')} hint={`${count(d.complaints_total)} total`} />
            <Kpi label="Open reports" value={count(d.reports_open)} icon={Flag} tone={Number(d.reports_open) ? 'danger' : 'neutral'} onClick={() => navigate('/admin/reports')} />
            <Kpi label="Engagement" value={count(d.engagements)} icon={Flame} hint={`${count(d.viral_posts)} went viral · ${count(d.cta_clicks)} CTA clicks`} />
            {isAdmin && <Kpi label="Pending withdrawals" value={count(d.pending_withdrawals)} icon={Wallet} tone={Number(d.pending_withdrawals) ? 'warning' : 'neutral'} hint={rupees(d.pending_withdrawals_paise)} onClick={() => navigate('/admin/withdrawals')} />}
            {isAdmin && <Kpi label="Total earnings" value={rupees(d.total_earnings_paise)} icon={IndianRupee} tone="success" hint={`${count(d.pending_earnings)} rewards pending review`} onClick={() => navigate('/admin/earnings')} />}
          </div>
          {(Number(d.deletion_requests_open) > 0 || Number(d.pending_review) > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Number(d.pending_review) > 0 && <button type="button" onClick={() => navigate('/admin/videos?status=pending_review')} className="inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1.5 text-xs font-semibold text-warning"><AlertTriangle aria-hidden size={14} />{d.pending_review} posts awaiting review</button>}
              {isAdmin && Number(d.deletion_requests_open) > 0 && <button type="button" onClick={() => navigate('/admin/deletion')} className="inline-flex items-center gap-2 rounded-full bg-info-soft px-3 py-1.5 text-xs font-semibold text-info"><Trash2 aria-hidden size={14} />{d.deletion_requests_open} deletion requests</button>}
            </div>
          )}
        </>
      )}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Trend metric="users" range={range} title="New users" color="var(--info)" />
        <Trend metric="engagements" range={range} title="Engagement (new reactions)" color="var(--hot)" />
        <Trend metric="posts" range={range} title="New posts" color="var(--brand)" />
        {isAdmin ? <Trend metric="earnings_paise" range={range} title="Rewards created" money color="var(--success)" /> : <Trend metric="reports" range={range} title="Reports" color="var(--danger)" />}
      </div>
    </>
  );
}

const METRICS: Array<{ value: Metric; label: string; money?: boolean; adminOnly?: boolean }> = [
  { value: 'users', label: 'User growth' },
  { value: 'active_users', label: 'Active users (by last activity)' },
  { value: 'posts', label: 'Content growth (all posts)' },
  { value: 'videos', label: 'Videos' },
  { value: 'posters', label: 'Posters' },
  { value: 'engagements', label: 'Engagement' },
  { value: 'viral', label: 'Viral content' },
  { value: 'cta_clicks', label: 'CTA clicks' },
  { value: 'earnings_paise', label: 'Revenue share / rewards (₹)', money: true, adminOnly: true },
  { value: 'withdrawals_paise', label: 'Withdrawals paid (₹)', money: true, adminOnly: true },
  { value: 'reports', label: 'Reports' },
  { value: 'complaints', label: 'Complaints' },
];

export function AdminAnalytics() {
  const { isAdmin } = useAuth();
  const [range, setRange] = useState<Range>(() => rangeFor('30d'));
  const [metric, setMetric] = useState<Metric>('users');
  const m = METRICS.find((x) => x.value === metric)!;
  const b = useQuery({ queryKey: ['admin', 'breakdowns', range.from, range.to], queryFn: () => admin.breakdowns(range.from, range.to) });
  const data = b.data as undefined | Record<string, Record<string, number>> & { top_viral: Array<{ id: string; caption: string; username: string; viral_count: number }> };

  return (
    <>
      <SectionTitle title="Analytics" description="Aggregated directly from platform data. No sampled or estimated figures." actions={<RangePicker value={range} onChange={setRange} />} />
      <Card className="mb-4 p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="metric" className="text-sm font-semibold">Metric</label>
          <Select id="metric" value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="!h-10 w-72 max-w-full text-sm">
            {METRICS.filter((x) => !x.adminOnly || isAdmin).map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </Select>
        </div>
        <Trend metric={metric} range={range} title={m.label} money={m.money} />
      </Card>
      {b.isError ? <ErrorState error={b.error} onRetry={() => void b.refetch()} compact /> : !data ? <Skeleton className="h-64 rounded-2xl" /> : (
        <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 sm:p-5"><h2 className="mb-3 text-sm font-semibold">Posts by category</h2><Charts.Breakdown data={data.posts_by_category} name="Posts" /></Card>
            <Card className="p-4 sm:p-5"><h2 className="mb-3 text-sm font-semibold">CTA clicks by type</h2><Charts.Breakdown data={data.cta_by_type} name="Clicks" /></Card>
            <Card className="p-4 sm:p-5"><h2 className="mb-3 text-sm font-semibold">Reports by reason</h2><Charts.Breakdown data={data.reports_by_reason} name="Reports" /></Card>
            <Card className="p-4 sm:p-5"><h2 className="mb-3 text-sm font-semibold">Complaints by status</h2><Charts.Breakdown data={data.complaints_by_status} name="Complaints" /></Card>
            {isAdmin && <Card className="p-4 sm:p-5"><h2 className="mb-3 text-sm font-semibold">Rewards by type</h2><Charts.Breakdown data={data.earnings_by_type} name="Rewards" format={(v) => rupees(v)} /></Card>}
            {isAdmin && <Card className="p-4 sm:p-5"><h2 className="mb-3 text-sm font-semibold">Withdrawals by status</h2><Charts.Breakdown data={data.withdrawals_by_status} name="Withdrawals" /></Card>}
            <Card className="p-4 sm:p-5 lg:col-span-2">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Rocket aria-hidden size={16} className="text-viral" />Top viral content</h2>
              {data.top_viral.length === 0 ? <p className="py-6 text-center text-sm text-fg-3">No posts went viral in this range.</p> : (
                <ol className="divide-y divide-line">
                  {data.top_viral.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <span className="w-6 text-fg-3 tabular">{i + 1}</span>
                      <a href={`/post/${p.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{p.caption || 'Untitled'} <span className="text-fg-3">· @{p.username}</span></a>
                      <span className="font-semibold tabular">{count(p.viral_count)} VIRAL</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </Suspense>
      )}
    </>
  );
}
