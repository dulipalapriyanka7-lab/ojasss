import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn, useIsDesktop } from '@/lib/utils';
import { Button, IconButton } from './Button';
import { Field, Textarea } from './Field';
import {platform} from '@/lib/platform';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

let openCount = 0;
const openPanels:HTMLDivElement[]=[];

// Fixed sheets follow the visible viewport, including the space above the keyboard.
function useVisibleViewport(open:boolean) {
  const [viewport,setViewport]=useState<{height:number;width:number;top:number;left:number}|null>(null);
  useEffect(()=>{
    if(!open)return;
    const visible=window.visualViewport;
    const update=()=>setViewport({height:visible?.height??window.innerHeight,width:visible?.width??window.innerWidth,top:visible?.offsetTop??0,left:visible?.offsetLeft??0});
    update();
    visible?.addEventListener('resize',update);
    visible?.addEventListener('scroll',update);
    window.addEventListener('resize',update);
    return ()=>{visible?.removeEventListener('resize',update);visible?.removeEventListener('scroll',update);window.removeEventListener('resize',update);};
  },[open]);
  return viewport;
}

/** Focus trap + Escape + scroll lock + focus restore, shared by Dialog and Sheet. */
function useModal(open: boolean, onClose: () => void, panel: React.RefObject<HTMLDivElement | null>) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    openCount += 1;
    const node=panel.current;if(node)openPanels.push(node);
    platform.send({type:'modal',open:true});
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      (el ?? panel.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if(openPanels.at(-1)!==panel.current)return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && panel.current) {
        const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      openCount -= 1;
      if(node){const index=openPanels.indexOf(node);if(index!==-1)openPanels.splice(index,1);}
      platform.send({type:'modal',open:openCount>0});
      if (openCount === 0) document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, panel]);
}

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Hide the visual title (still announced). */
  hideTitle?: boolean;
  className?: string;
}

/** Centered dialog on desktop, bottom sheet on mobile. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md', hideTitle, className }: OverlayProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const desktop = useIsDesktop();
  const viewport=useVisibleViewport(open);
  useModal(open, onClose, panel);
  const width = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6" style={viewport?{top:viewport.top,left:viewport.left,width:viewport.width,height:viewport.height,bottom:'auto',right:'auto'}:undefined}>
          <motion.div
            className="absolute inset-0 bg-[var(--overlay)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            style={viewport?{maxHeight:Math.max(0,viewport.height-(desktop?48:8))}:undefined}
            initial={desktop ? { opacity: 0, scale: 0.96, y: 8 } : { y: '100%' }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.98, y: 4 } : { y: '100%' }}
            transition={desktop ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] } : { type: 'spring', damping: 32, stiffness: 340 }}
            className={cn(
              'relative flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[28px] border border-line bg-surface shadow-float outline-none sm:rounded-3xl',
              width,
              className,
            )}
          >
            <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" />
            <header className={cn('flex items-start gap-3 px-5 pt-4 pb-2 sm:px-6 sm:pt-5', hideTitle && 'sr-only')}>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
                {description && <p id={descId} className="mt-1 text-sm text-fg-3">{description}</p>}
              </div>
              <IconButton label="Close" size="sm" onClick={onClose} className="-mr-1.5">
                <X size={20} />
              </IconButton>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">{children}</div>
            {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Side drawer (right on desktop, full-height sheet on mobile). Used for admin detail panels. */
export function Drawer({ open, onClose, title, description, children, footer, className }: OverlayProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModal(open, onClose, panel);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <motion.div className="absolute inset-0 bg-[var(--overlay)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 34, stiffness: 320 }}
            className={cn('relative flex h-full w-full max-w-xl flex-col border-l border-line bg-surface shadow-float outline-none', className)}
          >
            <header className="flex items-start gap-3 border-b border-line px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="truncate text-lg font-semibold">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-fg-3">{description}</p>}
              </div>
              <IconButton label="Close" size="sm" onClick={onClose}><X size={20} /></IconButton>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
            {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export interface ConfirmOptions {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  /** Require a written reason (recorded in the audit log). */
  reasonLabel?: string;
  reasonRequired?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', tone = 'primary',
  reasonLabel, reasonRequired, loading, children,
}: ConfirmOptions) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const invalid = !!reasonRequired && reason.trim().length < 3;
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setReason('');
      setTouched(false);
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={() => {
              setTouched(true);
              if (!invalid) void onConfirm(reason.trim());
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {reasonLabel && (
        <Field label={reasonLabel} required={reasonRequired} error={touched && invalid ? 'Please enter at least 3 characters.' : null} className="mt-2">
          {(p) => <Textarea {...p} data-autofocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-20" />}
        </Field>
      )}
    </Dialog>
  );
}
