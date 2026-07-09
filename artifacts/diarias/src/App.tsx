import { Shell } from '@/components/layout/Shell';
import { Switch, Route, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
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

const queryClient = new QueryClient();

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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
