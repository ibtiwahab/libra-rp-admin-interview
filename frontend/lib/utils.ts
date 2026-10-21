import { clsx, type ClassValue } from 'clsx';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(d: string | Date | null | undefined, pattern = 'dd MMM yyyy') {
  if (!d) return '—';
  return format(new Date(d), pattern);
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  return format(new Date(d), 'dd MMM yyyy · HH:mm');
}

export function fmtTime(d: string | Date | null | undefined, withSeconds = true) {
  if (!d) return '—';
  return format(new Date(d), withSeconds ? 'HH:mm:ss' : 'HH:mm');
}

export function fromNow(d: string | Date | null | undefined) {
  if (!d) return '—';
  return `${formatDistanceToNowStrict(new Date(d))} ago`;
}

export function fmtDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return sec ? `${m}m ${sec}s` : `${m}m`;
  return `${sec}s`;
}

/** Human timer label: 45 → "45 s", 180 → "3 min", 150 → "2 min 30 s". */
export function fmtTimer(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

export function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function humanize(v: string | null | undefined) {
  if (!v) return '—';
  return v
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function pct(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined) return '—';
  return `${Number(v).toFixed(digits).replace(/\.0$/, '')}%`;
}
