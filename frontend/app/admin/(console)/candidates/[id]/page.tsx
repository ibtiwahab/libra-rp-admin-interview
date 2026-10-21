import type { Metadata } from 'next';
import { CandidateProfilePage } from '@/components/admin/candidate-profile';

export const metadata: Metadata = { title: 'Candidate profile' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CandidateProfilePage id={id} />;
}
