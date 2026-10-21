'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { CredentialsDialog } from '@/components/admin/common';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { usePublishedInterviews } from '@/hooks/use-admin';
import { errorMessage } from '@/lib/api';
import type { Credentials } from '@/lib/types';
import { fmtDuration } from '@/lib/utils';
import { adminApi } from '@/services/admin';

export const ROLES = ['Admin Assistant', 'Admin'] as const;

const schema = z.object({
  fullName: z.string().trim().min(2, 'Required').max(80),
  discordUsername: z.string().trim().min(2, 'Required').max(64),
  discordId: z
    .string()
    .trim()
    .refine((v) => !v || /^\d{15,22}$/.test(v), 'Discord IDs are 15–22 digits')
    .optional(),
  characterName: z.string().trim().min(2, 'Required').max(80),
  appliedRole: z.enum(ROLES),
  templateId: z.string().optional(),
  startDeadline: z.string().optional(),
});
type Form = z.infer<typeof schema>;

export function toIsoOrNull(local?: string) {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function NewCandidateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const interviews = usePublishedInterviews();
  const [creds, setCreds] = useState<{ c: Credentials; name: string } | null>(null);
  const { register, handleSubmit, control, reset, formState } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { appliedRole: 'Admin Assistant', templateId: '' } });

  useEffect(() => {
    if (open) reset({ appliedRole: 'Admin Assistant', templateId: interviews.data?.[0]?.id ?? '', fullName: '', discordUsername: '', discordId: '', characterName: '', startDeadline: '' });
  }, [open, reset, interviews.data]);

  const create = useMutation({
    mutationFn: (v: Form) =>
      adminApi.createCandidate({
        fullName: v.fullName,
        discordUsername: v.discordUsername,
        discordId: v.discordId || null,
        characterName: v.characterName,
        appliedRole: v.appliedRole,
        ...(v.templateId ? { templateId: v.templateId, startDeadline: toIsoOrNull(v.startDeadline) } : {}),
      }),
    onSuccess: (r, v) => {
      qc.invalidateQueries({ queryKey: ['candidates'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      onOpenChange(false);
      setCreds({ c: r.credentials, name: v.fullName });
      toast.success(`Candidate ${r.credentials.username} created`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="New candidate"
        description="For a player or faction leader applying for a staff role. A username and password are generated and shown once."
        icon={<UserPlus />}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={create.isPending} onClick={handleSubmit((v) => create.mutate(v))}>
              Create & generate credentials
            </Button>
          </>
        }
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          <Field label="Name (OOC)" htmlFor="c-name" required error={formState.errors.fullName?.message}>
            <Input id="c-name" placeholder="John Doe" {...register('fullName')} aria-invalid={!!formState.errors.fullName} />
          </Field>
          <Field label="Main IC character" htmlFor="c-char" hint="Reference only — the staff role is OOC." required error={formState.errors.characterName?.message}>
            <Input id="c-char" placeholder="John Smith" {...register('characterName')} aria-invalid={!!formState.errors.characterName} />
          </Field>
          <Field label="Discord username" htmlFor="c-discord" required error={formState.errors.discordUsername?.message}>
            <Input id="c-discord" placeholder="johndoe" {...register('discordUsername')} aria-invalid={!!formState.errors.discordUsername} />
          </Field>
          <Field label="Discord user ID" htmlFor="c-did" hint="Optional" error={formState.errors.discordId?.message}>
            <Input id="c-did" inputMode="numeric" placeholder="123456789012345678" className="font-mono" {...register('discordId')} aria-invalid={!!formState.errors.discordId} />
          </Field>
          <Field label="Applying for" htmlFor="c-role" className="sm:col-span-2">
            <Controller name="appliedRole" control={control} render={({ field }) => <Select id="c-role" value={field.value} onValueChange={field.onChange} options={ROLES.map((r) => ({ value: r, label: r }))} />} />
          </Field>

          <div className="sm:col-span-2 mt-1 rounded-[12px] border border-line bg-black/20 p-4">
            <p className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-fg-2">
              <ClipboardList className="h-4 w-4 text-gold" /> Interview assignment
            </p>
            <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
              <Field label="Interview" htmlFor="c-tpl" hint={interviews.data && !interviews.data.length ? 'No published interviews yet — you can assign one later.' : undefined}>
                <Controller
                  name="templateId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      id="c-tpl"
                      value={field.value || 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                      options={[{ value: 'none', label: 'Assign later' }, ...(interviews.data ?? []).map((i) => ({ value: i.id, label: i.title, hint: `${i.totalQuestions}q · ${fmtDuration(i.totalTimeSeconds)}` }))]}
                    />
                  )}
                />
              </Field>
              <Field label="Start deadline" htmlFor="c-deadline" hint="Optional">
                <Input id="c-deadline" type="datetime-local" {...register('startDeadline')} />
              </Field>
            </div>
          </div>
        </form>
      </Dialog>
      <CredentialsDialog credentials={creds?.c ?? null} subject={creds?.name} onClose={() => setCreds(null)} />
    </>
  );
}

export function AssignDialog({ candidateId, candidateName, open, onOpenChange }: { candidateId: string; candidateName: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const interviews = usePublishedInterviews();
  const [templateId, setTemplateId] = useState('');
  const [deadline, setDeadline] = useState('');
  useEffect(() => {
    if (open) {
      setTemplateId(interviews.data?.[0]?.id ?? '');
      setDeadline('');
    }
  }, [open, interviews.data]);

  const m = useMutation({
    mutationFn: () => adminApi.assign(candidateId, { templateId, startDeadline: toIsoOrNull(deadline) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates'] });
      qc.invalidateQueries({ queryKey: ['candidate', candidateId] });
      toast.success('Interview assigned');
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign interview"
      description={`Assign a published interview to ${candidateName}. The current published version is locked in at assignment time.`}
      icon={<ClipboardList />}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!templateId} loading={m.isPending} onClick={() => m.mutate()}>
            Assign
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Interview" htmlFor="as-tpl">
          <Select id="as-tpl" value={templateId} onValueChange={setTemplateId} placeholder="Select a published interview" options={(interviews.data ?? []).map((i) => ({ value: i.id, label: i.title, hint: `v${i.publishedVersion}` }))} />
        </Field>
        <Field label="Start deadline" htmlFor="as-dl" hint="Optional — the candidate must begin before this moment.">
          <Input id="as-dl" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
