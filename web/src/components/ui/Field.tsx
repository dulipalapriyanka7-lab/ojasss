import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-fg placeholder:text-fg-3 transition-[border-color,box-shadow] duration-150 outline-none hover:border-line-strong focus:border-brand focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_18%,transparent)] disabled:opacity-60 aria-[invalid=true]:border-danger';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string; required?: boolean }) => ReactNode;
  trailingLabel?: ReactNode;
}

/** Visible label + hint + inline error, wired with aria attributes. */
export function Field({ label, hint, error, required, className, children, trailingLabel }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
          {required && <span aria-hidden className="text-danger"> *</span>}
        </label>
        {trailingLabel}
      </div>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': [hintId, errId].filter(Boolean).join(' ') || undefined, required })}
      {hint && !error && <p id={hintId} className="text-xs text-fg-3">{hint}</p>}
      {error && <p id={errId} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { leading?: ReactNode }>(
  function Input({ className, leading, ...rest }, ref) {
    if (!leading) return <input ref={ref} className={cn(control, 'h-12', className)} {...rest} />;
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-fg-3">{leading}</span>
        <input ref={ref} className={cn(control, 'h-12 pl-10', className)} {...rest} />
      </div>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest }, ref,
) {
  return <textarea ref={ref} className={cn(control, 'min-h-28 resize-y py-3 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest }, ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, 'h-12 appearance-none pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden size={18} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-fg-3" />
    </div>
  );
});

export function Switch({
  checked, onChange, label, description, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {description && <p className="text-xs text-fg-3">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50',
          checked ? 'bg-brand' : 'bg-surface-3',
        )}
      >
        <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-6' : 'translate-x-1')} />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, children, id: idProp }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; id?: string }) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-md accent-[var(--brand)]"
      />
      <span className="text-fg-2">{children}</span>
    </label>
  );
}
