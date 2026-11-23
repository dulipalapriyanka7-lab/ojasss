import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Gift, IndianRupee, Wallet, X } from 'lucide-react';
import { useState } from 'react';
import { admin, type AdminEarningRow, type AdminWithdrawalRow } from '@/api/admin';
import { DataTable, FilterBar, FilterSelect, KV, Pager, SectionTitle, type Column } from '@/components/admin/AdminUI';
import { Button } from '@/components/ui/Button';
import { Skeleton, StatusBadge } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ConfirmDialog, Dialog, Drawer } from '@/components/ui/Overlay';
import { useToast } from '@/components/ui/Toast';
import { date, dateTime, humanize, paiseFromRupeesInput, rupees } from '@/lib/format';

const LIMIT = 25;

function BonusDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [busy, setBusy] = useState(false);
  const weeks = useQuery({ queryKey: ['admin', 'competition-prize-weeks'], queryFn: admin.competitionPrizeWeeks, enabled: open });
  const weekLabel = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
  const paise = paiseFromRupeesInput(amount);
  const valid = /^[0-9a-f-]{36}$/i.test(userId.trim()) && paise !== null && paise > 0 && reason.trim().length >= 3;
  return (
    <Dialog open={open} onClose={onClose} title="Grant bonus" description="Creates an approved bonus earning. Logged in the audit trail."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!valid} onClick={async () => {
        setBusy(true);
        try {
          await admin.grantBonus(userId.trim(), paise!, reason.trim(), competitionId || undefined);
          toast.success(competitionId ? 'Weekly prize credited' : 'Bonus granted');
          setCompetitionId('');
          onClose();
          await Promise.all([
            qc.invalidateQueries({ queryKey: ['admin'] }),
            qc.invalidateQueries({ queryKey: ['competition'] }),
          ]);
        } catch (e) {
          toast.error(e);
        } finally {
          setBusy(false);
        }
      }}>Grant bonus</Button></>}>
      <div className="space-y-3">
        <Field label="User ID" hint="Copy from the user's detail panel.">{(p) => <Input {...p} value={userId} onChange={(e) => setUserId(e.target.value)} className="font-mono text-sm" />}</Field>
        <Field label="Amount (₹)">{(p) => <Input {...p} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />}</Field>
        <Field label="Leaderboard week" hint="Link a finalized week to show the credited amount on its public winner card.">{(p) => (
          <Select {...p} value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
            <option value="">Regular bonus</option>
            {weeks.data?.map((week) => <option key={week.id} value={week.id}>Week ending {weekLabel.format(new Date(week.end))}</option>)}
          </Select>
        )}</Field>
        {weeks.isPending && <p className="text-xs text-fg-3">Loading finalized weeks…</p>}
        {weeks.isError && <button type="button" className="text-xs text-red-300" onClick={() => void weeks.refetch()}>Couldn’t load finalized weeks. Retry</button>}
        <Field label="Reason" required>{(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20" />}</Field>
      </div>
    </Dialog>
  );
}

export default function AdminEarnings() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [type, setType] = useState('');
  const [offset, setOffset] = useState(0);
  const [pending, setPending] = useState<{ row: AdminEarningRow; action: 'approve' | 'reject' | 'reverse' } | null>(null);
  const [bonus, setBonus] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useQuery({
    queryKey: ['admin', 'earnings', status, type, offset],
    queryFn: () => admin.earnings({ status: status || null, type: type || null, limit: LIMIT, offset }),
    placeholderData: (p) => p,
  });
  const total = Number(list.data?.[0]?.total_count ?? 0);

  const columns: Column<AdminEarningRow>[] = [
    { key: 'user', header: 'Creator', primary: true, cell: (e) => <span className="font-semibold">{e.username ? `@${e.username}` : 'Deleted user'}</span> },
    { key: 'type', header: 'Type', cell: (e) => humanize(e.type) },
    { key: 'post', header: 'Content', cell: (e) => e.post_id ? <a href={`/post/${e.post_id}`} target="_blank" rel="noreferrer" className="line-clamp-1 hover:underline" onClick={(ev) => ev.stopPropagation()}>{e.post_caption || 'Post'}</a> : e.note ?? '—', hideOnMobile: true },
    { key: 'amt', header: 'Amount', cell: (e) => <span className="font-semibold tabular">{rupees(e.amount_paise)}</span> },
    { key: 'risk', header: 'Open reports', cell: (e) => <span className={Number(e.user_open_reports) ? 'font-semibold text-danger' : 'text-fg-3'}>{e.user_open_reports}</span> },
    { key: 'status', header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
    { key: 'date', header: 'Created', cell: (e) => date(e.created_at) },
  ];

  const run = async (reason: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.action === 'reverse') await admin.reverseEarning(pending.row.id, reason);
      else await admin.reviewEarning(pending.row.id, pending.action === 'approve', reason || undefined);
      toast.success(`Reward ${pending.action === 'approve' ? 'approved' : pending.action === 'reject' ? 'rejected' : 'reversed'}`);
      setPending(null);
      await qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle title="Earnings" description="Rewards are created only by the server. Review before they become withdrawable." actions={<Button size="sm" variant="secondary" leading={<Gift aria-hidden size={15} />} onClick={() => setBonus(true)}>Grant bonus</Button>} />
      <FilterBar>
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={['pending', 'approved', 'rejected', 'reversed'].map((s) => ({ value: s, label: humanize(s) }))} />
        <FilterSelect label="Type" value={type} onChange={(v) => { setType(v); setOffset(0); }} options={['viral', 'cta_click', 'referral', 'bonus'].map((s) => ({ value: s, label: humanize(s) }))} />
      </FilterBar>
      <DataTable caption="Earnings" rows={list.data} loading={list.isPending} error={list.error} onRetry={() => void list.refetch()} columns={columns} rowKey={(e) => e.id}
        empty={{ icon: IndianRupee, title: 'Nothing to review', description: 'Pending rewards appear here.' }}
        actions={(e) => e.status === 'pending' ? (
          <span className="inline-flex gap-1.5">
            <Button size="sm" leading={<Check aria-hidden size={14} />} onClick={() => setPending({ row: e, action: 'approve' })}>Approve</Button>
            <Button size="sm" variant="outline" leading={<X aria-hidden size={14} />} onClick={() => setPending({ row: e, action: 'reject' })}>Reject</Button>
          </span>
        ) : e.status === 'approved' ? (
          <Button size="sm" variant="ghost" onClick={() => setPending({ row: e, action: 'reverse' })}>Reverse</Button>
        ) : <span className="text-xs text-fg-3">{e.reviewed_by_username ? `@${e.reviewed_by_username}` : ''}</span>}
      />
      <Pager offset={offset} limit={LIMIT} total={total} onChange={setOffset} />
      <ConfirmDialog open={!!pending} onClose={() => setPending(null)}
        title={pending ? `${humanize(pending.action)} ${rupees(pending.row.amount_paise)} ${humanize(pending.row.type)} reward?` : ''}
        description={pending?.action === 'approve' ? 'The amount becomes available for the creator to withdraw.' : 'The creator is notified with your reason.'}
        tone={pending?.action === 'approve' ? 'primary' : 'danger'} reasonLabel={pending?.action === 'approve' ? undefined : 'Reason'} reasonRequired={pending?.action !== 'approve'}
        loading={busy} onConfirm={run} />
      <BonusDialog open={bonus} onClose={() => setBonus(false)} />
    </>
  );
}

function WithdrawalDrawer({ w, onClose }: { w: AdminWithdrawalRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [paying, setPaying] = useState(false);
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const events = useQuery({ queryKey: ['admin', 'withdrawal-events', w.id], queryFn: () => admin.withdrawalEvents(w.id) });
  const s = w.payout_snapshot;

  const process = async (a: 'approve' | 'reject' | 'mark_paid', note?: string, ref?: string) => {
    setBusy(true);
    try {
      await admin.processWithdrawal(w.id, a, note, ref);
      toast.success(a === 'mark_paid' ? 'Marked as paid' : a === 'approve' ? 'Withdrawal approved' : 'Withdrawal rejected');
      await qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onClose={onClose} title={`${rupees(w.amount_paise)} to @${w.username ?? 'deleted'}`} description={`Requested ${dateTime(w.created_at)}`}>
      <div className="space-y-6">
        <KV items={[['Status', <StatusBadge key="s" status={w.status} />], ['User', w.username ? `@${w.username}` : '—'], ['Email', w.email], ['Current available', rupees(w.available_paise)], ['Admin note', w.admin_note], ['Payment ref', w.payment_reference]]} />
        <section className="rounded-2xl border border-line bg-surface-2 p-4">
          <h3 className="mb-2 text-sm font-semibold">Payout details (captured at request time)</h3>
          <KV items={s.method === 'upi'
            ? [['Method', 'UPI'], ['UPI ID', <code key="u" className="select-all">{s.upi_id}</code>]]
            : [['Method', 'Bank transfer'], ['Holder', s.account_holder_name], ['Account', <code key="a" className="select-all">{s.account_number}</code>], ['IFSC', <code key="i" className="select-all">{s.ifsc}</code>], ['Bank', s.bank_name]]} />
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold">Status history</h3>
          {!events.data ? <Skeleton className="h-16 rounded-xl" /> : (
            <ol className="space-y-2 border-l-2 border-line pl-4 text-sm">
              {events.data.map((e, i) => <li key={i}><span className="font-medium">{e.from_status ? `${humanize(e.from_status)} → ` : ''}{humanize(e.to_status)}</span> · @{e.actor_username ?? 'system'} · <span className="text-fg-3">{dateTime(e.created_at)}</span>{e.note && <p className="text-xs text-fg-3">{e.note}</p>}</li>)}
            </ol>
          )}
        </section>
        {(w.status === 'requested' || w.status === 'approved') && (
          <section className="space-y-3 border-t border-line pt-4">
            {w.status === 'requested' && <Button block onClick={() => setAction('approve')}>Approve</Button>}
            {w.status === 'approved' && !paying && <Button block onClick={() => setPaying(true)}>Mark as paid</Button>}
            {paying && (
              <div className="space-y-2 rounded-2xl border border-line p-3">
                <Field label="UTR / transaction reference" required>{(p) => <Input {...p} value={utr} onChange={(e) => setUtr(e.target.value)} className="font-mono" />}</Field>
                <div className="flex gap-2"><Button variant="ghost" onClick={() => setPaying(false)}>Cancel</Button><Button className="flex-1" loading={busy} disabled={utr.trim().length < 4} onClick={() => void process('mark_paid', undefined, utr.trim())}>Confirm payment sent</Button></div>
              </div>
            )}
            <Button block variant="outline" className="text-danger" onClick={() => setAction('reject')}>Reject</Button>
          </section>
        )}
      </div>
      <ConfirmDialog open={!!action} onClose={() => setAction(null)} title={action === 'approve' ? `Approve ${rupees(w.amount_paise)}?` : 'Reject this withdrawal?'}
        description={action === 'reject' ? 'The amount returns to the creator’s balance. Your reason is shown to them.' : 'Confirm the payout details and fraud checks look correct.'}
        tone={action === 'reject' ? 'danger' : 'primary'} reasonLabel={action === 'reject' ? 'Reason for the creator' : 'Note (optional)'} reasonRequired={action === 'reject'} loading={busy}
        onConfirm={(note) => (action ? process(action, note || undefined) : undefined)} />
    </Drawer>
  );
}

export function AdminWithdrawals() {
  const [status, setStatus] = useState('requested');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminWithdrawalRow | null>(null);
  const list = useQuery({ queryKey: ['admin', 'withdrawals', status, offset], queryFn: () => admin.withdrawals({ status: status || null, limit: LIMIT, offset }), placeholderData: (p) => p });
  const total = Number(list.data?.[0]?.total_count ?? 0);
  const columns: Column<AdminWithdrawalRow>[] = [
    { key: 'user', header: 'User', primary: true, cell: (w) => <span className="font-semibold">{w.username ? `@${w.username}` : 'Deleted user'}</span> },
    { key: 'amt', header: 'Amount', cell: (w) => <span className="font-semibold tabular">{rupees(w.amount_paise)}</span> },
    { key: 'method', header: 'Bank / UPI', cell: (w) => (w.payout_method === 'upi' ? `UPI · ${w.payout_snapshot.upi_id}` : `Bank · ••••${String(w.payout_snapshot.account_number ?? '').slice(-4)}`) },
    { key: 'req', header: 'Requested', cell: (w) => dateTime(w.created_at) },
    { key: 'status', header: 'Status', cell: (w) => <StatusBadge status={w.status} /> },
  ];
  return (
    <>
      <SectionTitle title="Withdrawals" description="Approve → pay → record the UTR. Every transition is audited; admins cannot process their own requests." />
      <FilterBar>
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={['requested', 'approved', 'paid', 'rejected', 'cancelled'].map((s) => ({ value: s, label: humanize(s) }))} />
      </FilterBar>
      <DataTable caption="Withdrawals" rows={list.data} loading={list.isPending} error={list.error} onRetry={() => void list.refetch()} columns={columns} rowKey={(w) => w.id} onRowClick={setSelected}
        empty={{ icon: Wallet, title: 'No withdrawals', description: 'Requests from creators will appear here.' }} />
      <Pager offset={offset} limit={LIMIT} total={total} onChange={setOffset} />
      {selected && <WithdrawalDrawer w={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
