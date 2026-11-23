// Authentication via Supabase Auth — the single identity system for web and Android.
// Passwords are sent only to Supabase over HTTPS; nothing is stored by the app.
import { AuthError } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { platform } from '@/lib/platform';
import { supabase } from '@/lib/supabase';
import { ApiError, friendly } from './client';

function authError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof AuthError) {
    const m = e.message.toLowerCase();
    if (e.status === 429 || m.includes('rate limit') || m.includes('security purposes')) {
      return new ApiError('rate_limited', 'RATE_LIMITED', 'Too many attempts. Please wait a minute and try again.', 429);
    }
    if (m.includes('invalid login credentials')) return new ApiError('validation', 'INVALID_CREDENTIALS', 'Incorrect email or password.', 400);
    if (m.includes('email not confirmed')) return new ApiError('validation', 'EMAIL_NOT_CONFIRMED', 'Please verify your email first. We can send you a new code.', 400);
    if (m.includes('already registered') || m.includes('already been registered')) {
      return new ApiError('conflict', 'EMAIL_TAKEN', 'An account with this email already exists. Try signing in.', 409);
    }
    if (m.includes('token has expired') || m.includes('otp') || m.includes('invalid token')) {
      return new ApiError('validation', 'INVALID_CODE', 'That code is invalid or has expired. Request a new one.', 400);
    }
    if (m.includes('password') && (m.includes('weak') || m.includes('at least') || m.includes('should contain'))) {
      return new ApiError('validation', 'WEAK_PASSWORD', 'Use at least 8 characters with letters and numbers.', 422);
    }
    if (m.includes('same as the old') || m.includes('different from the old')) {
      return new ApiError('validation', 'SAME_PASSWORD', 'Choose a password you have not used before.', 422);
    }
    if (m.includes('signups not allowed')) return new ApiError('forbidden', 'SIGNUP_DISABLED', 'New sign-ups are paused right now.', 403);
    if (m.includes('fetch')) return new ApiError('network', 'NETWORK', friendly('network'));
  }
  return new ApiError('server', 'AUTH_FAILED', 'We could not complete that. Please try again.');
}

async function run<R extends { data: unknown; error: AuthError | null }>(fn: () => Promise<R>): Promise<R['data']> {
  if (!env.configured) throw new ApiError('not_configured', 'NOT_CONFIGURED', friendly('not_configured'));
  try {
    const { data, error } = await fn();
    if (error) throw error;
    return data;
  } catch (e) {
    throw authError(e);
  }
}

const origin = () => (location.origin.startsWith('http://localhost') ? location.origin : env.siteUrl);

export const auth = {
  signIn: (email: string, password: string) => run(() => supabase.auth.signInWithPassword({ email: email.trim(), password })),

  /** Create account; Supabase emails a 6-digit verification code. */
  signUp: (email: string, password: string, fullName: string) =>
    run(() => supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: `${origin()}/auth/callback` },
    })),

  verifySignupCode: (email: string, token: string) => run(() => supabase.auth.verifyOtp({ email: email.trim(), token, type: 'signup' })),
  resendSignupCode: (email: string) => run(() => supabase.auth.resend({ type: 'signup', email: email.trim() })),

  /** Passwordless: email a one-time code to an existing account. */
  sendLoginCode: (email: string) =>
    run(() => supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } })),
  verifyLoginCode: (email: string, token: string) => run(() => supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' })),

  sendPasswordReset: (email: string) =>
    run(() => supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin()}/reset-password` })),
  updatePassword: (password: string) => run(() => supabase.auth.updateUser({ password })),
  verifyRecoveryCode: (email: string, token: string) => run(() => supabase.auth.verifyOtp({ email: email.trim(), token, type: 'recovery' })),

  /**
   * Google OAuth. In the Android app, Google blocks sign-in inside WebViews, so the shell
   * opens the provider in a Custom Tab and returns through the https://ojasss.com/auth/callback App Link.
   */
  signInWithGoogle: async (next: string) => {
    if (env.mysql) return (await import('@/lib/googleAuth')).signInWithGoogle(next);
    const redirectTo = `${origin()}/auth/callback?next=${encodeURIComponent(next)}`;
    const inApp = platform.isAndroidApp();
    const data = await run(() => supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: inApp, queryParams: { prompt: 'select_account' } },
    }));
    if (inApp && data.url) platform.send({ type: 'open_oauth', url: data.url });
  },
};
