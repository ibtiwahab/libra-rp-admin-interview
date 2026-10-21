import type { Metadata } from 'next';
import { CandidateLogin } from '@/components/auth/candidate-login';

export const metadata: Metadata = { title: 'Candidate Access' };

export default function LoginPage() {
  return <CandidateLogin />;
}
