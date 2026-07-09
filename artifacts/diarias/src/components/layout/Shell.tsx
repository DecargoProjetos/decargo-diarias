import { ReactNode, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { useLocation } from 'wouter';

export function Shell({ children }: { children: ReactNode }) {
  const { data: user, isLoading, error } = useGetMe({
    query: {
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (error && (error as any)?.status === 401) {
      setLocation('/login');
    }
  }, [error, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-muted-foreground font-medium">Carregando painel...</p>
      </div>
    );
  }

  if (!user && location !== '/login') {
    return null; // Will redirect via useEffect
  }

  if (location === '/login') {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
