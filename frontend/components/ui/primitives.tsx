'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Tooltip ──
export function Tooltip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-[90] max-w-[280px] rounded-[7px] border border-white/10 bg-[#1B1E26] px-2.5 py-1.5 text-[11.5px] leading-snug text-fg-2 shadow-xl">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ── Switch ──
export function Switch({ checked, onCheckedChange, disabled, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; id?: string }) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border border-line-2 bg-surface-3 transition-colors data-[state=checked]:border-gold/70 data-[state=checked]:bg-gold/80 disabled:opacity-50"
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-[2px] rounded-full bg-fg shadow transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-gold-ink" />
    </SwitchPrimitive.Root>
  );
}

// ── Checkbox ──
export function Checkbox({ checked, onCheckedChange, id, disabled, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; id?: string; disabled?: boolean; className?: string }) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className={cn(
        'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border border-white/20 bg-ink-2 transition data-[state=checked]:border-gold data-[state=checked]:bg-gold focus-visible:outline-2',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="h-3 w-3 text-gold-ink" strokeWidth={3.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

// ── Tabs ──
export function Tabs({
  value,
  onValueChange,
  items,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: { value: string; label: React.ReactNode; count?: number }[];
  className?: string;
  /** @deprecated kept for call-site compatibility */
  layoutId?: string;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange}>
      <TabsPrimitive.List className={cn('inline-flex items-center gap-1 rounded-[10px] border border-line bg-black/25 p-1', className)}>
        {items.map((it) => (
          <TabsPrimitive.Trigger
            key={it.value}
            value={it.value}
            className="relative rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold text-fg-3 outline-none transition-colors hover:text-fg-2 data-[state=active]:text-fg"
          >
            {value === it.value && <span className="absolute inset-0 rounded-[7px] border border-white/10 bg-surface-2" />}
            <span className="relative flex items-center gap-1.5">
              {it.label}
              {typeof it.count === 'number' && <span className="rounded-full bg-white/[0.07] px-1.5 text-[10.5px] tabular text-fg-3">{it.count}</span>}
            </span>
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}

// ── Dropdown ──
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;

export function DropdownContent({ children, align = 'end', className }: { children: React.ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn('z-[80] min-w-[200px] rounded-[10px] border border-line-2 bg-[#15171E]/98 p-1 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl', className)}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function DropdownItem({ children, onSelect, danger, disabled, icon }: { children: React.ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <DropdownPrimitive.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[13px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:h-4 [&_svg]:w-4',
        danger ? 'text-bad data-[highlighted]:bg-bad/10' : 'text-fg-2 data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-fg',
      )}
    >
      {icon && <span className={danger ? 'text-bad' : 'text-fg-3'}>{icon}</span>}
      {children}
    </DropdownPrimitive.Item>
  );
}

export function DropdownSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-line" />;
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <DropdownPrimitive.Label className="px-2.5 pb-1 pt-2 label-caps !text-[9.5px]">{children}</DropdownPrimitive.Label>;
}
