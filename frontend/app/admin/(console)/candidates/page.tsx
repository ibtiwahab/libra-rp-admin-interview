import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CandidatesPage } from '@/components/admin/candidates-page';

export const metadata: Metadata = { title: 'Candidates' };

export default function Page() {
  return (
    <Suspense>
      <CandidatesPage />
    </Suspense>
  );
}
