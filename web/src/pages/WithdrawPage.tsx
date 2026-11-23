import { useWithdrawalSchedule, WithdrawalHours } from '@/pages/MemberProgram';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, CheckCircle2, Lock, Pencil, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { earnings, withdrawals } from '@/api';
import { ApiError } from '@/api/client';
import { Page, PageHeader } from '@/components/layout/AppShell';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Misc';
import { useToast } from '@/components/ui/Toast';
import { paiseFromRupeesInput, rupees } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { newIdempotencyKey } from '@/lib/utils';

function PayoutForm({ onSaved, onCancel }: { onSaved: () => void; onCancel?: () => void }) {
  const toast = useToast();
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [upi, setUpi] = useState('');
  const [holder, setHolder] = useState('');
  const [acct, setAcct] = useState('');
  const [acct2, setAcct2] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bank, setBank] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upiOk = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$/.test(upi.trim());
  const acctOk = /^[0-9]{9,18}$/.test(acct.replace(/\s/g, ''));
  const ifscOk = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase());
  const bankOk = holder.trim().length >= 2 && acctOk && acct === acct2 && ifscOk;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await withdrawals.savePayoutDetail(method === 'upi'
        ? { method, upiId: upi.trim() }
        : { method, accountHolderName: holder.trim(), accountNumber: acct.replace(/\s/g, ''), ifsc: ifsc.trim().toUpperCase(), bankName: bank.trim() || undefined });
      toast.success('Payout details saved');
      onSaved();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <Segmented
        label="Payout method"
        value={method}
        onChange={setMethod}
        items={[
          { value: 'upi', label: <span className="flex items-center gap-1.5"><Smartphone aria-hidden size={15} />UPI</span> },
          { value: 'bank', label: <span className="flex items-center gap-1.5"><Building2 aria-hidden size={15} />Bank account</span> },
        ]}
      />
      {method === 'upi' ? (
        <Field label="UPI ID" hint="e.g. name@okaxis" error={upi && !upiOk ? 'Enter a valid UPI ID.' : null}>
          {(p) => <Input {...p} value={upi} onChange={(e) => setUpi(e.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} />}
        </Field>
      ) : (
        <>
          <Field label="Account holder name" hint="As it appears on your bank account">{(p) => <Input {...p} value={holder} onChange={(e) => setHolder(e.target.value)} autoComplete="name" />}</Field>
          <Field label="Account number" error={acct && !acctOk ? 'Enter 9–18 digits.' : null}>
            {(p) => <Input {...p} value={acct} onChange={(e) => setAcct(e.target.value.replace(/[^\d\s]/g, ''))} inputMode="numeric" autoComplete="off" />}
          </Field>
          <Field label="Confirm account number" error={acct2 && acct !== acct2 ? 'Account numbers do not match.' : null}>
            {(p) => <Input {...p} value={acct2} onChange={(e) => setAcct2(e.target.value.replace(/[^\d\s]/g, ''))} inputMode="numeric" autoComplete="off" onPaste={(e) => e.preventDefault()} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="IFSC" error={ifsc && !ifscOk ? 'Enter a valid 11-character IFSC.' : null}>
              {(p) => <Input {...p} value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())} maxLength={11} autoCapitalize="characters" autoComplete="off" />}
            </Field>
            <Field label="Bank name (optional)">{(p) => <Input {...p} value={bank} onChange={(e) => setBank(e.target.value)} />}</Field>
          </div>
        </>
      )}
      <p className="flex items-start gap-2 text-xs text-fg-3"><Lock aria-hidden size={14} className="mt-0.5 shrink-0" />Stored securely and only visible to you (masked) and the payouts team. Details can't be changed while a withdrawal is in progress.</p>
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={busy} disabled={method === 'upi' ? !upiOk : !bankOk}>Save payout details</Button>
      </div>
    </form>
  );
}

export default function WithdrawPage() {
  useSeo({ title: 'Withdraw', noindex: true });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const wallet = useQuery({ queryKey: ['earnings', 'wallet'], queryFn: earnings.wallet });
  const hours = useWithdrawalSchedule();
  const payout = useQuery({ queryKey: ['earnings', 'payout-detail'], queryFn: withdrawals.payoutDetail });
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  // One key per withdrawal attempt: network retries replay the same request instead of duplicating it.
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey('wd'));

  if (wallet.isPending || payout.isPending) return <PageLoader />;
  if (wallet.isError) return <Page><ErrorState error={wallet.error} onRetry={() => void wallet.refetch()} /></Page>;

  const w = wallet.data;
  const available = Number(w.available_paise);
  const min = Number(w.min_withdrawal_paise);
  const max = Math.min(Number(w.max_withdrawal_paise), available);
  const paise = paiseFromRupeesInput(amount);
  const amountError = !amount ? null
    : paise === null ? 'Enter an amount like 500 or 500.50.'
    : paise < min ? `Minimum is ${rupees(min)}.`
    : paise > available ? `You have ${rupees(available)} available.`
    : paise > Number(w.max_withdrawal_paise) ? `Maximum per withdrawal is ${rupees(w.max_withdrawal_paise)}.` : null;

  const submit = async () => {
    if (paise === null) return;
    setBusy(true);
    setError(null);
    try {
      await withdrawals.request(paise, idemKey);
      setDone(paise);
      setIdemKey(newIdempotencyKey('wd'));
      await qc.invalidateQueries({ queryKey: ['earnings'] });
    } catch (e) {
      setError((e as ApiError).message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  if (done !== null) {
    return (
      <Page width="sm">
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex size-18 items-center justify-center rounded-3xl bg-success text-white shadow-float"><CheckCircle2 aria-hidden size={36} /></div>
          <h1 className="text-2xl font-bold">Withdrawal requested</h1>
          <p className="text-fg-3">{rupees(done)} to {payout.data?.masked}. Our payouts team reviews requests within 3 working days. You'll get a notification at each step.</p>
          <ButtonLink to="/earnings">Back to earnings</ButtonLink>
        </div>
      </Page>
    );
  }

  const inProgress = Number(w.in_process_paise) > 0;

  return (
    <Page width="sm">
      <><WithdrawalHours /></><PageHeader
        title="Withdraw"
        back={<Link to="/earnings" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-fg-3 hover:text-fg"><ArrowLeft aria-hidden size={16} /> Earnings</Link>}
        description={<>Available: <strong className="text-fg">{rupees(available)}</strong></>}
      />

      <Card className="mb-4 p-5" as="section">
        <h2 className="mb-3 font-semibold">1 · Payout details</h2>
        {payout.data && !editing ? (
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-surface-2">{payout.data.method === 'upi' ? <Smartphone aria-hidden size={20} /> : <Building2 aria-hidden size={20} />}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{payout.data.method === 'upi' ? 'UPI' : 'Bank account'}</p>
              <p className="truncate text-sm text-fg-3">{payout.data.masked}</p>
            </div>
            <Button variant="ghost" size="sm" leading={<Pencil aria-hidden size={15} />} onClick={() => setEditing(true)} disabled={inProgress}>Change</Button>
          </div>
        ) : (
          <PayoutForm
            onSaved={() => { setEditing(false); void qc.invalidateQueries({ queryKey: ['earnings', 'payout-detail'] }); }}
            onCancel={payout.data ? () => setEditing(false) : undefined}
          />
        )}
      </Card>

      <Card className="p-5" as="section">
        <h2 className="mb-3 font-semibold">2 · Amount</h2>
        {inProgress ? (
          <p className="rounded-xl bg-info-soft p-3 text-sm text-info">You already have a withdrawal of {rupees(w.in_process_paise)} in progress. You can request another once it is paid or rejected.</p>
        ) : available < min ? (
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-fg-2">You need at least {rupees(min)} in approved earnings to withdraw. Keep creating!</p>
        ) : (
          <>
            <Field label="Amount (₹)" error={amountError} hint={`Between ${rupees(min)} and ${rupees(max)}`}>
              {(p) => <Input {...p} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" leading={<span className="font-semibold">₹</span>} placeholder="0.00" />}
            </Field>
            <div className="mt-2 flex gap-2">
              {[min, Math.round(available / 2), available].filter((v, i, a) => v >= min && v <= max && a.indexOf(v) === i).map((v) => (
                <button key={v} type="button" onClick={() => setAmount((v / 100).toFixed(2))} className="h-9 rounded-full bg-surface-2 px-3 text-xs font-semibold hover:bg-surface-3">
                  {v === available ? 'All' : rupees(v)}
                </button>
              ))}
            </div>
            {error && <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
            {!confirming ? (
              <Button className="mt-4" block size="lg" disabled={!hours.data?.open || hours.data?.task_eligible===false || !payout.data || paise === null || !!amountError || editing} onClick={() => setConfirming(true)}>{hours.data?.task_eligible===false?'Task assignment required':'Review withdrawal'}</Button>
            ) : (
              <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-4">
                <h3 className="font-semibold">3 · Confirm</h3>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-fg-3">Amount</dt><dd className="font-semibold tabular">{rupees(paise!)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-fg-3">To</dt><dd className="truncate">{payout.data?.masked}</dd></div>
                </dl>
                <p className="mt-2 text-xs text-fg-3">Payouts are reviewed for fraud checks before transfer. You can cancel while the request awaits review.</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="ghost" onClick={() => setConfirming(false)}>Back</Button>
                  <Button className="flex-1" loading={busy} onClick={submit}>Confirm withdrawal</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
      <Button variant="ghost" className="mt-4" onClick={() => navigate('/earnings')}>Cancel</Button>
    </Page>
  );
}
