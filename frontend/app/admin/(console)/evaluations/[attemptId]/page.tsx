import type { Metadata } from 'next';
import { EvaluationReview } from '@/components/admin/evaluation-review';

export const metadata: Metadata = { title: 'Interview review' };

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <EvaluationReview attemptId={attemptId} />;
}
