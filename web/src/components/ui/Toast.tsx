import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '@/api/client';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  success: (message: string, action?: ToastItem['action']) => void;
  error: (messageOrError: unknown, action?: ToastItem['action']) => void;
  info: (message: string, action?: ToastItem['action']) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((tone: ToastTone, message: string, action?: ToastItem['action']) => {
    const id = ++seq.current;
    setItems((prev) => [...prev.slice(-2), { id, tone, message, action }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (m, a) => push('success', m, a),
    info: (m, a) => push('info', m, a),
    error: (e, a) => push('error', e instanceof ApiError ? e.message : typeof e === 'string' ? e : 'Something went wrong. Please try again.', a),
  }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[200] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? XCircle : Info;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', damping: 26, stiffness: 380 }}
                role={t.tone === 'error' ? 'alert' : 'status'}
                className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-[#1b1924]/95 px-4 py-3 text-sm text-white shadow-float backdrop-blur"
              >
                <Icon aria-hidden size={20} className={cn('shrink-0', t.tone === 'success' ? 'text-[#3ccf91]' : t.tone === 'error' ? 'text-[#ff6b74]' : 'text-[#7aa2ff]')} />
                <span className="min-w-0 flex-1">{t.message}</span>
                {t.action && (
                  <button type="button" onClick={t.action.onClick} className="shrink-0 rounded-lg px-2 py-1 font-semibold text-[#ffb27a] hover:bg-white/10">
                    {t.action.label}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside ToastProvider');
  return v;
}
