import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getGetMeQueryKey } from '@workspace/api-client-react';
import { Router, Route, Switch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { admin } from '@/test/peopleFixtures';
import { Shell } from './Shell';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
const unavailable = () => json({ message: 'Falha sintética' }, 503);
const unauthorized = () => json({ message: 'Sessão expirada' }, 401);
const clients: QueryClient[] = [];
const unexpectedRequests: string[] = [];

afterEach(() => {
  clients.splice(0).forEach(client => client.clear());
  expect(unexpectedRequests.splice(0), 'Only synthetic session requests are allowed').toEqual([]);
});

// No hook mocks or network passthrough: exercise customFetch, useGetMe and the real Sidebar.
function mockSession(response: () => Response | Promise<Response>) {
  const requests = vi.fn(response);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'https://synthetic.example.invalid');
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (method !== 'GET' || url.pathname !== '/api/auth/me') {
      const key = `${method} ${url.pathname}`;
      unexpectedRequests.push(key);
      throw new Error(`No synthetic response for ${key}`);
    }
    return requests();
  }));
  return requests;
}

function renderShell(path = '/') {
  const location = memoryLocation({ path, record: true });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>
        <Shell>
          <Switch>
            <Route path="/login"><h1>Acesso ao Sistema</h1></Route>
            <Route><h1>Painel protegido</h1></Route>
          </Switch>
        </Shell>
      </Router>
    </QueryClientProvider>,
  );
  return { client, location };
}

function expectBlocked() {
  expect(screen.queryByText('Painel protegido')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  expect(screen.queryByText(admin.name)).not.toBeInTheDocument();
}

describe('Shell session availability', () => {
  it.each([
    ['HTTP 503', unavailable],
    ['network rejection', () => Promise.reject(new TypeError('Synthetic network failure'))],
  ])('shows a recoverable notice instead of a blank page on %s', async (_name, response) => {
    const requests = mockSession(response);
    const { location } = renderShell();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível verificar sua sessão.');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();
    expectBlocked();
    expect(location.history).toEqual(['/']);
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it('blocks protected content while loading the initial session', async () => {
    let resolve!: (response: Response) => void;
    const requests = mockSession(() => new Promise<Response>(done => { resolve = done; }));
    renderShell();
    expect(screen.getByRole('status')).toHaveTextContent('Carregando painel...');
    expectBlocked();
    await waitFor(() => expect(requests).toHaveBeenCalledTimes(1));
    await act(async () => { resolve(json(admin)); });
    expect(await screen.findByText('Painel protegido')).toBeInTheDocument();
    expect(screen.getByText(admin.name)).toBeInTheDocument();
  });

  it('shows loading without duplicate retries and restores the real shell after recovery', async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    const requests = mockSession(unavailable);
    requests.mockImplementationOnce(unavailable).mockImplementationOnce(() => pending);
    const { location } = renderShell();
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(requests).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status')).toHaveTextContent('Carregando painel...');
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
    expectBlocked();
    expect(requests).toHaveBeenCalledTimes(2);
    await act(async () => { resolve(json(admin)); });
    expect(await screen.findByText('Painel protegido')).toBeInTheDocument();
    expect(screen.getByText(admin.name)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(location.history).toEqual(['/']);
    expect(requests).toHaveBeenCalledTimes(2);
  });

  it('allows another retry after a repeated failure', async () => {
    const requests = mockSession(unavailable);
    renderShell();
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(requests).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível verificar sua sessão.');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();
    expectBlocked();
  });

  it('redirects an initial 401 to login, not to an availability notice', async () => {
    const requests = mockSession(unauthorized);
    const { location } = renderShell();
    expect(await screen.findByText('Acesso ao Sistema')).toBeInTheDocument();
    expect(location.history).toEqual(['/', '/login']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectBlocked();
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it('redirects to login when a manual retry returns 401', async () => {
    const requests = mockSession(unavailable);
    requests.mockImplementationOnce(unavailable).mockImplementationOnce(unauthorized);
    const { location } = renderShell();
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Acesso ao Sistema')).toBeInTheDocument();
    expect(location.history).toEqual(['/', '/login']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectBlocked();
    expect(requests).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['503', unavailable],
    ['401', unauthorized],
  ])('does not expose cached protected content after a refresh returns %s', async (status, response) => {
    const requests = mockSession(() => json(admin));
    const { client } = renderShell();
    await screen.findByText('Painel protegido');
    requests.mockImplementation(response);
    await act(async () => { await client.invalidateQueries({ queryKey: getGetMeQueryKey() }); });
    if (status === '401') await screen.findByText('Acesso ao Sistema');
    else await screen.findByRole('alert');
    expectBlocked();
  });

  it('keeps the public login accessible when session lookup fails', async () => {
    const requests = mockSession(unavailable);
    renderShell('/login');
    expect(screen.getByText('Acesso ao Sistema')).toBeInTheDocument();
    await waitFor(() => expect(requests).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectBlocked();
  });
});
