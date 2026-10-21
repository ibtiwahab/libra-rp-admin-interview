'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { LibraMark } from '@/components/brand/libra-mark';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';

const schema = z.object({
  username: z.string().trim().min(1, 'Enter your candidate username'),
  password: z.string().min(1, 'Enter your password'),
});
type Form = z.infer<typeof schema>;

export function CandidateLogin() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: { portal: 'candidate', ...values } });
      router.replace('/exam');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'EXAM_SESSION_ACTIVE') setError('Your interview is already in progress in another browser or device. Only one session is allowed.');
        else if (err.code === 'ACCOUNT_LOCKED' || err.code === 'ACCOUNT_DISABLED' || err.code === 'RATE_LIMITED') setError(err.message);
        else setError('The username or password is incorrect.');
      } else setError('Unable to reach the server. Check your connection and try again.');
    }
  });

  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <LibraMark className="h-11 w-11" />
          <h1 className="mt-4 text-[22px] font-semibold text-fg">Libra RP Staff Interview</h1>
          <p className="mt-1 text-[13.5px] text-fg-3">Sign in with the credentials you received from management.</p>
        </div>

        <div className="panel rounded-[12px] p-6">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field label="Username" htmlFor="username" error={formState.errors.username?.message}>
              <Input id="username" autoComplete="username" autoCapitalize="characters" spellCheck={false} placeholder="LIBRA-ADMIN-0001" icon={<User />} className="font-mono uppercase placeholder:normal-case" aria-invalid={!!formState.errors.username} {...register('username')} />
            </Field>
            <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
              <Input
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                icon={<Lock />}
                className="font-mono"
                aria-invalid={!!formState.errors.password}
                trailing={
                  <button type="button" onClick={() => setShow((s) => !s)} className="rounded-md p-1.5 text-fg-3 hover:text-fg" aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                {...register('password')}
              />
            </Field>
            {error && (
              <p role="alert" className="rounded-[8px] border border-bad/30 bg-bad/[0.08] px-3 py-2.5 text-[13px] text-[#F29790]">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={formState.isSubmitting}>
              Sign in
            </Button>
          </form>
        </div>

        <div className="mt-5 space-y-2 text-[12.5px] leading-relaxed text-fg-3">
          <p>
            This interview is for players and faction leaders applying for a staff role. Staff work is <span className="font-semibold text-fg-2">out of character (OOC)</span> — answer as yourself, not as your character.
          </p>
          <p>Signing in does not start the interview. You will read the rules first.</p>
        </div>
        <p className="mt-6 text-center text-[12px] text-fg-4">
          Staff?{' '}
          <Link href="/admin/login" className="text-fg-3 underline-offset-4 hover:text-gold hover:underline">
            Admin sign-in
          </Link>
        </p>
      </div>
    </main>
  );
}
