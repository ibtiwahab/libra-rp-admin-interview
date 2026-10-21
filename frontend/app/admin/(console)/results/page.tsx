import { Trophy } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AttemptsView } from '@/components/admin/attempts-view';

export const metadata: Metadata = { title: 'Results' };

export default function Page() {
  return (
    <Suspense>
      <AttemptsView
        queue="evaluated"
        resultTabs
        eyebrow="Evaluation"
        title="Results"
        icon={<Trophy className="h-8 w-8 text-gold/80" />}
        description="Final decisions for evaluated candidates. Every change to an evaluation is preserved in its revision history."
        emptyTitle="No final results yet"
        emptyDescription="Candidates marked Passed or Failed appear here."
      />
    </Suspense>
  );
}
