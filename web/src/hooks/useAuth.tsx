import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { users, type Me } from '@/api';
import { ApiError, friendly } from '@/api/client';
import { env } from '@/lib/env';
import { platform } from '@/lib/platform';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  /** Server-side profile incl. role. `null` when signed out. */
  me: Me | null;
  loading: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export const meKey = ['me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!env.configured);

  useEffect(() => {
    if (!env.configured) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') {qc.clear();for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key?.startsWith('ojasss-category-session:'))sessionStorage.removeItem(key);}} 
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') void qc.invalidateQueries();
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [qc]);

  const uid = session?.user.id ?? null;
  useEffect(() => {
    if (!uid || !env.mysql || platform.isAndroidApp() || !('Notification' in window) || Notification.permission !== 'granted') return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void import('@/lib/webPush').then(({ enableWebPush }) => enableWebPush(false)).then((off) => { if (disposed) off(); else unsubscribe = off; }).catch(() => undefined);
    const refresh = () => { void qc.invalidateQueries({ predicate: (q) => ['notifications', 'unread', 'conversations', 'messages'].includes(String(q.queryKey[0])) }); };
    window.addEventListener('ojasss:web-push', refresh);
    return () => { disposed = true; unsubscribe?.(); window.removeEventListener('ojasss:web-push', refresh); };
  }, [uid, qc]);
  const meQuery = useQuery({
    queryKey: [...meKey, uid],
    queryFn: users.me,
    enabled: !!uid,
    staleTime: 60_000,
    retry: (n, e) => (e instanceof ApiError ? e.retryable && n < 2 : n < 2),
  });

  // Presence heartbeat for the "active users" metric (server throttles to 5 min).
  useEffect(() => {
    if (!uid) return;
    void users.touchPresence().catch(() => undefined);
    const t = window.setInterval(() => void users.touchPresence().catch(() => undefined), 5 * 60_000);
    return () => window.clearInterval(t);
  }, [uid]);

  // Android push: when the shell hands us an FCM token, register it for this user.
  useEffect(() => {
    if (!uid || !platform.isAndroidApp()) return;
    const off = platform.on((e) => {
      if (e.type === 'push_token') {
        void import('@/api').then(({ notifications }) => notifications.registerPushToken(e.token, 'android')).catch(() => undefined);
      }
    });
    platform.requestPushToken();
    return off;
  }, [uid]);

  const refreshMe = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: meKey });
  }, [qc]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    qc.clear();
  }, [qc]);

  const me = uid ? meQuery.data ?? null : null;
  const value = useMemo<AuthState>(() => ({
    session,
    me,
    loading: !ready || (!!uid && meQuery.isPending),
    // UX only. Every admin API re-checks the role in the database.
    isStaff: me?.status === 'active' && (me.role === 'admin' || me.role === 'moderator'),
    isAdmin: me?.status === 'active' && me.role === 'admin',
    refreshMe,
    signOut,
  }), [session, me, ready, uid, meQuery.isPending, refreshMe, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** Throws a friendly 401 when an action needs a signed-in user. */
export function assertSignedIn(me: Me | null): asserts me is Me {
  if (!me) throw new ApiError('unauthenticated', 'AUTH_REQUIRED', friendly('unauthenticated'), 401);
}
