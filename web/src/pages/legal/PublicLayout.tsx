import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ThemeSwitcher } from '@/components/layout/AppShell';
import { ButtonLink } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Misc';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export const PUBLIC_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
  { to: '/terms', label: 'Terms' },
  { to: '/privacy-policy', label: 'Privacy' },
  { to: '/community-guidelines', label: 'Community guidelines' },
  { to: '/earnings-terms', label: 'Earnings terms' },
  { to: '/complaints-disclaimer', label: 'Complaints disclaimer' },
  { to: '/child-safety-standards', label: 'Child safety' },
  { to: '/refund-policy', label: 'Refund policy' },
  { to: '/account-deletion', label: 'Account deletion' },
];

/** Layout for public, login-free pages (legal, contact, account deletion). */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  return (
    <div className="min-h-svh bg-bg">
      <header className="glass sticky top-0 z-30 border-b border-line pt-safe">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="OJASSS home"><Logo /></Link>
          <div className="flex items-center gap-2">
            <ThemeSwitcher className="hidden sm:inline-flex" />
            {me ? <ButtonLink to="/" size="sm">Open OJASSS</ButtonLink> : <ButtonLink to="/login" size="sm">Sign in</ButtonLink>}
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:py-12">
        <nav aria-label="Policies" className="hidden lg:block">
          <ul className="sticky top-24 space-y-0.5">
            {PUBLIC_LINKS.map((l) => (
              <li key={l.to}>
                <NavLink to={l.to} className={({ isActive }) => cn('block rounded-lg px-3 py-2 text-sm', isActive ? 'bg-surface-2 font-semibold text-fg' : 'text-fg-3 hover:text-fg')}>
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main id="main" className="min-w-0">{children}</main>
      </div>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-fg-3 sm:px-6">
          <p>© {new Date().getFullYear()} OJASSS · Made in India</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {PUBLIC_LINKS.map((l) => <li key={l.to}><Link to={l.to} className="hover:text-fg">{l.label}</Link></li>)}
          </ul>
        </div>
      </footer>
    </div>
  );
}
