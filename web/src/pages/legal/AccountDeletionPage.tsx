import { CheckCircle2, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { deletion } from '@/api';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { platform } from '@/lib/platform';
import { useSeo } from '@/lib/seo';
import { CodeInput } from '../auth/AuthLayout';
import { LEGAL_ENTITY as E } from './content';
import { PublicLayout } from './PublicLayout';

/**
 * Public, login-free account deletion (required by Google Play).
 * Step 1: createAccountDeletionRequest → 8-digit code emailed (if the account exists).
 * Step 2: verifyAccountDeletionOtp → request recorded for admin processing.
 * Responses never reveal whether an email has an account.
 */
export default function AccountDeletionPage() {
  useSeo({ title: 'Delete your account', description: 'Request deletion of your OJASSS account and data.', path: '/account-deletion' });
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState('');

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await deletion.start(email, reason.trim() || null, platform.isAndroidApp() ? 'android' : 'web');
      setVerificationId(r.verificationId);
      setStep('code');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await deletion.verify(verificationId, email, code);
      setDoneMessage(r.message);
      setStep('done');
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PublicLayout>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold sm:text-4xl">Delete your OJASSS account</h1>
        <p className="mt-3 text-lg text-fg-2">You can request deletion of your account and personal data at any time — with or without the app.</p>

        <Card className="mt-8 p-5 sm:p-6">
          {step === 'email' && (
            <form onSubmit={start} className="space-y-4">
              <Field label="Account email" hint="We'll send an 8-digit code to confirm it's you.">
                {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />}
              </Field>
              <Field label="Reason (optional)">{(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} className="min-h-20" />}</Field>
              {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
              <Button type="submit" variant="danger" loading={busy} disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)} leading={<Trash2 aria-hidden size={18} />}>Send verification code</Button>
            </form>
          )}
          {step === 'code' && (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-fg-2">If <strong>{email}</strong> belongs to an OJASSS account, we've sent an 8-digit code. It expires in 15 minutes and can be used once.</p>
              <Field label="Verification code">{(p) => <CodeInput id={p.id} length={8} value={code} onChange={setCode} invalid={!!error} />}</Field>
              {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="danger" loading={busy} disabled={code.length !== 8}>Confirm deletion request</Button>
                <Button variant="ghost" onClick={() => { setStep('email'); setCode(''); setError(null); }}>Start over</Button>
              </div>
            </form>
          )}
          {step === 'done' && (
            <div className="flex flex-col items-start gap-3">
              <CheckCircle2 aria-hidden size={32} className="text-success" />
              <h2 className="text-xl font-semibold">Request received</h2>
              <p className="text-fg-2">{doneMessage}</p>
            </div>
          )}
        </Card>

        <section className="mt-10 space-y-4 text-fg-2">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-fg"><ShieldCheck aria-hidden size={20} /> What happens next</h2>
          <ul className="list-disc space-y-2 pl-5 marker:text-brand">
            <li>Our team processes verified requests within 30 days and emails you when complete.</li>
            <li><strong>Deleted:</strong> your profile, videos, posters, comments, messages, follows, bookmarks, reactions, push tokens and payout details.</li>
            <li><strong>Retained without your identity:</strong> earning and withdrawal records required by Indian tax law, and moderation audit logs.</li>
            <li>Pending (unapproved) rewards are forfeited. Withdraw any available balance first.</li>
            <li>Signed in? You can also request deletion from Settings in the app or on the website.</li>
          </ul>
          <p className="text-sm">Questions: <a className="font-semibold text-brand-ink underline" href={`mailto:${E.privacy}`}>{E.privacy}</a></p>
        </section>
      </div>
    </PublicLayout>
  );
}
