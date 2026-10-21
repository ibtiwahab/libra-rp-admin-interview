'use client';

import { CheckCircle2, Clock4, Inbox, LogOut, MessageSquareWarning, ShieldX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { LibraMark } from '@/components/brand/libra-mark';
import { Button } from '@/components/ui/button';
import { cn, fmtDateTime } from '@/lib/utils';
import { examApi, type TerminalState } from '@/services/exam';

function Shell({ tone, icon, eyebrow, title, children, footer }: { tone: 'ok' | 'bad' | 'warn' | 'neutral'; icon: React.ReactNode; eyebrow: string; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const ring = { ok: 'border-ok/40 bg-ok/10 text-ok', bad: 'border-bad/40 bg-bad/10 text-bad', warn: 'border-warn/40 bg-warn/10 text-warn', neutral: 'border-gold/35 bg-gold/10 text-gold-bright' }[tone];
  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-5 py-12">
      <div className="w-full max-w-[560px]">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <LibraMark className="h-7 w-7" />
          <span className="text-[15px] font-semibold text-gold">Libra RP</span>
        </div>
        <div className="panel rounded-[12px] px-6 py-9 text-center sm:px-10">
          <div className={cn('mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[12px] border [&_svg]:h-6 [&_svg]:w-6', ring)}>{icon}</div>
          <p className="label-caps">{eyebrow}</p>
          <h1 className="mt-2 text-[26px] font-semibold leading-tight">{title}</h1>
          <div className="mx-auto mt-4 max-w-[440px] space-y-2 text-[14.5px] leading-relaxed text-fg-2">{children}</div>
          {footer && <div className="mt-7">{footer}</div>}
        </div>
      </div>
    </main>
  );
}

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="mx-auto mt-6 grid max-w-[440px] grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-line text-left">
      {items.map(([k, v]) => (
        <div key={k} className="bg-ink-2 px-4 py-3">
          <dt className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-fg-4">{k}</dt>
          <dd className="mt-1 truncate font-mono text-[13px] font-semibold text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function SignOut({ label = 'Sign out' }: { label?: string }) {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      size="lg"
      onClick={async () => {
        await examApi.logout().catch(() => undefined);
        router.replace('/login');
      }}
    >
      <LogOut className="h-4 w-4" /> {label}
    </Button>
  );
}

const SUPPORT = 'Please contact Libra RP Management through the official Discord ticket system if you believe this decision requires review. Quote your interview identifier.';

export function CompletedScreen({ result }: { result: TerminalState }) {
  return (
    <Shell tone="ok" icon={<CheckCircle2 />} eyebrow="Interview complete" title="Interview successfully submitted" footer={<SignOut />}>
      <p>Your responses have been securely recorded.</p>
      <p className="text-fg-3">Libra RP Management will review your interview. You will be contacted with the outcome.</p>
      <Facts
        items={[
          ['Interview', result.title],
          ['Interview identifier', result.referenceCode],
          ['Questions answered', `${result.answeredCount} of ${result.totalQuestions}`],
          ['Submitted', fmtDateTime(result.endedAt)],
        ]}
      />
    </Shell>
  );
}

/** Shown immediately after a violation in the live session. */
export function TerminatedScreen({ result }: { result: TerminalState | null }) {
  return (
    <Shell tone="bad" icon={<ShieldX />} eyebrow="Examination security protocol" title="Interview terminated" footer={<SignOut label="Exit" />}>
      <p>Your interview has been terminated due to a violation of the examination security policy.</p>
      <p className="text-fg-3">The attempt is permanently closed and cannot be restarted.</p>
      <Facts
        items={[
          ['Interview identifier', result?.referenceCode ?? '—'],
          ['Termination status', 'Disqualified'],
          ['Reason', 'Security policy violation'],
          ['Recorded', fmtDateTime(result?.endedAt ?? new Date().toISOString())],
        ]}
      />
      <p className="mt-6 flex items-start gap-2 text-left text-[12.5px] text-fg-3">
        <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-gold" /> {SUPPORT}
      </p>
    </Shell>
  );
}

/** Shown when a disqualified candidate signs in again. */
export function AccessRevokedScreen({ result }: { result: TerminalState }) {
  return (
    <Shell tone="bad" icon={<ShieldX />} eyebrow="Access status" title="Interview access revoked" footer={<SignOut />}>
      <p>Your interview session was terminated due to a violation of the examination security policy.</p>
      <p>Your attempt has been permanently closed.</p>
      <p className="text-fg-3">Please contact Libra RP Management if you believe this decision requires review.</p>
      <Facts
        items={[
          ['Interview', result.title],
          ['Interview identifier', result.referenceCode],
        ]}
      />
    </Shell>
  );
}

export function ExpiredScreen({ result }: { result: TerminalState | null }) {
  return (
    <Shell tone="warn" icon={<Clock4 />} eyebrow="Session status" title="Interview session expired" footer={<SignOut />}>
      <p>Your attempt ended because the examination session expired — the connection to the interview was lost or the time limit was exceeded.</p>
      <p className="text-fg-3">Your saved answers were preserved. The attempt cannot be restarted. {SUPPORT}</p>
      {result && (
        <Facts
          items={[
            ['Interview identifier', result.referenceCode],
            ['Ended', fmtDateTime(result.endedAt)],
          ]}
        />
      )}
    </Shell>
  );
}

export function SessionEndedScreen() {
  return (
    <Shell tone="bad" icon={<ShieldX />} eyebrow="Session status" title="Session ended" footer={<SignOut label="Return to sign-in" />}>
      <p>Your examination session is no longer valid and the interview has been closed by the server.</p>
      <p className="text-fg-3">{SUPPORT}</p>
    </Shell>
  );
}

export function NoInterviewScreen({ cancelled, name }: { cancelled?: boolean; name: string }) {
  return (
    <Shell tone="neutral" icon={<Inbox />} eyebrow={`Welcome, ${name}`} title={cancelled ? 'Interview withdrawn' : 'No interview assigned'} footer={<SignOut />}>
      <p>{cancelled ? 'The interview previously assigned to you has been withdrawn by Libra RP Management.' : 'There is currently no interview assigned to your account.'}</p>
      <p className="text-fg-3">Libra RP Management will notify you when an interview is ready for you.</p>
    </Shell>
  );
}
