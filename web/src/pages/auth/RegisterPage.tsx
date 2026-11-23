import {captureReferral,savedReferral} from '@/lib/referral';
import {useAuth} from '@/hooks/useAuth';
import { Check, MailCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '@/api/auth';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useSeo } from '@/lib/seo';
import { cn, safeInternalPath } from '@/lib/utils';
import { AuthLayout, CodeInput, Divider, GoogleButton } from './AuthLayout';

function PasswordHints({ pw }: { pw: string }) {
  const rules = [
    { ok: pw.length >= 8, t: '8+ characters' },
    { ok: /[a-zA-Z]/.test(pw), t: 'A letter' },
    { ok: /\d/.test(pw), t: 'A number' },
  ];
  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Password requirements">
      {rules.map((r) => (
        <li key={r.t} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs', r.ok ? 'bg-success-soft text-success' : 'bg-surface-2 text-fg-3')}>
          <Check aria-hidden size={12} />{r.t}<span className="sr-only">{r.ok ? ' — met' : ' — not met'}</span>
        </li>
      ))}
    </ul>
  );
}

export default function RegisterPage() {
  useSeo({ title: 'Create account', path: '/register' });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = safeInternalPath(params.get('next'));
  const {session,me}=useAuth();
  useEffect(()=>{captureReferral(params.get('ref'));},[params]);
  useEffect(()=>{if(session&&me){const ref=captureReferral(params.get('ref'))||savedReferral();navigate(me.onboarded?next:'/onboarding?next='+encodeURIComponent(next)+(ref?'&ref='+encodeURIComponent(ref):''),{replace:true});}},[session,me,next,params,navigate]);

  const toast = useToast();
  const [step, setStep] = useState<'details' | 'verify'>(params.get('verify') ? 'verify' : 'details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.get('verify') ?? '');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleSignIn = async () => {
    if (googleBusy) return;
    setError(null);setGoogleBusy(true);
    try { await auth.signInWithGoogle(next); } catch (e) { setError(e as ApiError); } finally { setGoogleBusy(false); }
  };
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const strong = password.length >= 8 && /[a-zA-Z]/.test(password) && /\d/.test(password);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.signUp(email, password, name);
      setStep('verify');
      setCooldown(60);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.verifySignupCode(email, code);
      const ref = captureReferral(params.get('ref'))||savedReferral();
      navigate(`/onboarding?next=${encodeURIComponent(next)}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`, { replace: true });
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await auth.resendSignupCode(email);
      setCooldown(60);
      toast.success('A new code is on its way.');
    } catch (err) {
      toast.error(err);
    }
  };

  if (step === 'verify') {
    return (
      <AuthLayout title="Verify your email" subtitle={<>We sent a 6-digit code to <strong className="text-fg">{email || 'your email'}</strong>.</>}>
        <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink"><MailCheck aria-hidden size={28} /></div>
        <form onSubmit={verify} className="space-y-4">
          {!params.get('verify') ? null : (
            <Field label="Email">{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />}</Field>
          )}
          <Field label="Verification code" hint="Check your spam folder if you don't see it.">
            {(p) => <CodeInput id={p.id} length={6} value={code} onChange={setCode} invalid={!!error} />}
          </Field>
          {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error.message}</p>}
          <Button type="submit" block size="lg" loading={busy} disabled={code.length !== 6 || !email}>Verify & continue</Button>
          <p className="text-center text-sm text-fg-3">
            Didn't get it?{' '}
            <button type="button" onClick={resend} disabled={cooldown > 0 || !email} className="font-semibold text-brand-ink disabled:text-fg-3">
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </p>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join the OJASSS community in under a minute."
      footer={<>Already have an account? <Link to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-ink hover:underline">Sign in</Link></>}
    >
      <GoogleButton onClick={() => void googleSignIn()} loading={googleBusy} />
      <Divider />
      <form onSubmit={create} className="space-y-4" noValidate>
        <Field label="Your name">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={50} required />}</Field>
        <Field label="Email">{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />}</Field>
        <Field label="Password">
          {(p) => (
            <>
              <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
              <PasswordHints pw={password} />
            </>
          )}
        </Field>
        <Checkbox checked={agree} onChange={setAgree}>
          I am 13 or older and agree to the <Link to="/terms" target="_blank" className="font-semibold underline">Terms</Link>,{' '}
          <Link to="/privacy-policy" target="_blank" className="font-semibold underline">Privacy Policy</Link> and{' '}
          <Link to="/community-guidelines" target="_blank" className="font-semibold underline">Community Guidelines</Link>.
        </Checkbox>
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error.message}</p>}
        <Button type="submit" block size="lg" loading={busy} disabled={!name.trim() || !email || !strong || !agree}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
