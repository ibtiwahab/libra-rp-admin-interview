import type { Metadata } from 'next';
import { InterviewBuilder } from '@/components/admin/interview-builder';

export const metadata: Metadata = { title: 'Interview builder' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InterviewBuilder id={id} />;
}
