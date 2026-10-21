'use client';

import { AlertTriangle, KeyRound, Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/data';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import type { Credentials } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'danger',
  onConfirm,
  loading,
  requireReason,
  reasonLabel = 'Reason',
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'gold';
  onConfirm: (reason?: string) => unknown;
  loading?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  children?: React.ReactNode;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason('');
        onOpenChange(o);
      }}
      title={title}
      description={description}
      tone={tone === 'danger' ? 'danger' : 'gold'}
      icon={<AlertTriangle />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} disabled={requireReason && reason.trim().length < 3} onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {requireReason && (
        <Field label={reasonLabel} htmlFor="confirm-reason" required>
          <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded in the audit log" className="min-h-[80px]" />
        </Field>
      )}
    </Dialog>
  );
}

/** Shows freshly generated credentials exactly once. They are never retrievable again. */
export function CredentialsDialog({ credentials, onClose, title = 'Credentials issued', subject }: { credentials: Credentials | null; onClose: () => void; title?: string; subject?: string }) {
  const [ack, setAck] = useState(false);
  const both = credentials ? `Username: ${credentials.username}\nPassword: ${credentials.password}` : '';
  return (
    <Dialog
      open={!!credentials}
      onOpenChange={(o) => {
        if (!o && ack) {
          setAck(false);
          onClose();
        }
      }}
      dismissible={ack}
      title={title}
      description={subject ? `Share these securely with ${subject}. This is the only time the password will be displayed.` : 'This is the only time the password will be displayed.'}
      icon={<KeyRound />}
      tone="gold"
      footer={
        <>
          <label className="mr-auto flex cursor-pointer items-center gap-2 text-[12.5px] text-fg-2">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="h-4 w-4 accent-[#C9A961]" />I have securely recorded these credentials
          </label>
          <Button
            variant="primary"
            disabled={!ack}
            onClick={() => {
              setAck(false);
              onClose();
            }}
          >
            Done
          </Button>
        </>
      }
    >
      {credentials && (
        <div className="space-y-3">
          <CredRow label="Username" value={credentials.username} />
          <CredRow label="Password" value={credentials.password} />
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-warn/25 bg-warn/[0.06] px-3.5 py-3">
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-[#F0C47A]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Only an Argon2id hash is stored. If lost, generate replacement credentials.
            </p>
            <CopyButton value={both} label="Copy both" />
          </div>
        </div>
      )}
    </Dialog>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-line-2 bg-ink-2 px-4 py-3">
      <div className="min-w-0">
        <p className="label-caps !text-[9.5px]">{label}</p>
        <p className="mt-1 select-all truncate font-mono text-[17px] font-semibold tracking-[0.06em] text-gold-bright">{value}</p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('w-full sm:w-[280px]', className)}>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} icon={<Search />} className="h-9 text-[13px]" aria-label={placeholder} />
    </div>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2.5 border-b border-line px-5 py-3.5 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}
