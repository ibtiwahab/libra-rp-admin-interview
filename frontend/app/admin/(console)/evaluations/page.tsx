import { ClipboardCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AttemptsView } from '@/components/admin/attempts-view';

export const metadata: Metadata = { title: 'Pending Reviews' };

export default function Page() {
  return (
    <Suspense>
      <AttemptsView
        queue="pending"
        eyebrow="Evaluation"
        title="Pending Reviews"
        icon={<ClipboardCheck className="h-8 w-8 text-gold/80" />}
        description="Concluded interviews awaiting a decision or marked Under Review. Open an attempt to score subjective answers and record the outcome."
        emptyTitle="Review queue is clear"
        emptyDescription="Completed interviews awaiting evaluation will be listed here."
      />
    </Suspense>
  );
}
