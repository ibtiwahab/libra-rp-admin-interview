import { RotateCcw } from 'lucide-react';
import type { Interruption } from '@/lib/types';
import { fmtDateTime, humanize } from '@/lib/utils';

/** Every time the attempt ended early and staff allowed the candidate to continue. */
export function InterruptionList({ items }: { items: Interruption[] }) {
  return (
    <div className="rounded-[12px] border border-warn/30 bg-warn/[0.06] p-4">
      <div className="flex items-center gap-2">
        <RotateCcw className="h-4 w-4 text-warn" />
        <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-warn">
          Interrupted {items.length === 1 ? 'once' : `${items.length} times`}
        </p>
      </div>
      <ol className="mt-3 space-y-3">
        {items.map((i, n) => (
          <li key={n} className="text-[13px] leading-relaxed text-fg-2">
            <p>
              <span className="font-semibold">{i.status === 'DISQUALIFIED' ? 'Disqualified' : 'Disconnected'}</span>
              {i.violation ? ` — ${humanize(i.violation.type)}` : ''}
              {i.endedAt ? ` · ${fmtDateTime(i.endedAt)}` : ''}
            </p>
            {i.violation?.reason && <p className="text-fg-3">{i.violation.reason}</p>}
            <p className="text-fg-3">
              {i.allowedBy} allowed it to continue from question {i.resumeFromQuestion} on {fmtDateTime(i.allowedAt)}: “{i.reason}”
            </p>
            <p className="text-[12px] text-fg-4">
              {i.resumedAt ? `Continued ${fmtDateTime(i.resumedAt)}` : i.withdrawnAt ? `Not continued — withdrawn ${fmtDateTime(i.withdrawnAt)}` : 'Waiting for the candidate to continue'}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
