import { ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AttemptsView } from '@/components/admin/attempts-view';

export const metadata: Metadata = { title: 'Disqualifications' };

export default function Page() {
  return (
    <Suspense>
      <AttemptsView
        queue="disqualified"
        eyebrow="Evaluation"
        title="Disqualifications"
        icon={<ShieldAlert className="h-8 w-8 text-bad/80" />}
        description="Attempts terminated by the examination security policy or by management. Each record includes the violation type, source, server timestamp and full event timeline for contested reviews."
        emptyTitle="No disqualifications"
        emptyDescription="Security-policy terminations will be listed here with their evidence."
      />
    </Suspense>
  );
}
