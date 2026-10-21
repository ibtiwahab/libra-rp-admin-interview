import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminLogin } from '@/components/auth/admin-login';

export const metadata: Metadata = { title: 'Control Center Sign-in' };

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLogin />
    </Suspense>
  );
}
