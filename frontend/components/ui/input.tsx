import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

const base =
  'w-full rounded-[9px] border border-line-2 bg-ink-2/80 text-[13.5px] text-fg placeholder:text-fg-4 transition-[border-color,box-shadow,background] duration-150 outline-none hover:border-white/15 focus:border-gold/55 focus:bg-ink-2 focus:shadow-[0_0_0_3px_rgba(201,169,97,0.12)] disabled:opacity-50 aria-[invalid=true]:border-bad/60 aria-[invalid=true]:focus:shadow-[0_0_0_3px_rgba(224,93,85,0.15)]';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, icon, trailing, ...props }, ref) => {
  if (!icon && !trailing) return <input ref={ref} className={cn(base, 'h-10 px-3.5', className)} {...props} />;
  return (
    <div className="relative">
      {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
      <input ref={ref} className={cn(base, 'h-10', icon ? 'pl-9' : 'pl-3.5', trailing ? 'pr-10' : 'pr-3.5', className)} {...props} />
      {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
    </div>
  );
});
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-[96px] px-3.5 py-2.5 leading-relaxed resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-[12px] font-semibold text-fg-2 tracking-[0.02em]', className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
  required,
  aside,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  aside?: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <Label htmlFor={htmlFor}>
              {label}
              {required && <span className="ml-0.5 text-gold">*</span>}
            </Label>
          )}
          {aside}
        </div>
      )}
      {children}
      {error ? <p className="text-[11.5px] font-medium text-bad">{error}</p> : hint ? <p className="text-[11.5px] text-fg-3">{hint}</p> : null}
    </div>
  );
}
