import {safeInternalPath} from '@/lib/utils';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { completeGoogleSignIn } from '@/lib/googleAuth';
import { AuthLayout, GoogleButton } from './AuthLayout';

export default function GoogleSignInPage() {
  const [params] = useSearchParams();
  const flow = params.get('flow') ?? '';
  const next=safeInternalPath(params.get('next'));
  const callback=location.origin+'/auth/callback?google_flow='+encodeURIComponent(flow)+'&next='+encodeURIComponent(next);
  const androidPackage = params.get('client') === 'flutter' ? 'com.ojasss.app.flutter' : 'com.ojasss.app';
  const returnUrl=/Android/i.test(navigator.userAgent)?'intent://'+location.host+'/auth/callback?google_flow='+encodeURIComponent(flow)+'&next='+encodeURIComponent(next)+'#Intent;scheme=https;package='+androidPackage+';S.browser_fallback_url='+encodeURIComponent(callback)+';end':callback;
  const [busy,setBusy] = useState(false);
  const [done,setDone] = useState(false);
  const [error,setError] = useState('');
  const signIn = async () => {
    if(!/^[a-f0-9]{48}$/.test(flow)){setError('This sign-in link is invalid. Start again from the OJASSS app.');return;}
    setBusy(true);setError('');
    try {await completeGoogleSignIn(flow);setDone(true);} catch(e){setError(e instanceof Error?e.message:'Sign-in failed.');} finally{setBusy(false);}
  };
  return <AuthLayout title={done?'Google sign-in complete':'Sign in to the OJASSS app'} subtitle={done?'Return to the app to continue.':'Choose your Google account in this secure browser window.'}>
    {done ? <a href={returnUrl} className="block rounded-xl bg-brand p-3 text-center font-semibold text-white">Return to OJASSS</a> : <GoogleButton onClick={()=>void signIn()} loading={busy}/>}
    {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
  </AuthLayout>;
}
