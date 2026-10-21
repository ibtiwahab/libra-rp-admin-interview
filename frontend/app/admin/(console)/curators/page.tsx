import type { Metadata } from 'next';
import { CuratorsPage } from '@/components/admin/curators-page';

export const metadata: Metadata = { title: 'Support Curators' };

export default function Page() {
  return <CuratorsPage />;
}
