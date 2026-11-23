import { AlertTriangle, RefreshCw, WifiOff, type LucideIcon } from 'lucide-react';
import {useEffect,type ReactNode} from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '@/api/client';
import { env } from '@/lib/env';
import { cn } from '@/lib/utils';
import {platform} from '@/lib/platform';

export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn('animate-spin text-brand', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-lg', className)} />;
}

export function PageLoader({ label = 'Loading',nativeReady=true }: { label?: string;nativeReady?:boolean }) {
  useEffect(()=>{if(!nativeReady)return;const frame=requestAnimationFrame(()=>platform.send({type:'ui_ready'}));return()=>cancelAnimationFrame(frame);},[nativeReady]);
  return (
    <div className="app-loading flex min-h-[50vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <img src="/brand/mark.png" width="52" height="52" alt="" className="size-13 rounded-2xl object-contain"/>
      <span className="text-base font-extrabold tracking-[.14em]">OJASSS</span>
      <span className="app-loading-dots" aria-hidden><i/><i/><i/></span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'hot' | 'speak' | 'viral';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-2',
  brand: 'bg-brand-soft text-brand-ink',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  hot: 'bg-hot-soft text-hot',
  speak: 'bg-speak-soft text-speak',
  viral: 'bg-viral-soft text-viral',
};

export function Badge({ tone = 'neutral', children, className, icon: Icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: LucideIcon }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', tones[tone], className)}>
      {Icon && <Icon aria-hidden size={13} strokeWidth={2.25} />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  published: 'success', approved: 'success', paid: 'success', resolved: 'success', active: 'success', forwarded: 'success', completed: 'success', closed: 'neutral',
  pending: 'warning', pending_review: 'warning', requested: 'warning', under_review: 'info', processing: 'info', submitted: 'info', in_progress: 'info', new: 'brand',
  flagged: 'warning', not_requested: 'neutral', cancelled: 'neutral', deleted: 'neutral',
  removed: 'danger', rejected: 'danger', reversed: 'danger', suspended: 'danger', banned: 'danger', failed: 'danger',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} className={className}>
      {status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}

export function Chip({
  selected, children, onClick, icon: Icon, className,
}: { selected?: boolean; children: ReactNode; onClick?: () => void; icon?: LucideIcon; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
        selected ? 'border-transparent bg-fg text-bg' : 'border-line bg-surface text-fg-2 hover:border-line-strong hover:text-fg',
        className,
      )}
    >
      {Icon && <Icon aria-hidden size={16} />}
      {children}
    </button>
  );
}

export function EmptyState({
  icon: Icon, title, description, action, className, compact,
}: { icon: LucideIcon; title: string; description?: string; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 py-10' : 'gap-3 py-16', className)}>
      <div className="relative mb-1">
        <div aria-hidden className="absolute inset-0 -z-10 scale-150 rounded-full bg-brand/10 blur-2xl" />
        <div className="flex size-16 items-center justify-center rounded-2xl border border-line bg-surface shadow-soft">
          <Icon aria-hidden size={28} className="text-brand" strokeWidth={1.75} />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-balance">{title}</h3>
      {description && <p className="max-w-sm text-sm text-fg-3 text-pretty">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  error, onRetry, title, className, compact,
}: { error?: ApiError | Error | null; onRetry?: () => void; title?: string; className?: string; compact?: boolean }) {
  const kind = (error as ApiError | undefined)?.kind;
  const offline = kind === 'network';
  const Icon = offline ? WifiOff : AlertTriangle;
  const heading =
    title ??
    (offline ? 'You are offline'
      : kind === 'not_found' ? 'Not found'
      : kind === 'forbidden' ? 'Permission denied'
      : kind === 'session_expired' || kind === 'unauthenticated' ? 'Session expired'
      : kind === 'unavailable' ? 'Service unavailable'
      : kind === 'not_configured' ? 'Backend not configured'
      : 'Something went wrong');
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 text-center', compact ? 'py-8' : 'py-16', className)}>
      <div className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <Icon aria-hidden size={26} strokeWidth={1.75} />
      </div>
      <h3 className="text-lg font-semibold">{heading}</h3>
      <p className="max-w-sm text-sm text-fg-3">{error?.message ?? 'Please try again.'}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {onRetry && (
          <button type="button" onClick={onRetry} className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3">
            <RefreshCw aria-hidden size={16} /> Try again
          </button>
        )}
        {kind === 'session_expired' || kind === 'unauthenticated' ? (
          <Link to="/login" className="inline-flex h-10 items-center rounded-xl bg-brand-gradient px-4 text-sm font-semibold text-on-brand">Sign in</Link>
        ) : !compact ? (
          <Link to="/" className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-fg-2 hover:bg-surface-2">Go home</Link>
        ) : null}
        {!compact && (kind === 'server' || kind === 'unavailable') && (
          <a href={`mailto:${env.supportEmail}`} className="inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-fg-2 hover:bg-surface-2">
            Contact support
          </a>
        )}
      </div>
    </div>
  );
}

export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' }) {
  return <As className={cn('rounded-2xl border border-line bg-surface shadow-soft', className)}>{children}</As>;
}
