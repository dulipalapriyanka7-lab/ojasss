import { getApp, getApps, initializeApp } from '@firebase/app';
import { getAuth, GoogleAuthProvider, inMemoryPersistence, setPersistence, signInWithPopup, signOut } from '@firebase/auth';
import { ApiError } from '@/api/client';
import {googleRequest,installGoogleSession,startGoogleHandoff} from './googleHandoff';
import { platform } from './platform';

export async function completeGoogleSignIn(flow?: string) {
  const response = await fetch('/api/firebase-config', {cache:'no-store'});
  if (!response.ok) throw new Error('Google sign-in setup is unavailable.');
  const {firebaseConfig} = await response.json();
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);
  const provider = new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
  try {
    const credential = await signInWithPopup(auth,provider);
    const result = await googleRequest('complete',{idToken:await credential.user.getIdToken(),...(flow?{flow}:{})});
    if (!flow) await installGoogleSession(result);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const code = (error as {code?:string}).code;
    const message = code === 'auth/unauthorized-domain' ? 'Google sign-in is awaiting domain authorization.' : code === 'auth/popup-closed-by-user' ? 'Google sign-in was closed. Please try again.' : code === 'auth/popup-blocked' ? 'Allow pop-ups for OJASSS, then try Google sign-in again.' : 'Google sign-in could not complete. Please try again.';
    throw new ApiError('validation','GOOGLE_AUTH_FAILED',message);
  } finally { await signOut(auth).catch(() => undefined); }
}

export async function signInWithGoogle(next='/') {
  if (!platform.isAndroidApp()) return completeGoogleSignIn();
  return startGoogleHandoff(next);
}
