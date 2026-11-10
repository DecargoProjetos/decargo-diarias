import { ReactNode, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export function Shell({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isFetching, error, refetch } = useGetMe({
    query: {
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (error?.status === 401) {
      setLocation('/login');
    }
  }, [error, setLocation]);

  if (location === '/login') {
    return <>{children}</>;
  }

  if (error?.status === 401) {
    return null; // The effect redirects without exposing cached protected content.
  }

  if (error || (!isLoading && !user)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center space-y-4">
          <div role="alert" className="space-y-3">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
            <h1 className="text-xl font-semibold">Não foi possível verificar sua sessão.</h1>
            <p className="text-muted-foreground">
              O serviço pode estar temporariamente indisponível. Tente novamente para acessar o painel.
            </p>
          </div>
          <Button onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? 'Tentando novamente...' : 'Tentar novamente'}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p role="status" className="mt-4 text-muted-foreground font-medium">Carregando painel...</p>
      </div>
    );
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
