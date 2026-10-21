'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LibraMark } from '@/components/brand/libra-mark';
import { Spinner } from '@/components/ui/data';
import { ApiError } from '@/lib/api';
import { examApi, isTerminal, prepareExamClient, type CandidateInfo, type ExamState, type QuestionState, type TerminalState } from '@/services/exam';
import { AccessRevokedScreen, CompletedScreen, ExpiredScreen, NoInterviewScreen, SessionEndedScreen, TerminatedScreen } from './outcome-screens';
import { Preparation } from './preparation';
import { ExamRunner, type RunnerExit } from './runner';

type Phase =
  | { kind: 'loading' }
  | { kind: 'none'; cancelled: boolean; candidate: CandidateInfo }
  | { kind: 'prep'; candidate: CandidateInfo }
  | { kind: 'live'; state: QuestionState }
  | { kind: 'completed'; result: TerminalState }
  | { kind: 'terminated'; result: TerminalState | null }
  | { kind: 'revoked'; result: TerminalState }
  | { kind: 'expired'; result: TerminalState | null }
  | { kind: 'session-ended' };

/**
 * Candidate examination state machine. The server is the source of truth for every transition;
 * this component only renders the state it is given.
 */
export function ExamPortal() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [fsSupported] = useState(() => typeof document !== 'undefined' && !!document.documentElement.requestFullscreen);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await prepareExamClient().catch(() => undefined);
      try {
        const s = await examApi.status();
        if (cancelled) return;
        switch (s.state) {
          case 'NO_ASSIGNMENT':
            return setPhase({ kind: 'none', cancelled: false, candidate: s.candidate });
          case 'CANCELLED':
            return setPhase({ kind: 'none', cancelled: true, candidate: s.candidate });
          case 'NOT_STARTED':
            return setPhase({ kind: 'prep', candidate: s.candidate });
          case 'COMPLETED':
            return setPhase({ kind: 'completed', result: s.result });
          case 'DISQUALIFIED':
            return setPhase({ kind: 'revoked', result: s.result });
          case 'EXPIRED':
            return setPhase({ kind: 'expired', result: s.result });
          case 'IN_PROGRESS': {
            // A fresh page load while an attempt is live means the exam page was reloaded or
            // reopened. The server decides the consequence; we simply report what it returns.
            try {
              const cur = await examApi.current();
              if (cancelled) return;
              onStateFromServer(cur);
            } catch (err) {
              if (err instanceof ApiError && (err.status === 401 || err.status === 403)) setPhase({ kind: 'session-ended' });
              else setPhase({ kind: 'session-ended' });
            }
            return;
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) router.replace('/login');
        else setPhase({ kind: 'session-ended' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onStateFromServer(s: ExamState) {
    if (!isTerminal(s)) return setPhase({ kind: 'live', state: s });
    if (s.state === 'COMPLETED') return setPhase({ kind: 'completed', result: s });
    if (s.state === 'DISQUALIFIED') return setPhase({ kind: 'terminated', result: s });
    return setPhase({ kind: 'expired', result: s });
  }

  const onExit = (e: RunnerExit) => {
    if (e.kind === 'session-ended') return setPhase({ kind: 'session-ended' });
    if (e.kind === 'violation') return setPhase({ kind: 'terminated', result: e.state });
    onStateFromServer(e.state);
  };

  switch (phase.kind) {
    case 'loading':
      return (
        <main className="grid min-h-dvh place-items-center bg-ink">
          <div className="flex flex-col items-center gap-5">
            <LibraMark className="h-12 w-12" glow />
            <Spinner />
            <p className="label-caps">Establishing secure session</p>
          </div>
        </main>
      );
    case 'none':
      return <NoInterviewScreen cancelled={phase.cancelled} name={phase.candidate.fullName} />;
    case 'prep':
      return <Preparation candidate={phase.candidate} onStarted={onStateFromServer} />;
    case 'live':
      return <ExamRunner initial={phase.state} fullscreenSupported={fsSupported} onExit={onExit} />;
    case 'completed':
      return <CompletedScreen result={phase.result} />;
    case 'terminated':
      return <TerminatedScreen result={phase.result} />;
    case 'revoked':
      return <AccessRevokedScreen result={phase.result} />;
    case 'expired':
      return <ExpiredScreen result={phase.result} />;
    case 'session-ended':
      return <SessionEndedScreen />;
  }
}
