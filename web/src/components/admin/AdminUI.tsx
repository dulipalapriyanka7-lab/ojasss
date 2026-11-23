import { ChevronLeft, ChevronRight, Search, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn, useDebounced } from '@/lib/utils';
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback';
import { Select } from '../ui/Field';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide on the mobile card layout (secondary info). */
  hideOnMobile?: boolean;
  /** Used as the card title on mobile. */
  primary?: boolean;
}

/**
 * Responsive data table: a real <table> on tablet/desktop, a list of tappable cards on
 * phones (no tiny horizontally-scrolling tables).
 */
export function DataTable<T>({
  rows, columns, rowKey, onRowClick, loading, error, onRetry, empty, actions, caption,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  empty: { icon: LucideIcon; title: string; description?: string };
  actions?: (row: T) => ReactNode;
  caption: string;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} compact />;
  if (loading || !rows) {
    return <div className="space-y-2" role="status" aria-label="Loading">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>;
  }
  if (rows.length === 0) return <EmptyState icon={empty.icon} title={empty.title} description={empty.description} compact />;

  const primary = columns.find((c) => c.primary) ?? columns[0];
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-line bg-surface-2/60 text-xs tracking-wide text-fg-3 uppercase">
            <tr>
              {columns.map((c) => <th key={c.key} scope="col" className={cn('px-4 py-3 font-semibold whitespace-nowrap', c.className)}>{c.header}</th>)}
              {actions && <th scope="col" className="px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr
                key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-surface-2/60')}
              >
                {columns.map((c) => <td key={c.key} className={cn('px-4 py-3 align-middle', c.className)}>{c.cell(r)}</td>)}
                {actions && <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>{actions(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className="rounded-2xl border border-line bg-surface">
            <button
              type="button"
              disabled={!onRowClick}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className="block w-full p-4 text-left disabled:cursor-default"
            >
              <div className="font-semibold">{primary.cell(r)}</div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {columns.filter((c) => c !== primary && !c.hideOnMobile).map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-fg-3">{c.header}</dt>
                    <dd className="truncate text-fg">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            </button>
            {actions && <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2.5">{actions(r)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pager({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  if (total <= limit) return total ? <p className="mt-3 text-xs text-fg-3">{total} result{total === 1 ? '' : 's'}</p> : null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3 text-sm">
      <p className="text-fg-3">{offset + 1}–{Math.min(total, offset + limit)} of {total}</p>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))} aria-label="Previous page" className="flex size-10 items-center justify-center rounded-lg border border-line disabled:opacity-40"><ChevronLeft size={18} /></button>
        <span className="px-2 tabular">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onChange(offset + limit)} aria-label="Next page" className="flex size-10 items-center justify-center rounded-lg border border-line disabled:opacity-40"><ChevronRight size={18} /></button>
      </div>
    </nav>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [local, setLocal] = useState(value);
  const debounced = useDebounced(local, 350);
  const changeRef = useRef(onChange);
  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    changeRef.current(debounced);
  }, [debounced]);
  return (
    <div className="relative min-w-0 sm:w-72">
      <Search aria-hidden size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
      <input
        type="search"
        aria-label={placeholder}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-brand"
      />
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="sm:w-48">
      <label className="sr-only" htmlFor={`f-${label}`}>{label}</label>
      <Select id={`f-${label}`} value={value} onChange={(e) => onChange(e.target.value)} className="!h-10 !rounded-xl text-sm">
        <option value="">{label}: All</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </div>
  );
}

export interface Range {
  key: 'today' | '7d' | '30d' | 'custom';
  from: string;
  to: string;
}

export function rangeFor(key: Range['key'], custom?: { from: string; to: string }): Range {
  const now = new Date();
  const to = new Date(now.getTime() + 60_000).toISOString();
  if (key === 'custom' && custom) return { key, from: new Date(custom.from).toISOString(), to: new Date(new Date(custom.to).getTime() + 86_399_000).toISOString() };
  const start = new Date(now);
  if (key === 'today') start.setHours(0, 0, 0, 0);
  else start.setDate(start.getDate() - (key === '7d' ? 7 : 30));
  return { key, from: start.toISOString(), to };
}

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [from, setFrom] = useState(value.from.slice(0, 10));
  const [to, setTo] = useState(value.to.slice(0, 10));
  const opts: Array<{ k: Range['key']; l: string }> = [{ k: 'today', l: 'Today' }, { k: '7d', l: '7 days' }, { k: '30d', l: '30 days' }, { k: 'custom', l: 'Custom' }];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label="Date range" className="inline-flex rounded-xl border border-line bg-surface p-1">
        {opts.map((o) => (
          <button
            key={o.k}
            type="button"
            role="radio"
            aria-checked={value.key === o.k}
            onClick={() => onChange(o.k === 'custom' ? rangeFor('custom', { from, to }) : rangeFor(o.k))}
            className={cn('h-8 rounded-lg px-3 text-xs font-semibold', value.key === o.k ? 'bg-fg text-bg' : 'text-fg-3 hover:text-fg')}
          >
            {o.l}
          </button>
        ))}
      </div>
      {value.key === 'custom' && (
        <div className="flex items-center gap-2 text-sm">
          <label className="sr-only" htmlFor="range-from">From</label>
          <input id="range-from" type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); onChange(rangeFor('custom', { from: e.target.value, to })); }} className="h-10 rounded-xl border border-line bg-surface px-2" />
          <span aria-hidden>–</span>
          <label className="sr-only" htmlFor="range-to">To</label>
          <input id="range-to" type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); onChange(rangeFor('custom', { from, to: e.target.value })); }} className="h-10 rounded-xl border border-line bg-surface px-2" />
        </div>
      )}
    </div>
  );
}

export function Kpi({ label, value, icon: Icon, hint, tone = 'neutral', onClick }: {
  label: string; value: ReactNode; icon: LucideIcon; hint?: ReactNode; tone?: 'neutral' | 'warning' | 'danger' | 'success' | 'brand'; onClick?: () => void;
}) {
  const toneCls = { neutral: 'bg-surface-2 text-fg-2', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', success: 'bg-success-soft text-success', brand: 'bg-brand-soft text-brand-ink' }[tone];
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp type={onClick ? 'button' : undefined} onClick={onClick} className={cn('rounded-2xl border border-line bg-surface p-4 text-left', onClick && 'transition-shadow hover:shadow-card')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-fg-3 uppercase">{label}</p>
        <span className={cn('flex size-8 items-center justify-center rounded-lg', toneCls)}><Icon aria-hidden size={16} /></span>
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tabular">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-fg-3">{hint}</p>}
    </Comp>
  );
}

export function SectionTitle({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function KV({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-fg-3">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
