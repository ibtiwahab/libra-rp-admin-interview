'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    const onAuthError = (err: unknown) => {
      if (err instanceof ApiError && err.status === 401 && typeof window !== 'undefined' && window.location.pathname.startsWith('/admin') && !window.location.pathname.startsWith('/admin/login')) {
        window.location.assign('/admin/login?expired=1');
      }
    };
    return new QueryClient({
      queryCache: new QueryCache({ onError: onAuthError }),
      mutationCache: new MutationCache({ onError: onAuthError }),
      defaultOptions: {
        queries: {
          staleTime: 15_000,
          refetchOnWindowFocus: false,
          retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
        },
        mutations: { retry: false },
      },
    });
  });

  return (
    <QueryClientProvider client={client}>
      <TooltipPrimitive.Provider delayDuration={250}>
        {children}
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            classNames: {
              toast: '!bg-[#14161D] !border !border-white/10 !text-fg !rounded-[10px] !shadow-[0_20px_40px_-20px_rgba(0,0,0,0.9)] !font-sans',
              description: '!text-fg-3',
              success: '[&_[data-icon]]:!text-ok',
              error: '[&_[data-icon]]:!text-bad',
            },
          }}
        />
      </TooltipPrimitive.Provider>
    </QueryClientProvider>
  );
}
