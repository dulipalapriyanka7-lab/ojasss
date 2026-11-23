import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, Flag, ShieldAlert, ShieldCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { admin, type AdminReportRow } from '@/api/admin';
import { DataTable, FilterBar, FilterSelect, KV, Kpi, Pager, SectionTitle, type Column } from '@/components/admin/AdminUI';
import { Button } from '@/components/ui/Button';
import { Card, ErrorState, Skeleton, StatusBadge } from '@/components/ui/Feedback';
import { ConfirmDialog, Drawer } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { REPORT_REASONS } from '@/lib/constants';
import { count, date, dateTime, humanize, timeAgo } from '@/lib/format';

const LIMIT = 25;
type Pending = { action: string; title: string; tone: 'danger' | 'primary'; reasonRequired: boolean };

function targetLink(r: AdminReportRow): string | null {
  if (r.target_type === 'post') return `/post/${r.target_id}`;
  if (r.target_type === 'user' && r.reported_username) return `/profile/${r.reported_username}`;
  return null;
}

function ReportDrawer({ report, onClose }: { report: AdminReportRow; onClose: () => void }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const closed = report.status === 'resolved' || report.status === 'rejected';
  const link = targetLink(report);

  const run = async (note: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      await admin.reviewReport(report.id, pending.action, note || undefined);
      toast.success('Report updated');
      setPending(null);
      await qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onClose={onClose} title={`${humanize(report.reason)} report`} description={`${report.target_type} · ${timeAgo(report.created_at)}`}>
      <div className="space-y-6">
        {report.reason === 'child_safety' && <p className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger"><ShieldAlert aria-hidden size={18} className="mt-0.5 shrink-0" />Child-safety report. If the content is CSAM: remove it, ban the account, and report to cybercrime.gov.in. Preserve records.</p>}
        <KV items={[
          ['Reporter', report.reporter_username ? `@${report.reporter_username}` : 'Deleted user'],
          ['Reported user', report.reported_username ? `@${report.reported_username}` : '—'],
          ['Content', report.target_preview ?? `${report.target_type} ${report.target_id.slice(0, 8)}`],
          ['Reason', humanize(report.reason)],
          ['Description', report.description || '—'],
          ['Date', dateTime(report.created_at)],
          ['Status', <StatusBadge key="s" status={report.status} />],
          ['Admin action', report.admin_action ? humanize(report.admin_action) : '—'],
          ['Reviewed', report.reviewed_by_username ? `@${report.reviewed_by_username} · ${dateTime(report.reviewed_at)}` : '—'],
          ['Admin note', report.admin_note],
        ]} />
        {link && <a href={link} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-ink hover:underline">Open reported {report.target_type}</a>}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {closed ? (
            <Button variant="outline" size="sm" onClick={() => setPending({ action: 'reopen', title: 'Reopen this report?', tone: 'primary', reasonRequired: false })}>Reopen</Button>
          ) : (
            <>
              {report.status === 'pending' && <Button variant="outline" size="sm" onClick={() => setPending({ action: 'under_review', title: 'Mark under review?', tone: 'primary', reasonRequired: false })}>Review</Button>}
              {(report.target_type === 'post' || report.target_type === 'comment') && <Button variant="danger" size="sm" onClick={() => setPending({ action: 'remove_content', title: 'Remove the reported content?', tone: 'danger', reasonRequired: true })}>Remove content</Button>}
              {isAdmin && report.reported_user_id && <Button variant="danger" size="sm" leading={<UserX aria-hidden size={15} />} onClick={() => setPending({ action: 'suspend_user', title: `Suspend @${report.reported_username}?`, tone: 'danger', reasonRequired: true })}>Suspend user</Button>}
              <Button size="sm" onClick={() => setPending({ action: 'resolve', title: 'Resolve this report?', tone: 'primary', reasonRequired: false })}>Resolve</Button>
              <Button variant="ghost" size="sm" onClick={() => setPending({ action: 'dismiss', title: 'Dismiss this report?', tone: 'primary', reasonRequired: false })}>Dismiss</Button>
            </>
          )}
        </div>
      </div>
      <ConfirmDialog open={!!pending} onClose={() => setPending(null)} title={pending?.title ?? ''} description="Recorded in the admin audit log."
        tone={pending?.tone} reasonLabel="Note" reasonRequired={pending?.reasonRequired} loading={busy} onConfirm={run} />
    </Drawer>
  );
}

export default function AdminReports() {
  const [status, setStatus] = useState('pending');
  const [type, setType] = useState('');
  const [reason, setReason] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminReportRow | null>(null);
  const list = useQuery({
    queryKey: ['admin', 'reports', status, type, reason, offset],
    queryFn: () => admin.reports({ status: status || null, targetType: type || null, reason: reason || null, limit: LIMIT, offset }),
    placeholderData: (p) => p,
  });
  const total = Number(list.data?.[0]?.total_count ?? 0);

  const columns: Column<AdminReportRow>[] = [
    { key: 'content', header: 'Content', primary: true, cell: (r) => <span className="flex items-center gap-2">{r.reason === 'child_safety' && <AlertOctagon aria-label="Child safety" size={16} className="shrink-0 text-danger" />}<span className="line-clamp-1">{r.target_preview ?? `${r.target_type}`}</span></span> },
    { key: 'type', header: 'Type', cell: (r) => humanize(r.target_type) },
    { key: 'reason', header: 'Reason', cell: (r) => humanize(r.reason) },
    { key: 'reported', header: 'Reported user', cell: (r) => (r.reported_username ? `@${r.reported_username}` : '—') },
    { key: 'reporter', header: 'Reporter', cell: (r) => (r.reporter_username ? `@${r.reporter_username}` : '—'), hideOnMobile: true },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'date', header: 'Date', cell: (r) => date(r.created_at) },
  ];

  return (
    <>
      <SectionTitle title="Reports" description="Child-safety reports are always sorted first." />
      <FilterBar>
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={[{ value: 'pending', label: 'Pending' }, { value: 'under_review', label: 'Under review' }, { value: 'resolved', label: 'Resolved' }, { value: 'rejected', label: 'Rejected' }]} />
        <FilterSelect label="Target" value={type} onChange={(v) => { setType(v); setOffset(0); }} options={['post', 'comment', 'user', 'message'].map((t) => ({ value: t, label: humanize(t) }))} />
        <FilterSelect label="Reason" value={reason} onChange={(v) => { setReason(v); setOffset(0); }} options={REPORT_REASONS.map((r) => ({ value: r.value, label: r.label }))} />
      </FilterBar>
      <DataTable caption="Reports" rows={list.data} loading={list.isPending} error={list.error} onRetry={() => void list.refetch()} columns={columns} rowKey={(r) => r.id} onRowClick={setSelected}
        empty={{ icon: Flag, title: 'Queue is clear', description: 'No reports match these filters.' }} />
      <Pager offset={offset} limit={LIMIT} total={total} onChange={setOffset} />
      {selected && <ReportDrawer report={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

interface SafetyData {
  open_by_reason: Record<string, number>;
  child_safety_queue: Array<{ id: string; target_type: string; target_id: string; description: string; status: string; created_at: string; reported_username: string | null }>;
  flagged_posts: number;
  removed_posts_30d: number;
  suspended_users: number;
  banned_users: number;
  repeat_offenders: Array<{ id: string; username: string; status: string; reports: number }>;
}

export function AdminSafety() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['admin', 'safety'], queryFn: admin.safety, refetchInterval: 60_000 });
  const d = q.data as SafetyData | undefined;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <>
      <SectionTitle title="Safety" description="Child safety, illegal content and repeat offenders at a glance." />
      {!d ? <Skeleton className="h-80 rounded-2xl" /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Child-safety & illegal" value={d.child_safety_queue.length} icon={ShieldAlert} tone={d.child_safety_queue.length ? 'danger' : 'success'} />
            <Kpi label="Flagged posts" value={count(d.flagged_posts)} icon={Flag} tone="warning" onClick={() => navigate('/admin/videos?status=flagged')} />
            <Kpi label="Removed (30d)" value={count(d.removed_posts_30d)} icon={ShieldCheck} />
            <Kpi label="Suspended / banned" value={`${count(d.suspended_users)} / ${count(d.banned_users)}`} icon={UserX} onClick={() => navigate('/admin/users')} />
          </div>
          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><AlertOctagon aria-hidden size={18} className="text-danger" />Priority queue</h2>
            {d.child_safety_queue.length === 0 ? <p className="py-6 text-center text-sm text-fg-3">No open child-safety or illegal-content reports.</p> : (
              <ul className="divide-y divide-line">
                {d.child_safety_queue.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <StatusBadge status={r.status} />
                    <span className="min-w-0 flex-1"><span className="font-medium">{humanize(r.target_type)}</span>{r.reported_username && <> by @{r.reported_username}</>}<span className="block truncate text-xs text-fg-3">{r.description || 'No description'}</span></span>
                    <span className="text-xs text-fg-3">{timeAgo(r.created_at)}</span>
                    <Button size="sm" variant="outline" onClick={() => navigate('/admin/reports')}>Review</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 sm:p-5">
              <h2 className="mb-3 font-semibold">Open reports by reason</h2>
              {Object.keys(d.open_by_reason).length === 0 ? <p className="text-sm text-fg-3">None open.</p> : (
                <ul className="space-y-2 text-sm">{Object.entries(d.open_by_reason).sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between"><span>{humanize(k)}</span><span className="font-semibold tabular">{v}</span></li>)}</ul>
              )}
            </Card>
            <Card className="p-4 sm:p-5">
              <h2 className="mb-3 font-semibold">Repeat offenders (3+ reports in 30 days)</h2>
              {d.repeat_offenders.length === 0 ? <p className="text-sm text-fg-3">None.</p> : (
                <ul className="space-y-2 text-sm">{d.repeat_offenders.map((u) => <li key={u.id} className="flex items-center justify-between gap-2"><span>@{u.username} <StatusBadge status={u.status} /></span><span className="font-semibold tabular">{u.reports}</span></li>)}</ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
