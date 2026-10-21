'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  icon,
  tone = 'default',
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: React.ReactNode;
  tone?: 'default' | 'danger' | 'gold';
  dismissible?: boolean;
}) {
  const width = { sm: 'max-w-[420px]', md: 'max-w-[560px]', lg: 'max-w-[760px]', xl: 'max-w-[980px]' }[size];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (dismissible || o ? onOpenChange(o) : undefined)}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-[6px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </DialogPrimitive.Overlay>
            <div className="fixed inset-0 z-[61] flex items-start justify-center overflow-y-auto p-4 pt-[8vh] sm:p-6 sm:pt-[10vh]">
              <DialogPrimitive.Content
                asChild
                forceMount
                onEscapeKeyDown={(e) => !dismissible && e.preventDefault()}
                onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
              >
                <motion.div
                  className={cn('relative w-full overflow-hidden rounded-[16px] border border-white/[0.09] bg-[linear-gradient(180deg,#1A1D25_0%,#131519_100%)] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.05)]', width)}
                  initial={{ opacity: 0, y: 14, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.99 }}
                  transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div
                    className={cn(
                      'pointer-events-none absolute inset-x-0 top-0 h-px',
                      tone === 'danger' ? 'bg-[linear-gradient(90deg,transparent,rgba(224,93,85,0.7),transparent)]' : 'bg-[linear-gradient(90deg,transparent,rgba(201,169,97,0.6),transparent)]',
                    )}
                  />
                  <div className="flex items-start gap-4 px-6 pb-2 pt-6">
                    {icon && (
                      <div
                        className={cn(
                          'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border [&_svg]:h-[18px] [&_svg]:w-[18px]',
                          tone === 'danger' ? 'border-bad/30 bg-bad/10 text-bad' : 'border-gold/30 bg-gold/10 text-gold-bright',
                        )}
                      >
                        {icon}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <DialogPrimitive.Title className="font-display text-[22px] font-semibold leading-tight text-fg">{title}</DialogPrimitive.Title>
                      {description ? (
                        <DialogPrimitive.Description className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{description}</DialogPrimitive.Description>
                      ) : (
                        <DialogPrimitive.Description className="sr-only">Dialog</DialogPrimitive.Description>
                      )}
                    </div>
                    {dismissible && (
                      <DialogPrimitive.Close className="rounded-md p-1.5 text-fg-3 transition hover:bg-white/5 hover:text-fg" aria-label="Close">
                        <X className="h-4 w-4" />
                      </DialogPrimitive.Close>
                    )}
                  </div>
                  {children && <div className="px-6 py-4">{children}</div>}
                  {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-black/20 px-6 py-4">{footer}</div>}
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
