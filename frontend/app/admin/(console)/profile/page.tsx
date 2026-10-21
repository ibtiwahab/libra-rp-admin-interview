import type { Metadata } from 'next';
import { ProfilePage } from '@/components/admin/account-pages';

export const metadata: Metadata = { title: 'Profile' };

export default function Page() {
  return <ProfilePage />;
}
