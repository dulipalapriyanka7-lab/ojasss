import {resumeGoogleHandoff,pendingGoogleHandoff} from '@/lib/googleHandoff';
import {platform} from '@/lib/platform';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/Feedback';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/lib/seo';
import { safeInternalPath } from '@/lib/utils';
import { AuthLayout } from './AuthLayout';

/** OAuth / email-link landing. The Supabase client exchanges ?code= (PKCE) automatically. */
export default function AuthCallbackPage() {
  useSeo({ title: 'Signing you in', noindex: true });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session, me, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const googleFlow=params.get('google_flow');
  const [handoffNext]=useState(()=>pendingGoogleHandoff()?.next);
  const [handoffError,setHandoffError]=useState('');
  const next = safeInternalPath(params.get('next')??handoffNext);
  useEffect(()=>{if(googleFlow&&platform.isAndroidApp())void resumeGoogleHandoff(googleFlow).catch(error=>setHandoffError(error instanceof Error?error.message:'Could not finish sign-in.'));},[googleFlow]);
  const providerError = params.get('error_description') ?? params.get('error');

  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), googleFlow?300_000:12_000);
    return () => window.clearTimeout(t);
  }, [googleFlow]);

  useEffect(() => {
    if (!loading && session && me) navigate(me.onboarded ? next : `/onboarding?next=${encodeURIComponent(next)}`, { replace: true });
  }, [loading, session, me, next, navigate]);

  if (providerError || handoffError || timedOut) {
    return (
      <AuthLayout title="Sign-in didn't complete" subtitle={handoffError|| (providerError ? 'The provider cancelled or rejected the sign-in.' : 'This sign-in link may have expired or already been used.')}>
        <ButtonLink to="/login" block size="lg">Back to sign in</ButtonLink>
      </AuthLayout>
    );
  }
  return <PageLoader label="Signing you in" />;
}
