import { useEffect, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Switch, Route, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { getToken, setToken, PEOPLE_PORTAL_URL } from '@/lib/auth';
import { Building2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotFound from '@/pages/not-found';

import Dashboard from '@/pages/Dashboard';
import DiariasList from '@/pages/DiariasList';
import DiariaForm from '@/pages/DiariaForm';
import DiariaDetails from '@/pages/DiariaDetails';
import TeamsList from '@/pages/TeamsList';
import ProvidersList from '@/pages/ProvidersList';
import UsersList from '@/pages/UsersList';
import Reports from '@/pages/Reports';
import AuditLogs from '@/pages/AuditLogs';
import Login from '@/pages/Login';

// Configure API client to send Bearer token on every request
setAuthTokenGetter(() => getToken());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});

type HandoffState = 'idle' | 'processing' | 'error';

/**
 * HandoffGate — must wrap the entire app.
 * Captures the #handoff=TOKEN fragment before any route renders,
 * exchanges it for a local access_token, then renders the app.
 * If the handoff fails, renders a hard error screen (no app rendered
 * to avoid the redirect loop described in the protocol).
 */
function HandoffGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HandoffState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#handoff=')) return;

    const token = hash.slice('#handoff='.length);
    // Clear the fragment immediately — never leave the token in the URL
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    setState('processing');

    fetch('/api/auth/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Falha no handoff (${res.status})`);
        }
        return res.json();
      })
      .then(({ access_token }: { access_token: string }) => {
        setToken(access_token);
        // Invalidate all cached queries so they re-run with the new token
        queryClient.invalidateQueries();
        setState('idle');
      })
      .catch((err: Error) => {
        setErrorMsg(err.message);
        setState('error');
      });
  }, []);

  if (state === 'processing') {
    return (
      <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center gap-4 text-sidebar-foreground">
        <div className="bg-primary text-primary-foreground p-3 rounded-lg">
          <Building2 size={36} />
        </div>
        <Loader2 size={28} className="animate-spin text-primary" />
        <p className="text-sm text-sidebar-foreground/70 tracking-wide">Autenticando via DECARGO ID…</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center gap-6 text-sidebar-foreground p-6">
        <div className="bg-destructive/20 text-destructive p-3 rounded-lg">
          <AlertTriangle size={36} />
        </div>
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold mb-2">Falha na autenticação</h1>
          <p className="text-sm text-sidebar-foreground/70 mb-4">{errorMsg}</p>
          <p className="text-xs text-sidebar-foreground/50">
            O token pode ter expirado (validade: 90 segundos). Tente novamente pelo portal.
          </p>
        </div>
        <Button onClick={() => { window.location.href = PEOPLE_PORTAL_URL; }}>
          Voltar ao DECARGO People
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/" component={Dashboard} />
        <Route path="/diarias" component={DiariasList} />
        <Route path="/diarias/nova" component={DiariaForm} />
        <Route path="/diarias/:id/editar" component={DiariaForm} />
        <Route path="/diarias/:id" component={DiariaDetails} />
        <Route path="/equipes" component={TeamsList} />
        <Route path="/prestadores" component={ProvidersList} />
        <Route path="/usuarios" component={UsersList} />
        <Route path="/relatorios" component={Reports} />
        <Route path="/auditoria" component={AuditLogs} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <HandoffGate>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </HandoffGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
