'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, FolderTree, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/data';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/primitives';
import { useCategories } from '@/hooks/use-admin';
import { errorMessage } from '@/lib/api';
import { adminApi, qk } from '@/services/admin';

export function CategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: cats } = useCategories();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.categories });
    qc.invalidateQueries({ queryKey: ['questions'] });
  };
  const create = useMutation({
    mutationFn: () => adminApi.createCategory({ name: name.trim() }),
    onSuccess: () => {
      setName('');
      refresh();
      toast.success('Category created');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => adminApi.updateCategory(id, body),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.deleteCategory(id),
    onSuccess: (r) => {
      refresh();
      toast.success(r.deactivated ? 'Category is in use — it was deactivated instead' : 'Category deleted');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Question categories" description="Categories organise the bank and power category analytics. Categories in use are deactivated rather than deleted." icon={<FolderTree />} size="md">
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2) create.mutate();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" maxLength={60} />
        <Button type="submit" variant="primary" loading={create.isPending} disabled={name.trim().length < 2}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>
      <ul className="max-h-[420px] divide-y divide-line overflow-y-auto rounded-[12px] border border-line">
        {(cats ?? []).map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
            {editing?.id === c.id ? (
              <>
                <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8" />
                <Button size="icon-sm" variant="ghost" aria-label="Save" onClick={() => update.mutate({ id: c.id, body: { name: editing.name.trim() } })}>
                  <Check className="h-4 w-4 text-ok" />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className={c.isActive ? 'text-[13px] font-semibold text-fg' : 'text-[13px] font-semibold text-fg-4 line-through'}>{c.name}</p>
                </div>
                <Badge tone="muted">{c.questionCount} q</Badge>
                <Switch checked={c.isActive} onCheckedChange={(v) => update.mutate({ id: c.id, body: { isActive: v } })} />
                <Button size="icon-sm" variant="ghost" aria-label="Rename" onClick={() => setEditing({ id: c.id, name: c.name })}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon-sm" variant="danger-ghost" aria-label="Delete" onClick={() => remove.mutate(c.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
