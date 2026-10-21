import { History } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AttemptsView } from '@/components/admin/attempts-view';

export const metadata: Metadata = { title: 'Interview History' };

export default function Page() {
  return (
    <Suspense>
      <AttemptsView
        queue="all"
        eyebrow="Recruitment"
        title="Interview History"
        icon={<History className="h-8 w-8 text-gold/80" />}
        description="The permanent record of every interview attempt with the exact questions, answers, scores and security events captured at the time. Records are retained indefinitely."
        emptyTitle="No interview records"
        emptyDescription="Attempts appear here as soon as a candidate begins an interview."
      />
    </Suspense>
  );
}
