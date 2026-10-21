'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  hint?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  className,
  disabled,
  id,
  size = 'md',
  'aria-invalid': ariaInvalid,
}: {
  value: string | undefined;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  size?: 'sm' | 'md';
  'aria-invalid'?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-invalid={ariaInvalid}
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 rounded-[9px] border border-line-2 bg-ink-2/80 px-3 text-left text-[13px] text-fg outline-none transition hover:border-white/15 focus:border-gold/55 focus:shadow-[0_0_0_3px_rgba(201,169,97,0.12)] data-[placeholder]:text-fg-4 disabled:opacity-50 aria-[invalid=true]:border-bad/60',
          size === 'sm' ? 'h-8 text-[12.5px]' : 'h-10',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 text-fg-3" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-[80] max-h-[320px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[10px] border border-line-2 bg-[#15171E]/98 p-1 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl data-[state=open]:animate-in"
        >
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-[7px] py-2 pl-8 pr-3 text-[13px] text-fg-2 outline-none data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-fg data-[state=checked]:text-gold-bright"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2.5">
                  <Check className="h-3.5 w-3.5" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                {o.hint && <span className="ml-auto text-[11px] text-fg-4">{o.hint}</span>}
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
