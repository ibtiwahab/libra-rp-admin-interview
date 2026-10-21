import type { Metadata } from 'next';
import { InterviewsPage } from '@/components/admin/interviews-page';

export const metadata: Metadata = { title: 'Interviews' };

export default function Page() {
  return <InterviewsPage />;
}
