import { cn } from '@/lib/utils';

/**
 * LIBRA RP emblem — an original mark: a balance beam set inside a faceted shield,
 * representing integrity and authority. Drawn as inline SVG (no third-party assets).
 */
export function LibraMark({ className, glow = false }: { className?: string; glow?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-9 w-9', className)} aria-hidden>
      <defs>
        <linearGradient id="lm-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F6E7BF" />
          <stop offset="0.35" stopColor="#C9A961" />
          <stop offset="0.7" stopColor="#8C7038" />
          <stop offset="1" stopColor="#E2C98D" />
        </linearGradient>
        <linearGradient id="lm-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1B1E26" />
          <stop offset="1" stopColor="#0B0C10" />
        </linearGradient>
        {glow && (
          <filter id="lm-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <g filter={glow ? 'url(#lm-glow)' : undefined}>
        <path d="M32 3 L56 12 L56 31 C56 46 45 56 32 61 C19 56 8 46 8 31 L8 12 Z" fill="url(#lm-face)" stroke="url(#lm-gold)" strokeWidth="2" />
        <path d="M32 8.5 L51 15.6 L51 31 C51 43 42.5 51.2 32 55.4" fill="none" stroke="url(#lm-gold)" strokeOpacity="0.35" strokeWidth="0.8" />
        {/* pillar */}
        <path d="M32 17 L32 45" stroke="url(#lm-gold)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M25.5 46 H38.5" stroke="url(#lm-gold)" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="32" cy="16.5" r="2.4" fill="url(#lm-gold)" />
        {/* beam */}
        <path d="M17 22 H47" stroke="url(#lm-gold)" strokeWidth="2" strokeLinecap="round" />
        {/* pans */}
        <path d="M19 22 L14.5 32 M19 22 L23.5 32" stroke="url(#lm-gold)" strokeWidth="1.1" />
        <path d="M45 22 L40.5 32 M45 22 L49.5 32" stroke="url(#lm-gold)" strokeWidth="1.1" />
        <path d="M13 32 Q19 37 25 32 Z" fill="url(#lm-gold)" />
        <path d="M39 32 Q45 37 51 32 Z" fill="url(#lm-gold)" />
      </g>
    </svg>
  );
}

export function Wordmark({ className, sub = true }: { className?: string; sub?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <LibraMark />
      <div className="leading-none">
        <div className="font-display text-[22px] font-semibold text-gold-metal">Libra RP</div>
        {sub && <div className="mt-0.5 text-[11.5px] text-fg-3">Staff Recruitment</div>}
      </div>
    </div>
  );
}
