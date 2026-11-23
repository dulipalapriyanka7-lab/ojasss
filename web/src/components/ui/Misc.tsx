import { BadgeCheck, Crown } from 'lucide-react';
import { motion } from 'motion/react';
import { useId, useState, type ReactNode } from 'react';
import { avatarUrl } from '@/lib/media';
import { cn } from '@/lib/utils';

const PALETTE = ['#f0600f', '#e0337a', '#7c4dff', '#0e9f8e', '#2458d6', '#c2410c', '#9333ea', '#0891b2'];

export function Avatar({
  path, name, size = 40, className, ring, status = false, premium = false,
}: { path: string | null | undefined; name: string; size?: number; className?: string; ring?: boolean; status?: boolean; premium?: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = avatarUrl(path);
  const initials = name.replace(/^@/, '').split(/[\s._]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  const color = PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
  const avatar=(
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none', ring && 'ring-2 ring-bg', className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38), background: url && !failed ? undefined : color }}
    >
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
  if(!status&&!premium)return avatar;
  return <span className={cn('relative inline-flex shrink-0',status&&'avatar-status-frame')} style={{width:size,height:size}}>
    {avatar}
    {premium&&<span className="avatar-premium-crown" aria-label="Premium member"><Crown size={Math.max(11,Math.round(size*.34))}/></span>}
  </span>;
}

export function VerifiedMark({ size = 16, className }: { size?: number; className?: string }) {
  return <BadgeCheck aria-label="Verified creator" size={size} className={cn('shrink-0 fill-info text-surface', className)} />;
}

export function Logo({ className, compact, textClassName }: { className?: string; compact?: boolean; textClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {(compact || textClassName) && <img src="/brand/mark.png" width="36" height="36" alt="OJASSS" className={cn('shrink-0 rounded-lg', !compact && 'lg:hidden')} />}
      {!compact && <img src="/brand/logo.png" width="56" height="56" alt="OJASSS — The Indian Mass Power App" className={cn('h-14 w-14 shrink-0 rounded-lg object-contain', textClassName)} />}
    </span>
  );
}

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  /** Optional visual treatment for a selected tab (used by specialised profile tabs). */
  activeClassName?: string;
  indicatorClassName?: string;
}

/** Underline tabs with an animated indicator. */
export function Tabs<T extends string>({
  items, value, onChange, className, label,
}: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string; label: string }) {
  const layoutId = useId();
  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-1 overflow-x-auto border-b border-line scrollbar-none', className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'relative flex h-12 shrink-0 items-center gap-2 px-4 text-sm font-semibold transition-colors',
              active ? cn('text-fg', it.activeClassName) : 'text-fg-3 hover:text-fg-2',
            )}
          >
            {it.label}
            {it.count !== undefined && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular text-fg-2">{it.count}</span>}
            {active && <motion.span layoutId={layoutId} className={cn('absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand', it.indicatorClassName)} transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
          </button>
        );
      })}
    </div>
  );
}

/** Pill segmented control. */
export function Segmented<T extends string>({
  items, value, onChange, className, label, size = 'md',
}: { items: TabItem<T>[]; value: T; onChange: (v: T) => void; className?: string; label: string; size?: 'sm' | 'md' }) {
  const layoutId = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-full bg-surface-2 p-1', className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(it.value)}
            className={cn('relative rounded-full font-semibold transition-colors', size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm', active ? 'text-fg' : 'text-fg-3 hover:text-fg-2')}
          >
            {active && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-surface shadow-soft" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
            <span className="relative">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone = 'neutral' }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'neutral' | 'brand' }) {
  return (
    <div className={cn('rounded-2xl border border-line p-4', tone === 'brand' ? 'bg-brand-soft' : 'bg-surface')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-fg-3 uppercase">{label}</p>
        {icon}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tabular">{value}</p>
      {hint && <p className="mt-1 text-xs text-fg-3">{hint}</p>}
    </div>
  );
}
