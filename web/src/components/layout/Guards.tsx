import { ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ButtonLink } from '../ui/Button';
import { EmptyState, PageLoader } from '../ui/Feedback';

/** Signed-in (and onboarded) users only. Redirects to /login?next=… otherwise. */
export function RequireAuth({ children, allowUnonboarded }: { children: ReactNode; allowUnonboarded?: boolean }) {
  const { session, me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (me && !me.onboarded && !allowUnonboarded) {
    return <Navigate to={`/onboarding?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

/**
 * Staff-only screens. This is a UX gate; the database rejects admin calls from
 * anyone whose profiles.role is not admin/moderator, whatever the client claims.
 */
export function RequireStaff({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { isStaff, isAdmin, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (adminOnly ? !isAdmin : !isStaff) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Permission denied"
        description="This area is only available to OJASSS administrators."
        action={<ButtonLink to="/" variant="secondary">Go home</ButtonLink>}
      />
    );
  }
  return <>{children}</>;
}
