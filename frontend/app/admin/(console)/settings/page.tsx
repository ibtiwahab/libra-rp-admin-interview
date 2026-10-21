import type { Metadata } from 'next';
import { SettingsPage } from '@/components/admin/account-pages';

export const metadata: Metadata = { title: 'Security Settings' };

export default function Page() {
  return <SettingsPage />;
}
