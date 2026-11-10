import { useEffect, useRef, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Switch, Route, Router as WouterRouter } from 'wouter';
import { SessionQueryProvider } from '@/components/SessionQueryProvider';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import { getToken, setToken, subscribeToSession, PEOPLE_PORTAL_URL } from '@/lib/auth';
import { Building2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotFound from '@/pages/not-found';

import Dashboard from '@/pages/Dashboard';
import DiariasCalendar from '@/pages/DiariasCalendar';
import DiariasEquipe from '@/pages/DiariasEquipe';
import DiariaForm from '@/pages/DiariaForm';
import DiariaDetails from '@/pages/DiariaDetails';
import TeamsList from '@/pages/TeamsList';
import PeopleList from '@/pages/PeopleList';
import UsersList from '@/pages/UsersList';
import Reports from '@/pages/Reports';
import AnaliseDiarias from '@/pages/AnaliseDiarias';
import AuditLogs from '@/pages/AuditLogs';
import Configuracoes from '@/pages/Configuracoes';
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

// Capture and remove the fragment before the first render, without starting HTTP.
const pendingToken = extractHandoffToken();

function HandoffGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HandoffState>(() =>
    pendingToken ? 'processing' : 'idle',
  );
  const [errorMsg, setErrorMsg] = useState('');
  const exchange = useRef<Promise<{ access_token: string }> | null>(null);
  const superseded = useRef(false);

  useEffect(() => {
    if (!pendingToken) return;

    // StrictMode replays effect setup/cleanup. Reuse the same request rather
    // than consuming the one-time token again; renders have no HTTP effects.
    exchange.current ??= fetch(`${API_BASE}/api/auth/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: pendingToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Falha no handoff (${res.status})`);
        }
        const body: unknown = await res.json();
        if (
          typeof body !== 'object' || body === null || Array.isArray(body) ||
          !('access_token' in body) ||
          typeof body.access_token !== 'string' || body.access_token.trim().length === 0
        ) {
          throw new Error('O portal retornou uma credencial inválida. Tente novamente pelo portal.');
        }
        return { access_token: body.access_token };
      });

    // Any session action (including logout or reusing the same token) wins over
    // this pending entry. Persist that decision across StrictMode effect replay.
    // Release the gate immediately; neither a late token nor error may replace
    // the current session. Keep this gate outside the keyed route provider.
    let active = true;
    const unsubscribe = subscribeToSession(() => {
      if (!active) return;
      superseded.current = true;
      setState('idle');
    });
    exchange.current
      .then(({ access_token }: { access_token: string }) => {
        if (!active || superseded.current) return;
        // Our own installation is not a competing session action.
        unsubscribe();
        setToken(access_token);
        setState('idle');
      })
      .catch((err: Error) => {
        if (!active || superseded.current) return;
        setErrorMsg(err.message);
        setState('error');
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

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
        <Route path="/diarias" component={DiariasCalendar} />
        <Route path="/diarias-equipe" component={DiariasEquipe} />
        <Route path="/diarias/nova" component={DiariaForm} />
        <Route path="/diarias/:id/editar" component={DiariaForm} />
        <Route path="/diarias/:id" component={DiariaDetails} />
        <Route path="/equipes" component={TeamsList} />
        <Route path="/pessoas" component={PeopleList} />
        <Route path="/usuarios" component={UsersList} />
        <Route path="/relatorios" component={Reports} />
        <Route path="/analise-diarias" component={AnaliseDiarias} />
        <Route path="/auditoria" component={AuditLogs} />
        <Route path="/configuracoes" component={Configuracoes} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <TooltipProvider>
      <HandoffGate>
        <SessionQueryProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </SessionQueryProvider>
      </HandoffGate>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
