import type { Metadata } from 'next';
import { CuratorProfile } from '@/components/admin/curators-page';

export const metadata: Metadata = { title: 'Support Curator' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CuratorProfile id={id} />;
}
