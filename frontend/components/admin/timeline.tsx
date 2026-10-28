'use client';

import { AlertOctagon, CheckCircle2, Clock, Flag, LogIn, LogOut, Play, RotateCcw, Save, ShieldAlert, ShieldX, TimerOff, Wifi, XCircle } from 'lucide-react';
import type { SecurityEventRow } from '@/lib/types';
import { cn, fmtTime, humanize } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LOGIN_SUCCESS: LogIn,
  LOGIN_FAILED: XCircle,
  LOGOUT: LogOut,
  INTERVIEW_STARTED: Play,
  QUESTION_STARTED: Flag,
  QUESTION_SUBMITTED: CheckCircle2,
  QUESTION_TIMEOUT: TimerOff,
  ANSWER_SAVED: Save,
  INTERVIEW_COMPLETED: CheckCircle2,
  INTERVIEW_DISQUALIFIED: ShieldX,
  INTERVIEW_TERMINATED_BY_ADMIN: ShieldX,
  INTERVIEW_EXPIRED: Clock,
  RESUME_ALLOWED: RotateCcw,
  INTERVIEW_RESUMED: Play,
  SESSION_TIMEOUT: Wifi,
  TAB_HIDDEN: AlertOctagon,
  WINDOW_BLURRED: AlertOctagon,
  PAGE_EXIT: AlertOctagon,
  PAGE_RELOAD_DETECTED: AlertOctagon,
  CONCURRENT_LOGIN_ATTEMPT: ShieldAlert,
};

const SOURCE_LABEL: Record<string, string> = { CLIENT_REPORTED: 'Browser-reported', SERVER: 'Server-confirmed', HEARTBEAT: 'Heartbeat expiry', ADMIN: 'Administrative' };

export function EventTimeline({ events, dense }: { events: SecurityEventRow[]; dense?: boolean }) {
  if (!events.length) return <p className="py-8 text-center text-[12.5px] text-fg-4">No events recorded.</p>;
  return (
    <ol className="relative">
      <span className="absolute bottom-3 left-[15px] top-3 w-px bg-gradient-to-b from-white/10 via-white/[0.06] to-transparent" />
      {events.map((e) => {
        const Icon = ICONS[e.eventType] ?? Flag;
        const critical = e.severity === 'CRITICAL';
        const warn = e.severity === 'WARNING';
        return (
          <li key={e.id} className={cn('relative flex gap-3.5', dense ? 'py-1.5' : 'py-2.5')}>
            <span
              className={cn(
                'relative z-[1] mt-0.5 flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-[9px] border',
                critical ? 'border-bad/40 bg-bad/15 text-bad' : warn ? 'border-warn/35 bg-warn/10 text-warn' : 'border-white/10 bg-surface-2 text-fg-3',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span className="font-mono text-[11.5px] tabular text-fg-3">{fmtTime(e.serverTimestamp)}</span>
                <span className={cn('text-[12.5px] font-bold', critical ? 'text-[#F29790]' : warn ? 'text-[#F0C47A]' : 'text-fg')}>{humanize(e.eventType)}</span>
                {e.questionIndex !== null && e.questionIndex !== undefined && <span className="text-[11px] text-fg-4">Q{e.questionIndex + 1}</span>}
                <span className="rounded-[4px] border border-white/[0.07] px-1.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-fg-4">{SOURCE_LABEL[e.source] ?? e.source}</span>
              </div>
              {e.message && <p className="mt-0.5 text-[12px] leading-relaxed text-fg-3">{e.message}</p>}
              {e.clientTimestamp && <p className="text-[10.5px] text-fg-4">Client clock: {fmtTime(e.clientTimestamp)} (informational)</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
