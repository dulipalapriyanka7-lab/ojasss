import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/api/auth';
import { ApiError } from '@/api/client';
import { Button, ButtonLink } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/lib/seo';
import { env } from '@/lib/env';
import { AuthLayout } from './AuthLayout';

/** Reached from the email link; Supabase exchanges the recovery code for a session on load. */
export default function ResetPasswordPage() {
  useSeo({ title: 'Choose a new password', noindex: true });
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const strong = pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
  const mismatch = confirm.length > 0 && pw !== confirm;

  if (loading) return <PageLoader />;

  if (!session && !env.mysql) {
    return (
      <AuthLayout title="Link expired" subtitle="This password reset link is invalid or has expired.">
        <ButtonLink to="/forgot-password" block size="lg">Request a new link</ButtonLink>
      </AuthLayout>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (env.mysql && !session) await auth.verifyRecoveryCode(email, code);
      await auth.updatePassword(pw);
      toast.success('Password updated');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Choose a new password" subtitle="Use at least 8 characters with letters and numbers.">
      <form onSubmit={submit} className="space-y-4">
        {env.mysql && !session && <>
          <Field label="Email">{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />}</Field>
          <Field label="6-digit email code">{(p) => <Input {...p} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" inputMode="numeric" required />}</Field>
        </>}
        <Field label="New password">{(p) => <Input {...p} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />}</Field>
        <Field label="Confirm password" error={mismatch ? 'Passwords do not match.' : null}>
          {(p) => <Input {...p} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />}
        </Field>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error.message}</p>}
        <Button type="submit" block size="lg" loading={busy} disabled={!strong || pw !== confirm || (env.mysql && !session && (!email || code.length !== 6))}>Update password</Button>
      </form>
    </AuthLayout>
  );
}
