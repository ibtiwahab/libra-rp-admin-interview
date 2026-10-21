'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { adminApi, qk } from '@/services/admin';

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: adminApi.me,
    staleTime: 60_000,
    // Never retry an authentication failure; do retry transient network/server errors.
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 4,
    retryDelay: (n) => Math.min(800 * 2 ** n, 5000),
  });
}

export function useIsHeadAdmin() {
  const { data } = useMe();
  return data?.user.role === 'HEAD_ADMIN';
}

export function useOverview(refetchInterval: number | false = 20_000) {
  return useQuery({ queryKey: qk.overview, queryFn: adminApi.overview, refetchInterval });
}

export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: adminApi.categories, select: (d) => d.items, staleTime: 60_000 });
}

export function usePublishedInterviews() {
  return useQuery({
    queryKey: qk.interviews({ publishedOnly: true, limit: 100 }),
    queryFn: () => adminApi.interviews({ publishedOnly: 'true', limit: 100 }),
    select: (d) => d.items.filter((i) => i.isActive),
    staleTime: 30_000,
  });
}
