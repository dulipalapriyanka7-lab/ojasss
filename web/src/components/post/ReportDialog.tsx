import { useState } from 'react';
import { reports, type ReportReason, type ReportTarget } from '@/api';
import { ApiError } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { REPORT_REASONS } from '@/lib/constants';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import { Button } from '../ui/Button';
import { Field, Textarea } from '../ui/Field';
import { Dialog } from '../ui/Overlay';
import { useToast } from '../ui/Toast';

export function ReportDialog({ open, onClose, targetType, targetId }: { open: boolean; onClose: () => void; targetType: ReportTarget; targetId: string }) {
  const { me } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setReason(null);
      setDescription('');
    }
  }

  const submit = async () => {
    if (!reason) return;
    setSending(true);
    try {
      await reports.create(targetType, targetId, reason, description.trim());
      toast.success('Thanks — our safety team will review this.');
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ALREADY_REPORTED') {
        toast.info(e.message);
        onClose();
      } else toast.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={targetType==='comment'?'Report this voice':`Report ${targetType}`}
      description="Reports are confidential. The person you report is not told who reported them."
      footer={me ? (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={submit} disabled={!reason} loading={sending}>Submit report</Button>
        </>
      ) : undefined}
    >
      {!me ? (
        <p className="py-4 text-sm text-fg-2">Please sign in to report content. For urgent child-safety concerns email <a className="font-semibold text-brand-ink underline" href={`mailto:safety@ojasss.com`}>safety@ojasss.com</a>.</p>
      ) : (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Why are you reporting this?</legend>
            <div className="grid gap-2">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                    reason === r.value ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2',
                  )}
                >
                  <input type="radio" name="report-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="mt-1 accent-[var(--brand)]" />
                  <span>
                    <span className="block text-sm font-semibold">{r.label}</span>
                    <span className="block text-xs text-fg-3">{r.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {reason === 'child_safety' && (
            <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
              Child-safety reports are prioritised. If a child is in immediate danger, call 112 or the Childline 1098. You can also report to cybercrime.gov.in.
            </p>
          )}
          <Field label="Details (optional)" hint="Add anything that helps our team understand the issue.">
            {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} className="min-h-20" />}
          </Field>
          <p className="text-xs text-fg-3">False reports may lead to action on your account. Support: {env.supportEmail}</p>
        </div>
      )}
    </Dialog>
  );
}
