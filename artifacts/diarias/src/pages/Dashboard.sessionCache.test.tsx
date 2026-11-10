import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGetMeQueryKey, setAuthTokenGetter, setBaseUrl,
  type ActivityItem, type User,
} from '@workspace/api-client-react';
import Dashboard from './Dashboard';
import { SessionQueryProvider } from '@/components/SessionQueryProvider';
import { Shell } from '@/components/layout/Shell';
import { clearToken, getToken, setToken } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';
import { admin } from '@/test/peopleFixtures';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
const oldActivity: ActivityItem = {
  id: 501, diariaId: 701, providerName: 'Beneficiário Alfa fictício',
  teamName: 'Equipe fictícia', action: 'ação exclusiva Alfa',
  userId: 900, userName: 'Nome atual Alfa fictício',
  userNameAtAction: 'Nome histórico Alfa fictício',
  timestamp: '2026-01-02T12:34:00Z', status: 'aprovada',
};
const newActivity: ActivityItem = {
  ...oldActivity, id: 502, diariaId: 702, action: 'ação exclusiva Beta',
  userId: 901, userName: 'Nome atual Beta fictício',
  userNameAtAction: 'Nome histórico Beta fictício',
};
function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

const violations: string[] = [];
beforeEach(() => {
  clearToken();
  setBaseUrl(null);
  setAuthTokenGetter(getToken);
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  clearToken();
  setAuthTokenGetter(null);
  expect(violations.splice(0), 'No real HTTP, authentication or database access').toEqual([]);
});

/** Only explicitly listed synthetic GETs; even a retry cannot reach a real API. */
function mockSessions(role: User['role']) {
  const identity = deferredResponse();
  const activity = deferredResponse();
  const requests: { path: string; token: string | null; signal?: AbortSignal | null }[] = [];
  let oldResponse: () => Response | Promise<Response> = () => json([oldActivity]);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://synthetic.example.invalid').pathname;
    const method = init?.method ?? 'GET';
    const token = new Headers(init?.headers).get('authorization');
    requests.push({ path, token, signal: init?.signal });
    const known = ['/api/auth/me', '/api/dashboard/summary', '/api/dashboard/recent-activity'];
    if (method !== 'GET' || !known.includes(path) ||
        (token !== null && !['Bearer synthetic-alfa', 'Bearer synthetic-beta'].includes(token))) {
      violations.push(`${method} ${path}`);
      throw new Error(`No synthetic response for ${method} ${path}`);
    }
    if (!token) return json({ error: 'Synthetic signed-out session' }, 401);
    if (token === 'Bearer synthetic-beta') {
      if (path === '/api/auth/me') return identity.promise;
      if (path === '/api/dashboard/recent-activity') return activity.promise;
    }
    if (path === '/api/auth/me') return json(admin);
    if (path === '/api/dashboard/recent-activity') return oldResponse();
    // Summary is a stub only; this suite does not assert indicators or API scope.
    return json({
      pendentes: 0, emAnalise: 0, aprovadas: 0, rejeitadas: 0,
      disponivelExportacao: 0, exportadas: 0, pagas: 0, canceladas: 0,
    });
  }));
  return {
    requests, identity, activity,
    user: { ...admin, id: 901, decargoId: 'synthetic-beta', role, name: 'Conta Beta fictícia' },
    delayOldActivity: () => {
      const response = deferredResponse();
      oldResponse = () => response.promise;
      return response;
    },
  };
}

function renderSession() {
  // Same provider, authentication shell and generated hooks as the application.
  return render(<SessionQueryProvider><Shell><Dashboard /></Shell></SessionQueryProvider>);
}
function expectNoAlfa() {
  expect(screen.queryByText(/ação exclusiva Alfa/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Nome atual Alfa fictício/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Nome histórico Alfa fictício/)).not.toBeInTheDocument();
}
async function cacheAlfa() {
  act(() => setToken('synthetic-alfa'));
  renderSession();
  await screen.findByText(/ação exclusiva Alfa/);
  expect(queryClient.getQueryData(['getRecentActivity'])).toEqual([oldActivity]);
}

describe('Recent activity across synthetic authentication sessions', () => {
  it.each(['admin', 'prestador', 'funcionario', 'gestor'] as const)(
    'erases account Alfa before resolving account Beta (%s)', async role => {
      const api = mockSessions(role);
      await cacheAlfa();
      act(() => clearToken()); // Used by both logout success and failure callbacks.
      expect(getToken()).toBeNull();
      expect(queryClient.getQueryData(['getRecentActivity'])).toBeUndefined();
      expect(queryClient.getQueryData(getGetMeQueryKey())).toBeUndefined();
      expectNoAlfa();

      act(() => setToken('synthetic-beta'));
      expectNoAlfa();
      await waitFor(() => expect(api.requests.some(r =>
        r.token === 'Bearer synthetic-beta' && r.path === '/api/auth/me')).toBe(true));
      expect(api.requests.filter(r => r.token === 'Bearer synthetic-beta' &&
        r.path.startsWith('/api/dashboard/'))).toHaveLength(0);
      expectNoAlfa();

      await act(async () => { api.identity.resolve(json(api.user)); });
      if (role === 'gestor') {
        await screen.findByText(/Acesso negado/);
        expect(api.requests.filter(r => r.token === 'Bearer synthetic-beta' &&
          r.path.startsWith('/api/dashboard/'))).toHaveLength(0);
        expect(queryClient.getQueryData(['getRecentActivity'])).toBeUndefined();
      } else {
        await screen.findByText('Carregando atividade recente...');
        expectNoAlfa();
        await act(async () => { api.activity.resolve(json([newActivity])); });
        await screen.findByText(/ação exclusiva Beta/);
        expect(screen.getByText(/Nome histórico Beta fictício/)).toBeInTheDocument();
        expect(screen.getByText(/Nome atual Beta fictício/)).toBeInTheDocument();
        expect(api.requests.filter(r => r.token === 'Bearer synthetic-beta' &&
          r.path === '/api/dashboard/recent-activity')).toHaveLength(1);
      }
      expectNoAlfa();
    },
  );

  it('cancels an old refresh and ignores its late response after logout/login', async () => {
    const api = mockSessions('prestador');
    await cacheAlfa();
    const late = api.delayOldActivity();
    let refresh!: Promise<void>;
    act(() => {
      refresh = queryClient.invalidateQueries({ queryKey: ['getRecentActivity'] });
    });
    await waitFor(() => expect(api.requests.filter(r =>
      r.path === '/api/dashboard/recent-activity')).toHaveLength(2));
    const oldRequest = api.requests.filter(r => r.path === '/api/dashboard/recent-activity')[1];

    act(() => { clearToken(); setToken('synthetic-beta'); });
    expect(oldRequest.signal?.aborted).toBe(true);
    expectNoAlfa();
    await act(async () => { api.identity.resolve(json(api.user)); });
    await screen.findByText('Carregando atividade recente...');
    await act(async () => {
      // Transport deliberately ignores abort, as a worst-case late response.
      late.resolve(json([oldActivity]));
      await refresh;
    });
    expectNoAlfa();
    expect(queryClient.getQueryData(['getRecentActivity'])).toBeUndefined();
    await act(async () => { api.activity.resolve(json([])); });
    await screen.findByText('Nenhuma atividade recente.');
    expectNoAlfa();
  });

  it('also clears cached identity and activity on direct credential replacement', async () => {
    const api = mockSessions('gestor');
    await cacheAlfa();
    act(() => setToken('synthetic-beta'));
    expectNoAlfa();
    expect(queryClient.getQueryData(['getRecentActivity'])).toBeUndefined();
    expect(queryClient.getQueryData(getGetMeQueryKey())).toBeUndefined();
    await act(async () => { api.identity.resolve(json(api.user)); });
    await screen.findByText(/Acesso negado/);
    expectNoAlfa();
    expect(api.requests.filter(r => r.token === 'Bearer synthetic-beta' &&
      r.path.startsWith('/api/dashboard/'))).toHaveLength(0);
  });
});
