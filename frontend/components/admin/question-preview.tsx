'use client';

import { CheckCircle2, Eye, FileText, Timer } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import type { QuestionOption, QuestionType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { TYPE_META } from './question-editor';

export interface PreviewQuestion {
  title: string;
  prompt: string;
  scenario?: string;
  type: QuestionType;
  timeLimitSeconds: number;
  maxScore: number;
  options: QuestionOption[];
  correctOptionKeys: string[];
  correctBoolean: boolean | null;
  rubric?: string;
  categoryName?: string | null;
}

/** Renders a question the way a candidate sees it, plus the staff-only answer key. */
export function QuestionCard({ q, index, total, showKey = true }: { q: PreviewQuestion; index?: number; total?: number; showKey?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-line bg-[linear-gradient(180deg,#14161D,#0F1116)] p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-fg-3">
          {index !== undefined && (
            <span className="text-gold">
              Question {index + 1}
              {total ? ` / ${total}` : ''}
            </span>
          )}
          {q.categoryName && <span>· {q.categoryName}</span>}
          <span>· {TYPE_META[q.type].label}</span>
          <span className="ml-auto flex items-center gap-1 text-fg-2">
            <Timer className="h-3.5 w-3.5 text-gold" /> {q.timeLimitSeconds}s
          </span>
        </div>
        <h3 className="font-display text-[24px] font-semibold leading-tight text-fg">{q.title}</h3>
        <p className="mt-2.5 whitespace-pre-wrap text-[14.5px] leading-relaxed text-fg-2">{q.prompt}</p>
        {q.scenario && (
          <div className="mt-4 rounded-[10px] border-l-2 border-gold/60 bg-gold/[0.05] px-4 py-3">
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
              <FileText className="h-3.5 w-3.5" /> Scenario
            </p>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-2">{q.scenario}</p>
          </div>
        )}
        <div className="mt-5">
          {q.type === 'MULTIPLE_CHOICE' ? (
            <div className="grid gap-2">
              {q.options.map((o) => (
                <div key={o.key} className={cn('flex items-center gap-3 rounded-[10px] border px-4 py-3 text-[13.5px]', showKey && q.correctOptionKeys.includes(o.key) ? 'border-ok/40 bg-ok/[0.06] text-fg' : 'border-line-2 bg-ink-2 text-fg-2')}>
                  <span className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-white/10 font-mono text-[11px] font-bold">{o.key}</span>
                  <span className="flex-1">{o.text}</span>
                  {showKey && q.correctOptionKeys.includes(o.key) && <CheckCircle2 className="h-4 w-4 text-ok" />}
                </div>
              ))}
            </div>
          ) : q.type === 'TRUE_FALSE' ? (
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((b) => (
                <div key={String(b)} className={cn('flex h-12 items-center justify-center gap-2 rounded-[10px] border text-[13px] font-bold uppercase tracking-[0.1em]', showKey && q.correctBoolean === b ? 'border-ok/40 bg-ok/[0.06] text-[#7FD3B1]' : 'border-line-2 bg-ink-2 text-fg-3')}>
                  {b ? 'True' : 'False'}
                  {showKey && q.correctBoolean === b && <CheckCircle2 className="h-4 w-4" />}
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[110px] rounded-[10px] border border-line-2 bg-ink-2 px-4 py-3 text-[13px] text-fg-4">Candidate types their response here…</div>
          )}
        </div>
      </div>
      {showKey && q.rubric && (
        <div className="rounded-[12px] border border-violet/25 bg-violet/[0.06] p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#C3B9FA]">Grading rubric · staff only · max {q.maxScore} marks</p>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-2">{q.rubric}</p>
        </div>
      )}
    </div>
  );
}

export function QuestionPreviewDialog({ q, onClose }: { q: PreviewQuestion | null; onClose: () => void }) {
  return (
    <Dialog open={!!q} onOpenChange={(o) => !o && onClose()} size="lg" title="Question preview" description="As presented to candidates, with the staff-only answer key." icon={<Eye />}>
      {q && <QuestionCard q={q} />}
    </Dialog>
  );
}
