'use client';

import { cn } from '@/lib/utils';

export function timerTone(ms: number) {
  if (ms <= 10_000) return 'red' as const;
  if (ms <= 15_000) return 'amber' as const;
  return 'gold' as const;
}

const COLORS = {
  gold: { stroke: '#C9A961', text: 'text-gold-bright', glow: 'drop-shadow(0 0 10px rgba(201,169,97,0.35))' },
  amber: { stroke: '#DBA54A', text: 'text-[#F0C47A]', glow: 'drop-shadow(0 0 12px rgba(219,165,74,0.45))' },
  red: { stroke: '#E05D55', text: 'text-[#F29790]', glow: 'drop-shadow(0 0 14px rgba(224,93,85,0.55))' },
};

function parts(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return { m: String(Math.floor(total / 60)).padStart(2, '0'), s: String(total % 60).padStart(2, '0') };
}

/** Large circular countdown. Gold → amber (<15s) → red (<10s) → subtle pulse (final 5s). */
export function CountdownRing({ remainingMs, totalSeconds, size = 168 }: { remainingMs: number; totalSeconds: number; size?: number }) {
  const tone = timerTone(remainingMs);
  const c = COLORS[tone];
  const r = 70;
  const circ = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(1, remainingMs / (totalSeconds * 1000)));
  const { m, s } = parts(remainingMs);
  const final = remainingMs <= 5_000 && remainingMs > 0;
  return (
    <div className={cn('relative', final && 'animate-pulse-soft')} style={{ width: size, height: size }} role="timer" aria-live="off" aria-label={`${m} minutes ${s} seconds remaining`}>
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" style={{ filter: c.glow }}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i / 60) * Math.PI * 2;
          const inner = i % 5 === 0 ? 58 : 61;
          return <line key={i} x1={80 + Math.cos(a) * inner} y1={80 + Math.sin(a) * inner} x2={80 + Math.cos(a) * 63} y2={80 + Math.sin(a) * 63} stroke="rgba(255,255,255,0.12)" strokeWidth={i % 5 === 0 ? 1.4 : 0.7} />;
        })}
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke={c.stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-mono text-[34px] font-semibold leading-none tabular tracking-[-0.02em] transition-colors', c.text)}>
          {m}:{s}
        </span>
        <span className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.28em] text-fg-4">Remaining</span>
      </div>
    </div>
  );
}

export function DigitalTimer({ remainingMs }: { remainingMs: number }) {
  const tone = timerTone(remainingMs);
  const { m, s } = parts(remainingMs);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[8px] border px-3 py-1.5 font-mono text-[18px] font-semibold leading-none tabular transition-colors',
        tone === 'gold' && 'border-gold/30 bg-gold/[0.07] text-gold-bright',
        tone === 'amber' && 'border-warn/40 bg-warn/10 text-[#F0C47A]',
        tone === 'red' && 'border-bad/50 bg-bad/15 text-[#F29790]',
        remainingMs <= 5_000 && remainingMs > 0 && 'animate-pulse-soft',
      )}
    >
      {m}:{s}
    </span>
  );
}
