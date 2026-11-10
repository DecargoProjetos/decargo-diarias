import { Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { getToken, subscribeToSession } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';

/** Remount observers and local UI state when credentials change. */
export function SessionQueryProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribeToSession, getToken, () => null);
  return (
    <QueryClientProvider client={queryClient}>
      <Fragment key={token ?? 'signed-out'}>{children}</Fragment>
    </QueryClientProvider>
  );
}
