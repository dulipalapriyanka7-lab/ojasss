import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Spinner } from './Feedback';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'brand-soft';
type Size = 'sm' | 'md' | 'lg';

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background-color,color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-gradient text-on-brand shadow-[0_6px_20px_-6px_color-mix(in_srgb,var(--brand)_70%,transparent)] hover:brightness-[1.06]',
  secondary: 'bg-surface-2 text-fg hover:bg-surface-3',
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
  outline: 'border border-line-strong bg-surface text-fg hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-110',
  'brand-soft': 'bg-brand-soft text-brand-ink hover:brightness-95 dark:hover:brightness-125',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 rounded-lg px-3 text-sm',
  md: 'h-11 rounded-xl px-4 text-[15px]',
  lg: 'h-13 rounded-2xl px-6 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, leading, trailing, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={16} className="text-current" /> : leading}
      <span className={cn(loading && 'opacity-90')}>{children}</span>
      {!loading && trailing}
    </button>
  );
});

export function ButtonLink({
  variant = 'primary', size = 'md', block, className, leading, children, ...rest
}: LinkProps & { variant?: Variant; size?: Size; block?: boolean; leading?: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], block && 'w-full', className)} {...rest}>
      {leading}
      <span>{children}</span>
    </Link>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required accessible name — icon-only controls must be labelled. */
  label: string;
  variant?: 'ghost' | 'secondary' | 'glass' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  pressed?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', pressed, className, children, type = 'button', ...rest },
  ref,
) {
  const dims = { sm: 'size-9', md: 'size-11', lg: 'size-12' }[size];
  const look = {
    ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
    secondary: 'bg-surface-2 text-fg hover:bg-surface-3',
    outline: 'border border-line bg-surface text-fg hover:bg-surface-2',
    glass: 'glass-dark text-white hover:bg-black/50',
  }[variant];
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-90 disabled:opacity-40',
        dims, look, className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
