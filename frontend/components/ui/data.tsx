'use client';

import { Check, ChevronLeft, ChevronRight, Copy, Inbox } from 'lucide-react';
import { useState } from 'react';
import { cn, humanize } from '@/lib/utils';
import { Button } from './button';

// ── Badge ──
type Tone = 'neutral' | 'gold' | 'ok' | 'warn' | 'bad' | 'azure' | 'violet' | 'muted';

const toneClass: Record<Tone, string> = {
  neutral: 'border-white/10 bg-white/[0.05] text-fg-2',
  gold: 'border-gold/30 bg-gold/10 text-gold-bright',
  ok: 'border-ok/30 bg-ok/10 text-[#7FD3B1]',
  warn: 'border-warn/30 bg-warn/10 text-[#F0C47A]',
  bad: 'border-bad/35 bg-bad/10 text-[#F29790]',
  azure: 'border-azure/30 bg-azure/10 text-[#A9C3F7]',
  violet: 'border-violet/30 bg-violet/10 text-[#C3B9FA]',
  muted: 'border-white/[0.06] bg-transparent text-fg-3',
};

export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-2 text-[10.5px] font-bold uppercase tracking-[0.08em]', toneClass[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'azure',
  COMPLETED: 'ok',
  DISQUALIFIED: 'bad',
  EXPIRED: 'warn',
  CANCELLED: 'muted',
  PENDING: 'neutral',
  UNDER_REVIEW: 'violet',
  PASSED: 'ok',
  FAILED: 'bad',
  ACTIVE: 'ok',
  DISABLED: 'warn',
  ARCHIVED: 'muted',
  REMOVED: 'muted',
  DRAFT: 'neutral',
  PUBLISHED: 'gold',
  INFO: 'neutral',
  WARNING: 'warn',
  CRITICAL: 'bad',
  SUBMITTED: 'ok',
  TIMED_OUT: 'warn',
  TERMINATED: 'bad',
  NOT_REACHED: 'muted',
  ONLINE: 'ok',
  UNSTABLE: 'warn',
  OFFLINE: 'bad',
  SECURE: 'ok',
  NONE: 'muted',
};

export function StatusBadge({ status, label, dot = true }: { status: string | null | undefined; label?: string; dot?: boolean }) {
  if (!status) return <Badge tone="muted">—</Badge>;
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot={dot}>
      {label ?? humanize(status)}
    </Badge>
  );
}

// ── Table ──
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative w-full overflow-x-auto', className)}>
      <table className="w-full border-separate border-spacing-0 text-left text-[13px]">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="sticky top-0 z-[1]">{children}</thead>;
}
export function TH({ children, className, align }: { children?: React.ReactNode; className?: string; align?: 'right' | 'center' }) {
  return (
    <th className={cn('whitespace-nowrap border-b border-line bg-[#12141A]/95 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-fg-3 backdrop-blur first:pl-5 last:pr-5', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>
      {children}
    </th>
  );
}
export function TR({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr onClick={onClick} className={cn('group/row transition-colors [&>td]:border-b [&>td]:border-line last:[&>td]:border-b-0', onClick && 'cursor-pointer hover:bg-white/[0.025]', className)}>
      {children}
    </tr>
  );
}
export function TD({ children, className, align, colSpan }: { children?: React.ReactNode; className?: string; align?: 'right' | 'center'; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn('px-4 py-3 align-middle text-fg-2 first:pl-5 last:pr-5', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>
      {children}
    </td>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TR key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <TD key={c}>
              <div className="skeleton h-3.5" style={{ width: `${45 + ((r * 7 + c * 13) % 45)}%` }} />
            </TD>
          ))}
        </TR>
      ))}
    </>
  );
}

// ── Empty state ──
export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="relative mb-5">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-[10px] border border-line-2 bg-surface text-fg-3 [&_svg]:h-5 [&_svg]:w-5">
          {icon ?? <Inbox />}
        </div>
      </div>
      <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1.5 max-w-[420px] text-[13px] leading-relaxed text-fg-3">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Counter (plain number; kept as a component for existing call sites) ──
export function Counter({ value, decimals = 0, suffix = '', className }: { value: number; decimals?: number; suffix?: string; className?: string }) {
  return <span className={cn('tabular', className)}>{`${value.toFixed(decimals)}${suffix}`}</span>;
}

// ── Pagination ──
export function Pagination({ page, totalPages, total, onPage, label = 'records' }: { page: number; totalPages: number; total: number; onPage: (p: number) => void; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3">
      <p className="text-[12px] text-fg-3">
        <span className="tabular font-semibold text-fg-2">{total.toLocaleString()}</span> {label}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[12px] tabular text-fg-3">
          Page {page} of {totalPages}
        </span>
        <Button size="icon-sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button size="icon-sm" variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Copy ──
export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size={label ? 'sm' : 'icon-sm'}
      variant="secondary"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      aria-label={label ?? 'Copy'}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
      {label && (copied ? 'Copied' : label)}
    </Button>
  );
}

// ── Key/value ──
export function KV({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="label-caps !text-[9.5px]">{label}</dt>
      <dd className={cn('mt-1 truncate text-[13.5px] font-semibold text-fg', mono && 'font-mono text-[12.5px] font-medium')}>{children ?? '—'}</dd>
    </div>
  );
}

// ── Progress ──
export function ProgressBar({ value, max, tone = 'gold', className }: { value: number; max: number; tone?: 'gold' | 'ok' | 'bad' | 'azure'; className?: string }) {
  const pctv = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = { gold: 'from-gold-deep via-gold to-gold-bright', ok: 'from-ok/60 to-ok', bad: 'from-bad/60 to-bad', azure: 'from-azure/60 to-azure' }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div className={cn('h-full rounded-full bg-gradient-to-r', color)} style={{ width: `${pctv}%` }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex h-8 w-8', className)} role="status" aria-label="Loading">
      <span className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
      <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-gold" />
    </span>
  );
}
