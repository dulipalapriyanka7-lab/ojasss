import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '@/api/auth';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { useSeo } from '@/lib/seo';
import { env } from '@/lib/env';
import { AuthLayout } from './AuthLayout';

export default function ForgotPasswordPage() {
  useSeo({ title: 'Reset password', path: '/forgot-password' });
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      const ae = err as ApiError;
      // Do not reveal whether the account exists; only surface throttling/network problems.
      if (ae.kind === 'rate_limited' || ae.kind === 'network' || ae.kind === 'not_configured') setError(ae);
      else setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={sent ? 'Check your email' : 'Forgot your password?'}
      subtitle={sent ? undefined : env.mysql ? "Enter your email and we'll send you a reset code." : "Enter your email and we'll send you a link to reset it."}
      footer={<Link to="/login" className="font-semibold text-brand-ink hover:underline">Back to sign in</Link>}
    >
      {sent ? (
        <div className="space-y-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-success-soft text-success"><MailCheck aria-hidden size={28} /></div>
          <p className="text-fg-2">If an OJASSS account exists for <strong>{email}</strong>, {env.mysql ? 'you’ll receive a 6-digit code that expires in 10 minutes.' : 'you’ll receive a reset link shortly. The link expires in 1 hour.'}</p>
          {env.mysql && <Link to="/reset-password" className="font-semibold text-brand-ink">Enter reset code</Link>}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />}</Field>
          {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error.message}</p>}
          <Button type="submit" block size="lg" loading={busy} disabled={!email}>{env.mysql ? 'Send reset code' : 'Send reset link'}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
