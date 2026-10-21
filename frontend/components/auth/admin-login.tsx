'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, EyeOff, Fingerprint, Lock, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { LibraMark } from '@/components/brand/libra-mark';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';

const schema = z.object({ username: z.string().trim().min(1, 'Enter your username'), password: z.string().min(1, 'Enter your password') });
type Form = z.infer<typeof schema>;

export function AdminLogin() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [error, setError] = useState<string | null>(params.get('expired') ? 'Your session expired. Please sign in again.' : null);
  const [show, setShow] = useState(false);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  const finish = async () => {
    qc.clear();
    router.replace('/admin');
  };

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const r = await api<{ status: 'OK' | 'MFA_REQUIRED' }>('/auth/login', { method: 'POST', body: { portal: 'admin', ...values } });
      if (r.status === 'MFA_REQUIRED') setStep('mfa');
      else await finish();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reach the server.');
    }
  });

  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <LibraMark className="h-11 w-11" />
          <h1 className="mt-4 text-[22px] font-semibold text-fg">Libra RP Admin Panel</h1>
          <p className="mt-1 text-[13.5px] text-fg-3">For Head Admins and Support Curators.</p>
        </div>

        <div className="panel rounded-[12px] p-6">
          {step === 'credentials' ? (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <Field label="Username" htmlFor="a-username" error={formState.errors.username?.message}>
                <Input id="a-username" autoComplete="username" spellCheck={false} icon={<User />} placeholder="your.username" {...register('username')} aria-invalid={!!formState.errors.username} />
              </Field>
              <Field label="Password" htmlFor="a-password" error={formState.errors.password?.message}>
                <Input
                  id="a-password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  icon={<Lock />}
                  aria-invalid={!!formState.errors.password}
                  trailing={
                    <button type="button" onClick={() => setShow((s) => !s)} className="rounded-md p-1.5 text-fg-3 hover:text-fg" aria-label={show ? 'Hide password' : 'Show password'}>
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                  {...register('password')}
                />
              </Field>
              {error && <p role="alert" className="rounded-[8px] border border-bad/30 bg-bad/[0.08] px-3 py-2.5 text-[13px] text-[#F29790]">{error}</p>}
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={formState.isSubmitting}>
                Sign in
              </Button>
            </form>
          ) : (
            <MfaStep onBack={() => setStep('credentials')} onDone={finish} />
          )}
        </div>

        <p className="mt-6 text-center text-[12px]">
          <Link href="/login" className="text-fg-3 underline-offset-4 hover:text-gold hover:underline">
            Candidate sign-in
          </Link>
        </p>
      </div>
    </main>
  );
}

function MfaStep({ onBack, onDone }: { onBack: () => void; onDone: () => Promise<void> }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => refs.current[0]?.focus(), []);

  const submit = async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/mfa/verify', { method: 'POST', body: { code } });
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
      setDigits(Array(6).fill(''));
      refs.current[0]?.focus();
      if (err instanceof ApiError && err.code === 'MFA_SESSION_INVALID') setTimeout(onBack, 1200);
    } finally {
      setBusy(false);
    }
  };

  const setAt = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '');
    if (clean.length > 1) {
      const next = clean.slice(0, 6).split('');
      const filled = [...next, ...Array(6 - next.length).fill('')];
      setDigits(filled);
      if (next.length === 6) void submit(next.join(''));
      else refs.current[next.length]?.focus();
      return;
    }
    const d = [...digits];
    d[i] = clean;
    setDigits(d);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (d.every((x) => x)) void submit(d.join(''));
  };

  return (
    <div>
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-gold/30 bg-gold/10 text-gold-bright">
          <Fingerprint className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-[20px] font-bold">Two-step verification</h2>
          <p className="text-[12.5px] text-fg-3">Enter the 6-digit code from your authenticator app.</p>
        </div>
      </div>
      <div className="flex justify-between gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={6}
            aria-label={`Digit ${i + 1}`}
            disabled={busy}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            className={cn(
              'h-14 w-full rounded-[10px] border bg-ink-2 text-center font-mono text-[22px] font-semibold text-fg outline-none transition focus:border-gold/60 focus:shadow-[0_0_0_3px_rgba(201,169,97,0.15)]',
              error ? 'border-bad/50' : 'border-line-2',
            )}
          />
        ))}
      </div>
      {error && <p className="mt-3 text-[12.5px] text-[#F29790]">{error}</p>}
      <div className="mt-6 flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button type="button" variant="primary" size="md" loading={busy} disabled={digits.some((d) => !d)} onClick={() => submit(digits.join(''))}>
          Verify
        </Button>
      </div>
    </div>
  );
}
