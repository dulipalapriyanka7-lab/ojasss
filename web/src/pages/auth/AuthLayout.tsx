import { Flame, Mic, Rocket } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Misc';
import { env } from '@/lib/env';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-svh bg-bg lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel (desktop) */}
      <aside aria-hidden className="relative hidden overflow-hidden bg-[#0b0a10] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-40 -left-40 size-[520px] rounded-full bg-[#ff7a1a] opacity-30 blur-[120px]" />
        <div className="absolute -right-32 -bottom-40 size-[520px] rounded-full bg-[#e0337a] opacity-25 blur-[120px]" />
        <Logo className="relative text-white" />
        <div className="relative max-w-md">
          <h2 className="font-display text-5xl leading-[1.05] font-bold tracking-tight">
            Watch. Create.<br /><span className="text-brand-gradient">Go viral.</span>
          </h2>
          <p className="mt-5 text-lg text-white/70">Short videos and posters from creators, businesses and citizens across India — and rewards when your posts take off.</p>
          <ul className="mt-10 space-y-4">
            {[
              { icon: Flame, c: 'text-[#ff6a33]', t: 'HOT', d: 'Show love for posts you enjoy' },
              { icon: Mic, c: 'text-[#2dd4bf]', t: 'SPEAK', d: 'Amplify voices that matter' },
              { icon: Rocket, c: 'text-[#a58bff]', t: 'VIRAL', d: 'Push the best posts over the top' },
            ].map((x) => (
              <li key={x.t} className="flex items-center gap-4">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-white/10 backdrop-blur"><x.icon size={22} className={x.c} /></span>
                <span><span className="block font-semibold">{x.t}</span><span className="text-sm text-white/60">{x.d}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} OJASSS · Made in India</p>
      </aside>

      <main className="flex flex-col px-5 py-8 pt-[max(2rem,env(safe-area-inset-top))] sm:px-10">
        <Link to="/" className="mb-10 lg:hidden" aria-label="OJASSS home"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center">
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && <p className="mt-2 text-fg-3">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-fg-3">{footer}</div>}
          
        </div>
        <nav aria-label="Legal" className="mx-auto mt-10 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-3">
          <Link to="/terms" className="hover:text-fg">Terms</Link>
          <Link to="/privacy-policy" className="hover:text-fg">Privacy</Link>
          <Link to="/community-guidelines" className="hover:text-fg">Guidelines</Link>
          <Link to="/child-safety-standards" className="hover:text-fg">Child safety</Link>
          <a href={`mailto:${env.supportEmail}`} className="hover:text-fg">Help</a>
        </nav>
      </main>
    </div>
  );
}

export function GoogleButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-line-strong bg-surface text-[15px] font-semibold transition-colors hover:bg-surface-2 disabled:opacity-60"
    >
      <svg aria-hidden width="20" height="20" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {loading ? 'Connecting to Google…' : 'Continue with Google'}
    </button>
  );
}

export function Divider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs font-medium tracking-wide text-fg-3 uppercase">
      <span className="h-px flex-1 bg-line" />{label}<span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** 6/8-digit code input with paste support and numeric keyboard. */
export function CodeInput({ length, value, onChange, id, invalid }: { length: number; value: string; onChange: (v: string) => void; id?: string; invalid?: boolean }) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern={`[0-9]{${length}}`}
      maxLength={length}
      aria-invalid={invalid || undefined}
      placeholder={'•'.repeat(length)}
      className="h-14 w-full rounded-xl border border-line bg-surface text-center font-display text-2xl tracking-[0.5em] tabular outline-none placeholder:text-fg-3/60 focus:border-brand aria-[invalid=true]:border-danger"
    />
  );
}
