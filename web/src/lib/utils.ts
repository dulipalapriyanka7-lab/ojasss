import { clsx, type ClassValue } from 'clsx';
import { useEffect, useRef, useState } from 'react';

export const cn = (...v: ClassValue[]) => clsx(v);

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/** Calls `onVisible` when the element enters the viewport (infinite scroll sentinel). */
export function useInView<T extends Element>(onVisible: () => void, rootMargin = '600px'): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  const cb = useRef(onVisible);
  useEffect(() => {
    cb.current = onVisible;
  }, [onVisible]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return ref;
}

/** Stable per-attempt idempotency key (regenerated only after a successful submit). */
export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function safeInternalPath(p: string | null | undefined, fallback = '/'): string {
  return p && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') ? p : fallback;
}
