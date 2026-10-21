'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, KeyRound, ShieldCheck, ShieldOff, Smartphone, UserCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PageHeader, Panel } from '@/components/admin/shell';
import { Button } from '@/components/ui/button';
import { Badge, CopyButton, KV } from '@/components/ui/data';
import { Field, Input } from '@/components/ui/input';
import { useMe } from '@/hooks/use-admin';
import { errorMessage } from '@/lib/api';
import { fmtDateTime, humanize, initials } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  discordUsername: z.string().trim().max(64),
  email: z.string().trim().refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), 'Invalid email'),
});

export function ProfilePage() {
  const { data } = useMe();
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState } = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema) });
  useEffect(() => {
    if (data) reset({ fullName: data.user.fullName, discordUsername: data.user.discordUsername ?? '', email: data.user.email ?? '' });
  }, [data, reset]);
  const save = useMutation({
    mutationFn: (v: z.infer<typeof profileSchema>) => adminApi.updateProfile({ fullName: v.fullName, discordUsername: v.discordUsername, email: v.email || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.me });
      toast.success('Profile updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!data) return null;
  const u = data.user;
  return (
    <>
      <PageHeader eyebrow="Account" title="Profile" description="Your administrative identity across the Libra RP recruitment system." />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Panel bodyClassName="p-6">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-[18px] border border-gold/30 bg-[linear-gradient(160deg,rgba(201,169,97,0.25),rgba(201,169,97,0.04))] font-display text-[30px] font-semibold text-gold-bright">{initials(u.fullName)}</div>
            <div>
              <h2 className="font-display text-[28px] font-semibold leading-none">{u.fullName}</h2>
              <p className="mt-1.5 font-mono text-[12.5px] text-fg-3">@{u.username}</p>
              <div className="mt-2 flex gap-2">
                <Badge tone="gold">{humanize(u.role)}</Badge>
                {u.mfaEnabled ? <Badge tone="ok">MFA on</Badge> : <Badge tone="warn">MFA off</Badge>}
              </div>
            </div>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-line pt-5">
            <KV label="Member since">{fmtDateTime(u.createdAt)}</KV>
            <KV label="Last sign-in">{fmtDateTime(u.lastLoginAt)}</KV>
            <KV label="Session idle expiry">{fmtDateTime(data.session.expiresAt)}</KV>
            <KV label="Session hard expiry">{fmtDateTime(data.session.absoluteExpiresAt)}</KV>
          </dl>
        </Panel>
        <Panel title="Details" icon={<UserCircle2 />} bodyClassName="p-5">
          <form className="grid gap-4" onSubmit={handleSubmit((v) => save.mutate(v))}>
            <Field label="Full name" error={formState.errors.fullName?.message}>
              <Input {...register('fullName')} />
            </Field>
            <Field label="Discord username">
              <Input {...register('discordUsername')} />
            </Field>
            <Field label="Email" error={formState.errors.email?.message}>
              <Input type="email" {...register('email')} />
            </Field>
            <Field label="Username" hint="Usernames are permanent identifiers and cannot be changed.">
              <Input value={u.username} disabled className="font-mono" />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={save.isPending} disabled={!formState.isDirty}>
                Save profile
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </>
  );
}

const pwSchema = z
  .object({ currentPassword: z.string().min(1, 'Required'), newPassword: z.string().min(12, 'At least 12 characters').max(128), confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  .refine((v) => [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(v.newPassword)).length >= 3, { path: ['newPassword'], message: 'Use three of: lowercase, uppercase, digits, symbols' });

export function SettingsPage() {
  const { data } = useMe();
  const qc = useQueryClient();
  const pw = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [disable, setDisable] = useState({ password: '', code: '' });

  const change = useMutation({
    mutationFn: (v: z.infer<typeof pwSchema>) => adminApi.changePassword({ currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: () => {
      pw.reset();
      qc.invalidateQueries({ queryKey: qk.me });
      toast.success('Password changed. Other sessions were signed out.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const begin = useMutation({ mutationFn: adminApi.mfaSetup, onSuccess: (r) => setSetup(r), onError: (e) => toast.error(errorMessage(e)) });
  const enable = useMutation({
    mutationFn: () => adminApi.mfaEnable(code),
    onSuccess: () => {
      setSetup(null);
      setCode('');
      qc.invalidateQueries({ queryKey: qk.me });
      toast.success('Two-step verification enabled');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const off = useMutation({
    mutationFn: () => adminApi.mfaDisable(disable),
    onSuccess: () => {
      setDisable({ password: '', code: '' });
      qc.invalidateQueries({ queryKey: qk.me });
      toast.success('Two-step verification disabled');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!data) return null;
  return (
    <>
      <PageHeader eyebrow="Account" title="Security Settings" description="Protect your administrative account. Two-step verification is strongly recommended for every Head Admin and Support Curator." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Change password" icon={<KeyRound />} bodyClassName="p-5">
          {data.user.mustChangePassword && <p className="mb-4 rounded-[9px] border border-warn/30 bg-warn/[0.07] px-3.5 py-2.5 text-[12.5px] text-[#F0C47A]">You are signed in with a temporary password. Choose your own password to unlock the admin panel.</p>}
          <form className="grid gap-4" onSubmit={pw.handleSubmit((v) => change.mutate(v))}>
            <Field label="Current password" error={pw.formState.errors.currentPassword?.message}>
              <Input type="password" autoComplete="current-password" {...pw.register('currentPassword')} />
            </Field>
            <Field label="New password" error={pw.formState.errors.newPassword?.message} hint="12+ characters with three of: lowercase, uppercase, digits, symbols.">
              <Input type="password" autoComplete="new-password" {...pw.register('newPassword')} />
            </Field>
            <Field label="Confirm new password" error={pw.formState.errors.confirm?.message}>
              <Input type="password" autoComplete="new-password" {...pw.register('confirm')} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={change.isPending}>
                Update password
              </Button>
            </div>
          </form>
        </Panel>

        <Panel title="Two-step verification" icon={<Fingerprint />} actions={data.user.mfaEnabled ? <Badge tone="ok">Enabled</Badge> : <Badge tone="warn">Not enabled</Badge>} bodyClassName="p-5">
          {data.user.mfaEnabled ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-[10px] border border-ok/25 bg-ok/[0.06] p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-ok" />
                <p className="text-[13px] leading-relaxed text-fg-2">Your account requires a 6-digit authenticator code at every sign-in.</p>
              </div>
              <p className="label-caps">Disable two-step verification</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                <Input type="password" placeholder="Current password" value={disable.password} onChange={(e) => setDisable((d) => ({ ...d, password: e.target.value }))} />
                <Input inputMode="numeric" maxLength={6} placeholder="000000" className="text-center font-mono tracking-[0.3em]" value={disable.code} onChange={(e) => setDisable((d) => ({ ...d, code: e.target.value.replace(/\D/g, '') }))} />
                <Button variant="danger" loading={off.isPending} disabled={!disable.password || disable.code.length !== 6} onClick={() => off.mutate()}>
                  <ShieldOff className="h-4 w-4" /> Disable
                </Button>
              </div>
            </div>
          ) : setup ? (
            <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qrDataUrl} alt="Authenticator QR code" className="h-[220px] w-[220px] rounded-[12px] border border-gold/30" />
              <div className="space-y-4">
                <p className="text-[13px] leading-relaxed text-fg-2">Scan with Google Authenticator, 1Password, Authy or any TOTP app. Then enter the 6-digit code to confirm.</p>
                <div className="flex items-center gap-2 rounded-[9px] border border-line bg-ink-2 px-3 py-2">
                  <code className="flex-1 truncate font-mono text-[12px] text-gold-bright">{setup.secret}</code>
                  <CopyButton value={setup.secret} />
                </div>
                <div className="flex gap-2">
                  <Input inputMode="numeric" maxLength={6} placeholder="000000" className="h-11 text-center font-mono text-[18px] tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                  <Button variant="primary" size="lg" loading={enable.isPending} disabled={code.length !== 6} onClick={() => enable.mutate()}>
                    Verify
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4">
              <div className="flex items-start gap-3">
                <Smartphone className="mt-0.5 h-5 w-5 text-gold" />
                <p className="text-[13px] leading-relaxed text-fg-2">Add a time-based one-time code from your phone to every sign-in. Even if your password leaks, your account stays protected.</p>
              </div>
              <Button variant="primary" loading={begin.isPending} onClick={() => begin.mutate()}>
                <Fingerprint className="h-4 w-4" /> Set up two-step verification
              </Button>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
