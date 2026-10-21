'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, KeyRound, Lock, MoreHorizontal, PauseCircle, PlayCircle, ShieldCheck, UserCog, UserMinus, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ConfirmDialog, CredentialsDialog, FilterBar, SearchBox } from '@/components/admin/common';
import { PageHeader, Panel } from '@/components/admin/shell';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, KV, Pagination, Spinner, StatusBadge, TD, TH, THead, TR, Table, TableSkeleton } from '@/components/ui/data';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Switch } from '@/components/ui/primitives';
import { useIsHeadAdmin, useMe } from '@/hooks/use-admin';
import { useDebounced } from '@/hooks/use-debounce';
import { errorMessage } from '@/lib/api';
import type { Credentials, Curator } from '@/lib/types';
import { fmtDate, fmtDateTime, fromNow, humanize, initials } from '@/lib/utils';
import { adminApi, qk } from '@/services/admin';

function Restricted() {
  return (
    <div className="panel rounded-[16px]">
      <EmptyState icon={<Lock />} title="Head Admin access only" description="Support Curator management is restricted to Head Admins. This restriction is enforced by the server for every request." />
    </div>
  );
}

const createSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Required').max(80),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,32}$/, '3–32 characters: letters, digits, dot, dash, underscore'),
    discordUsername: z.string().trim().max(64),
    email: z.string().trim().refine((v) => !v || /^\S+@\S+\.\S+$/.test(v), 'Invalid email'),
    generatePassword: z.boolean(),
    password: z.string(),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.generatePassword) {
      if (v.password.length < 12) ctx.addIssue({ code: 'custom', path: ['password'], message: 'At least 12 characters' });
      const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(v.password)).length;
      if (classes < 3) ctx.addIssue({ code: 'custom', path: ['password'], message: 'Use three of: lowercase, uppercase, digits, symbols' });
    }
  });
type CreateForm = z.infer<typeof createSchema>;

export function CuratorsPage() {
  const isHead = useIsHeadAdmin();
  const { data: me } = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [creds, setCreds] = useState<{ c: Credentials; name: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'remove' | 'reset'; c: Curator } | null>(null);
  const debounced = useDebounced(search);
  useEffect(() => setPage(1), [debounced, includeRemoved]);

  const query = { page, limit: 20, search: debounced || undefined, includeRemoved: includeRemoved ? 'true' : undefined };
  const list = useQuery({ queryKey: qk.curators(query), queryFn: () => adminApi.curators(query), placeholderData: keepPreviousData, enabled: isHead });

  const { register, handleSubmit, control, reset, watch, formState } = useForm<CreateForm>({ resolver: zodResolver(createSchema), defaultValues: { generatePassword: true, active: true, password: '', discordUsername: '', email: '' } });
  useEffect(() => {
    if (createOpen) reset({ fullName: '', username: '', discordUsername: '', email: '', generatePassword: true, password: '', active: true });
  }, [createOpen, reset]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['curators'] });
  const create = useMutation({
    mutationFn: (v: CreateForm) =>
      adminApi.createCurator({
        fullName: v.fullName,
        username: v.username,
        discordUsername: v.discordUsername || undefined,
        email: v.email || null,
        generatePassword: v.generatePassword,
        ...(v.generatePassword ? {} : { password: v.password }),
        status: v.active ? 'ACTIVE' : 'DISABLED',
      }),
    onSuccess: (r, v) => {
      refresh();
      setCreateOpen(false);
      toast.success(`Support Curator @${r.curator.username} created`);
      if (r.credentials) setCreds({ c: r.credentials, name: v.fullName });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const action = useMutation({
    mutationFn: async ({ kind, c }: { kind: 'disable' | 'enable' | 'remove' | 'reset'; c: Curator }) => {
      if (kind === 'remove') return adminApi.removeCurator(c.id);
      if (kind === 'reset') return adminApi.resetCuratorPassword(c.id);
      return adminApi.updateCurator(c.id, { status: kind === 'disable' ? 'DISABLED' : 'ACTIVE' });
    },
    onSuccess: (r, { kind, c }) => {
      refresh();
      setConfirm(null);
      if (kind === 'reset') setCreds({ c: (r as { credentials: Credentials }).credentials, name: c.fullName });
      else toast.success({ disable: 'Access disabled — sessions revoked', enable: 'Access restored', remove: 'Support Curator removed — history preserved' }[kind]);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (me && !isHead) return <Restricted />;
  const data = list.data;
  const gen = watch('generatePassword');

  return (
    <>
      <PageHeader
        eyebrow="Management · Head Admin"
        title="Support Curator Management"
        description="Create and govern Support Curator accounts. Curators manage recruitment but can never manage administrative accounts. Removal revokes access instantly while preserving every evaluation and audit record."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" /> Add Support Curator
          </Button>
        }
      />
      <Panel bodyClassName="p-0">
        <FilterBar>
          <SearchBox value={search} onChange={setSearch} placeholder="Name, username, Discord…" />
          <label className="flex items-center gap-2 text-[12.5px] text-fg-3">
            <Switch checked={includeRemoved} onCheckedChange={setIncludeRemoved} /> Show removed
          </label>
        </FilterBar>
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Username</TH>
              <TH>Status</TH>
              <TH>MFA</TH>
              <TH>Created</TH>
              <TH>Last login</TH>
              <TH align="right">Interviews evaluated</TH>
              <TH align="right" />
            </tr>
          </THead>
          <tbody>
            {list.isLoading ? (
              <TableSkeleton cols={8} rows={4} />
            ) : !data?.items.length ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState icon={<UserCog />} title="No Support Curators" description="Add curators to share interview creation, monitoring and evaluation duties." action={<Button variant="primary" onClick={() => setCreateOpen(true)}><UserPlus className="h-4 w-4" /> Add Support Curator</Button>} />
                </td>
              </tr>
            ) : (
              data.items.map((c) => (
                <TR key={c.id} onClick={() => router.push(`/admin/curators/${c.id}`)}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-white/10 bg-surface-2 font-display text-[13px] font-semibold text-fg-2">{initials(c.fullName)}</div>
                      <div>
                        <p className="font-semibold text-fg">{c.fullName}</p>
                        <p className="text-[11px] text-fg-4">{c.discordUsername ? `@${c.discordUsername}` : c.email ?? '—'}</p>
                      </div>
                    </div>
                  </TD>
                  <TD className="font-mono text-[12px] text-fg-2">@{c.username}</TD>
                  <TD>
                    <StatusBadge status={c.status} />
                  </TD>
                  <TD>{c.mfaEnabled ? <Badge tone="ok">On</Badge> : <Badge tone="muted">Off</Badge>}</TD>
                  <TD className="text-[12px] text-fg-3">{fmtDate(c.createdAt)}</TD>
                  <TD className="text-[12px] text-fg-3">{c.lastLoginAt ? fromNow(c.lastLoginAt) : 'Never'}</TD>
                  <TD align="right" className="font-bold tabular text-fg">{c.interviewsEvaluated}</TD>
                  <TD align="right">
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label="Curator actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownTrigger>
                        <DropdownContent>
                          <DropdownItem icon={<Eye />} onSelect={() => router.push(`/admin/curators/${c.id}`)}>
                            View profile
                          </DropdownItem>
                          {c.status !== 'REMOVED' && (
                            <>
                              {c.status === 'ACTIVE' ? (
                                <DropdownItem icon={<PauseCircle />} onSelect={() => action.mutate({ kind: 'disable', c })}>
                                  Disable access
                                </DropdownItem>
                              ) : (
                                <DropdownItem icon={<PlayCircle />} onSelect={() => action.mutate({ kind: 'enable', c })}>
                                  Reactivate account
                                </DropdownItem>
                              )}
                              <DropdownItem icon={<KeyRound />} onSelect={() => setConfirm({ kind: 'reset', c })}>
                                Reset password
                              </DropdownItem>
                              <DropdownSeparator />
                              <DropdownItem icon={<UserMinus />} danger onSelect={() => setConfirm({ kind: 'remove', c })}>
                                Remove Support Curator
                              </DropdownItem>
                            </>
                          )}
                        </DropdownContent>
                      </DropdownMenu>
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
        {data && data.total > 0 && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} label="curators" />}
      </Panel>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add Support Curator"
        description="Support Curators can manage candidates, questions, interviews and evaluations. They cannot manage administrative accounts."
        icon={<UserPlus />}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" className="uppercase" loading={create.isPending} onClick={handleSubmit((v) => create.mutate(v))}>
              Create Support Curator
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={formState.errors.fullName?.message}>
            <Input {...register('fullName')} placeholder="Alex Smith" aria-invalid={!!formState.errors.fullName} />
          </Field>
          <Field label="Username" required error={formState.errors.username?.message}>
            <Input {...register('username')} placeholder="alex.smith" className="font-mono" aria-invalid={!!formState.errors.username} />
          </Field>
          <Field label="Discord username" hint="Optional">
            <Input {...register('discordUsername')} placeholder="alexsmith" />
          </Field>
          <Field label="Email" hint="Optional" error={formState.errors.email?.message}>
            <Input {...register('email')} type="email" placeholder="alex@example.com" />
          </Field>
          <div className="sm:col-span-2 rounded-[12px] border border-line bg-black/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-fg">Generate a secure password</p>
                <p className="text-[11.5px] text-fg-4">Recommended. Shown once; the curator must change it at first sign-in.</p>
              </div>
              <Controller name="generatePassword" control={control} render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
            </div>
            {!gen && (
              <Field label="Password" className="mt-3" error={formState.errors.password?.message} hint="12+ characters with three of: lowercase, uppercase, digits, symbols.">
                <Input type="password" autoComplete="new-password" {...register('password')} />
              </Field>
            )}
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-[12px] border border-line px-4 py-3">
            <div>
              <p className="text-[13px] font-semibold text-fg">Account status</p>
              <p className="text-[11.5px] text-fg-4">Disabled accounts cannot sign in until reactivated.</p>
            </div>
            <Controller name="active" control={control} render={({ field }) => <span className="flex items-center gap-2 text-[12px] text-fg-3">{field.value ? 'Active' : 'Disabled'}<Switch checked={field.value} onCheckedChange={field.onChange} /></span>} />
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirm?.kind === 'remove'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Remove Support Curator"
        description={`@${confirm?.c.username} loses administrative access immediately and all sessions are revoked. Their evaluations, actions and audit records are preserved.`}
        confirmLabel="Remove"
        loading={action.isPending}
        onConfirm={() => confirm && action.mutate({ kind: 'remove', c: confirm.c })}
      />
      <ConfirmDialog
        open={confirm?.kind === 'reset'}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone="gold"
        title="Reset password"
        description={`A new temporary password is generated for @${confirm?.c.username}. Existing sessions are signed out.`}
        confirmLabel="Generate password"
        loading={action.isPending}
        onConfirm={() => confirm && action.mutate({ kind: 'reset', c: confirm.c })}
      />
      <CredentialsDialog credentials={creds?.c ?? null} subject={creds?.name} title="Support Curator credentials" onClose={() => setCreds(null)} />
    </>
  );
}

export function CuratorProfile({ id }: { id: string }) {
  const isHead = useIsHeadAdmin();
  const { data: me } = useMe();
  const { data: c, isLoading } = useQuery({ queryKey: qk.curator(id), queryFn: () => adminApi.curator(id), enabled: isHead });
  if (me && !isHead) return <Restricted />;
  if (isLoading || !c) return <div className="grid h-[60vh] place-items-center"><Spinner /></div>;
  return (
    <>
      <Link href="/admin/curators" className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-3 transition hover:text-gold">
        <ArrowLeft className="h-4 w-4" /> Support Curators
      </Link>
      <div className="panel mb-4 flex flex-wrap items-center gap-5 rounded-[16px] p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-[14px] border border-gold/30 bg-gold/10 font-display text-[24px] font-semibold text-gold-bright">{initials(c.fullName)}</div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[30px] font-semibold leading-none">{c.fullName}</h1>
            <StatusBadge status={c.status} />
          </div>
          <p className="mt-1.5 text-[12.5px] text-fg-3">
            @{c.username} · {humanize(c.role)} · created {fmtDate(c.createdAt)}
            {c.createdBy ? ` by ${c.createdBy}` : ''}
          </p>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Panel title="Account" icon={<ShieldCheck />} bodyClassName="p-5">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
            <KV label="Username" mono>@{c.username}</KV>
            <KV label="Discord">{c.discordUsername ? `@${c.discordUsername}` : '—'}</KV>
            <KV label="Email">{c.email ?? '—'}</KV>
            <KV label="Two-step verification">{c.mfaEnabled ? 'Enabled' : 'Not enabled'}</KV>
            <KV label="Last login">{fmtDateTime(c.lastLoginAt)}</KV>
            <KV label="Interviews evaluated">{c.interviewsEvaluated}</KV>
            {c.removedAt && <KV label="Removed">{fmtDateTime(c.removedAt)}</KV>}
          </dl>
        </Panel>
        <Panel title="Recent evaluations" icon={<UserCog />} bodyClassName="p-2">
          {c.recentEvaluations?.length ? (
            <ul>
              {c.recentEvaluations.map((e) => (
                <li key={e.id}>
                  <Link href={`/admin/evaluations/${e.id}`} className="flex items-center gap-3 rounded-[9px] px-3 py-2.5 hover:bg-white/[0.03]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-fg">{e.candidate}</p>
                      <p className="truncate text-[11px] text-fg-4">
                        {e.candidateCode} · {e.interview}
                      </p>
                    </div>
                    <StatusBadge status={e.result} />
                    <span className="w-12 text-right text-[12px] font-bold tabular">{e.percentage ?? '—'}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-10 text-center text-[12.5px] text-fg-4">No evaluations yet.</p>
          )}
        </Panel>
      </div>
      <Panel className="mt-4" title="Recent administrative actions" icon={<KeyRound />} bodyClassName="p-0">
        <Table>
          <THead>
            <tr>
              <TH>Action</TH>
              <TH>Target</TH>
              <TH>When</TH>
            </tr>
          </THead>
          <tbody>
            {c.recentActions?.length ? (
              c.recentActions.map((a) => (
                <TR key={a.id}>
                  <TD className="font-semibold text-fg">{humanize(a.action)}</TD>
                  <TD className="text-fg-3">{a.targetLabel || a.targetType}</TD>
                  <TD className="text-[12px] text-fg-4">{fmtDateTime(a.createdAt)}</TD>
                </TR>
              ))
            ) : (
              <tr>
                <TD colSpan={3} className="py-8 text-center text-fg-4">No actions recorded.</TD>
              </tr>
            )}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
