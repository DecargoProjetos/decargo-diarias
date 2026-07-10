import { useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Switch, Route, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
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

// ---------------------------------------------------------------------------
// API base URL — points all generated client calls + handoff fetch to the
// correct server.  In dev (Replit) the api-server is co-hosted; no base URL
// needed.  In production (Railway) each service is a separate origin.
//
// VITE_API_URL must be an https:// URL when provided; reject anything else to
// prevent accidental token leakage to an unintended origin.
// ---------------------------------------------------------------------------
const rawApiUrl = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');
if (rawApiUrl && !/^https?:\/\/./.test(rawApiUrl)) {
  throw new Error(`VITE_API_URL must be an absolute http(s) URL, got: "${rawApiUrl}"`);
}
const API_BASE = rawApiUrl;
setBaseUrl(API_BASE || null);

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

// ---------------------------------------------------------------------------
// HandoffGate — must run before any route or authenticated query executes.
//
// State machine:
//   'processing' → hash has #handoff= token, exchange in progress
//   'error'      → handoff exchange failed (show error, block app)
//   'idle'       → no handoff in progress, render the app normally
//
// The initial state is computed synchronously from window.location.hash so
// the app never renders in a half-authenticated state before the exchange
// completes.  Routes and useGetMe only execute when state === 'idle'.
// ---------------------------------------------------------------------------
type HandoffState = 'idle' | 'processing' | 'error';

function extractHandoffToken(): string | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#handoff=')) return null;
  const token = hash.slice('#handoff='.length);
  // Clear the fragment immediately — token must never sit in the URL
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return token || null;
}

// Check synchronously so useState initializer runs before first render
const pendingToken = extractHandoffToken();

function HandoffGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HandoffState>(() =>
    pendingToken ? 'processing' : 'idle',
  );
  const [errorMsg, setErrorMsg] = useState('');

  // Run the exchange exactly once if a token was found
  useState(() => {
    if (!pendingToken) return;

    const handoffUrl = `${API_BASE}/api/auth/handoff`;
    // eslint-disable-next-line no-console
    console.log('[handoff] API_BASE =', JSON.stringify(API_BASE));
    // eslint-disable-next-line no-console
    console.log('[handoff] POST →', handoffUrl);

    fetch(handoffUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: pendingToken }),
    })
      .then(async (res) => {
        // eslint-disable-next-line no-console
        console.log('[handoff] response status =', res.status, 'url =', res.url);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          // eslint-disable-next-line no-console
          console.error('[handoff] error body =', body);
          throw new Error(body?.error || `Falha no handoff (${res.status})`);
        }
        return res.json();
      })
      .then(({ access_token }: { access_token: string }) => {
        setToken(access_token);
        queryClient.invalidateQueries();
        setState('idle');
      })
      .catch((err: Error) => {
        setErrorMsg(err.message);
        setState('error');
      });
  });

  if (state === 'processing') {
    return (
      <div className="min-h-screen bg-sidebar flex flex-col items-center justify-center gap-4 text-sidebar-foreground">
        <div className="bg-primary text-primary-foreground p-3 rounded-lg">
          <Building2 size={36} />
        </div>
        <Loader2 size={28} className="animate-spin text-primary" />
        <p className="text-sm text-sidebar-foreground/70 tracking-wide">
          Autenticando via DECARGO ID…
        </p>
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
