import type { Metadata } from 'next';
import { MonitorPage } from '@/components/admin/monitor-page';

export const metadata: Metadata = { title: 'Live Monitoring' };

export default function Page() {
  return <MonitorPage />;
}
