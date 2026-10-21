import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold tracking-[0.01em] transition-[background,box-shadow,color,transform,border-color] duration-200 ease-out disabled:pointer-events-none disabled:opacity-45 active:translate-y-px select-none',
  {
    variants: {
      variant: {
        primary: 'bg-gold text-gold-ink hover:bg-gold-bright',
        secondary: 'bg-surface-2 text-fg border border-line-2 hover:bg-surface-3',
        outline: 'border border-gold/40 text-gold-bright bg-gold/[0.04] hover:bg-gold/[0.09] hover:border-gold/60',
        ghost: 'text-fg-2 hover:text-fg hover:bg-white/[0.05]',
        danger: 'bg-bad/90 text-white hover:bg-bad',
        'danger-ghost': 'text-bad hover:bg-bad/10',
        link: 'text-gold hover:text-gold-bright underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        xs: 'h-7 px-2.5 text-[12px] rounded-[6px]',
        sm: 'h-8 px-3 text-[12.5px] rounded-[7px]',
        md: 'h-10 px-4 text-[13.5px] rounded-[9px]',
        lg: 'h-11 px-5 text-[14px] rounded-[8px]',
        xl: 'h-12 px-6 text-[15px] rounded-[8px]',
        icon: 'h-9 w-9 rounded-[8px]',
        'icon-sm': 'h-7 w-7 rounded-[6px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
});
Button.displayName = 'Button';
