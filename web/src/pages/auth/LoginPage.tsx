import {DownloadAppCard} from '@/components/ui/DownloadAppCard';
import { KeyRound, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { auth } from '@/api/auth';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Misc';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/lib/seo';
import { safeInternalPath } from '@/lib/utils';
import { AuthLayout, CodeInput, Divider, GoogleButton } from './AuthLayout';

export default function LoginPage() {
  useSeo({ title: 'Sign in', path: '/login' });
  const [params] = useSearchParams();
  const next = safeInternalPath(params.get('next'));
  const navigate = useNavigate();
  const { session, me } = useAuth();
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleSignIn = async () => {
    if (googleBusy) return;
    setError(null);setGoogleBusy(true);
    try { await auth.signInWithGoogle(next); } catch (e) { setError(e as ApiError); } finally { setGoogleBusy(false); }
  };

  useEffect(() => {
    if (session && me) navigate(me.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`, { replace: true });
  }, [session, me, next, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'password') await auth.signIn(email, password);
      else if (!codeSent) {
        await auth.sendLoginCode(email);
        setCodeSent(true);
      } else await auth.verifyLoginCode(email, code);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to watch, create and earn on OJASSS."
      footer={<>New to OJASSS? <Link to={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-brand-ink hover:underline">Create an account</Link></>}
    >
      <GoogleButton onClick={() => void googleSignIn()} loading={googleBusy} />
      <Divider />
      <Segmented
        label="Sign-in method"
        className="mb-5 w-full [&>button]:flex-1"
        value={mode}
        onChange={(m) => { setMode(m); setError(null); setCodeSent(false); setCode(''); }}
        items={[
          { value: 'password', label: <span className="flex items-center justify-center gap-1.5"><KeyRound aria-hidden size={15} />Password</span> },
          { value: 'code', label: <span className="flex items-center justify-center gap-1.5"><Mail aria-hidden size={15} />Email code</span> },
        ]}
      />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email">
          {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required disabled={codeSent} />}
        </Field>
        {mode === 'password' ? (
          <Field label="Password" trailingLabel={<Link to="/forgot-password" className="text-sm font-medium text-brand-ink hover:underline">Forgot?</Link>}>
            {(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />}
          </Field>
        ) : codeSent ? (
          <Field label="6-digit code" hint={<>Sent to {email}. <button type="button" className="font-semibold text-brand-ink" onClick={() => { setCodeSent(false); setCode(''); }}>Change email</button></>}>
            {(p) => <CodeInput id={p.id} length={6} value={code} onChange={setCode} />}
          </Field>
        ) : null}
        {error && (
          <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {error.message}
            {error.code === 'EMAIL_NOT_CONFIRMED' && (
              <> <Link className="font-semibold underline" to={`/register?verify=${encodeURIComponent(email)}`}>Verify now</Link></>
            )}
          </div>
        )}
        <Button type="submit" block size="lg" loading={busy} disabled={!email || (mode === 'password' ? !password : codeSent && code.length !== 6)}>
          {mode === 'password' ? 'Sign in' : codeSent ? 'Verify & sign in' : 'Email me a code'}
        </Button>
      </form><div className="mt-5"><DownloadAppCard/></div>
    </AuthLayout>
  );
}
