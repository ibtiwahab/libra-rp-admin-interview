import type { Metadata } from 'next';
import { ExamPortal } from '@/components/exam/exam-portal';

export const metadata: Metadata = { title: 'Secure Interview' };
export const dynamic = 'force-dynamic';

export default function ExamPage() {
  return <ExamPortal />;
}
