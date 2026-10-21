import type { Metadata } from 'next';
import { QuestionBankPage } from '@/components/admin/question-bank';

export const metadata: Metadata = { title: 'Question Bank' };

export default function Page() {
  return <QuestionBankPage />;
}
