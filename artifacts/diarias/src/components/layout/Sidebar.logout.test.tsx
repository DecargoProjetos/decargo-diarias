import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import {
  getGetMeQueryKey, setAuthTokenGetter, setBaseUrl, type ActivityItem,
} from '@workspace/api-client-react';
import { SessionQueryProvider } from '@/components/SessionQueryProvider';
import Dashboard from '@/pages/Dashboard';
import { clearToken, getToken, PEOPLE_PORTAL_URL, setToken } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';
import { admin } from '@/test/peopleFixtures';
import { Shell } from './Shell';

const token = 'synthetic-logout-session';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
const activity: ActivityItem = {
  id: 501, diariaId: 701, providerName: 'Beneficiário anterior fictício',
  teamName: 'Equipe fictícia', action: 'ação exclusiva da sessão anterior',
  userId: 900, userName: 'Responsável atual anterior fictício',
  userNameAtAction: 'Responsável histórico anterior fictício',
  timestamp: '2026-01-02T12:34:00Z', status: 'aprovada',
};
const violations: string[] = [];

beforeEach(() => {
  clearToken();
  setBaseUrl(null);
  setAuthTokenGetter(getToken);
});
afterEach(() => {
  cleanup();
  clearToken();
  setAuthTokenGetter(null);
  setBaseUrl(null);
  expect(violations.splice(0), 'No real HTTP, authentication or database access').toEqual([]);
});

function mockHttp() {
  let resolveLogout!: (response: Response) => void;
  const pendingLogout = new Promise<Response>(resolve => { resolveLogout = resolve; });
  const requests: { path: string; method: string; authorization: string | null }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://synthetic.example.invalid').pathname;
    const method = init?.method ?? 'GET';
    const authorization = new Headers(init?.headers).get('authorization');
    requests.push({ path, method, authorization });
    if (method === 'POST' && path === '/api/auth/logout' &&
        authorization === `Bearer ${token}`) return pendingLogout;
    const reads = ['/api/auth/me', '/api/dashboard/summary', '/api/dashboard/recent-activity'];
    if (method !== 'GET' || !reads.includes(path) ||
        (authorization !== null && authorization !== `Bearer ${token}`)) {
      violations.push(`${method} ${path}`);
      throw new Error(`No synthetic response for ${method} ${path}`);
    }
    if (!authorization) return json({ message: 'Synthetic signed-out session' }, 401);
    if (path === '/api/auth/me') return json(admin);
    if (path === '/api/dashboard/recent-activity') return json([activity]);
    // Indicators are incidental to this logout test.
    return json({
      pendentes: 0, emAnalise: 0, aprovadas: 0, rejeitadas: 0,
      disponivelExportacao: 0, exportadas: 0, pagas: 0, canceladas: 0,
    });
  }));
  return { requests, resolveLogout };
}

function interceptRedirect() {
  const redirect = vi.fn((_href: string) => ({
    token: getToken(),
    storedToken: sessionStorage.getItem('diarias_access_token'),
    queries: queryClient.getQueryCache().getAll().length,
    mutations: queryClient.getMutationCache().getAll().length,
  }));
  // jsdom's Location.href is non-configurable. Intercept only the browser
  // navigation boundary; leave auth, generated hooks and session cache real.
  const realWindow = window;
  const location = new Proxy(realWindow.location, {
    set(target, property, value) {
      if (property === 'href') {
        redirect(String(value));
        return true;
      }
      return Reflect.set(target, property, value);
    },
  });
  vi.stubGlobal('window', new Proxy(realWindow, {
    get(target, property) {
      return property === 'location' ? location : Reflect.get(target, property, target);
    },
  }));
  return redirect;
}

function expectNoOldSession() {
  for (const text of [
    admin.name, activity.providerName, activity.action,
    activity.userName!, activity.userNameAtAction!,
  ]) {
    expect(screen.queryByText(text, { exact: false })).not.toBeInTheDocument();
  }
  expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument();
}

describe('Sidebar logout through the real session provider', () => {
  it.each([
    ['success callback (HTTP 200)', 200],
    ['error callback (HTTP 503)', 503],
  ])('erases the old session before redirecting on %s', async (_name, status) => {
    const api = mockHttp();
    const redirect = interceptRedirect();
    const route = memoryLocation({ path: '/' });
    act(() => setToken(token));
    render(
      <SessionQueryProvider>
        <Router hook={route.hook}>
          <Shell><Dashboard /></Shell>
        </Router>
      </SessionQueryProvider>,
    );
    await screen.findByText(activity.action, { exact: false });
    expect(screen.getByText(admin.name)).toBeInTheDocument();
    expect(screen.getByText(activity.userName!, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(activity.userNameAtAction!, { exact: false })).toBeInTheDocument();
    expect(queryClient.getQueryData(getGetMeQueryKey())).toEqual(admin);
    expect(queryClient.getQueryData(['getRecentActivity'])).toEqual([activity]);
    expect(queryClient.getQueryData(['getDashboardSummary'])).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(api.requests.filter(r => r.method === 'POST')).toEqual([
      { path: '/api/auth/logout', method: 'POST', authorization: `Bearer ${token}` },
    ]));
    // Cleanup must be triggered by the mutation callback, not test clearToken().
    expect(getToken()).toBe(token);
    expect(redirect).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['getRecentActivity'])).toEqual([activity]);

    await act(async () => {
      api.resolveLogout(json({ message: status === 200 ? 'Synthetic logout' : 'Synthetic failure' }, status));
    });
    await waitFor(() => expect(redirect).toHaveBeenCalledExactlyOnceWith(PEOPLE_PORTAL_URL));
    // At the navigation boundary even the mutation and unobserved cache must
    // already be destroyed. New signed-out queries may exist after remount.
    expect(redirect.mock.results[0].value).toEqual({
      token: null, storedToken: null, queries: 0, mutations: 0,
    });
    expect(getToken()).toBeNull();
    expect(sessionStorage.getItem('diarias_access_token')).toBeNull();
    expect(queryClient.getQueryData(getGetMeQueryKey())).toBeUndefined();
    expect(queryClient.getQueryData(['getRecentActivity'])).toBeUndefined();
    expect(queryClient.getQueryData(['getDashboardSummary'])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll().every(q => q.state.data === undefined)).toBe(true);
    await waitFor(expectNoOldSession);
    expect(api.requests.filter(r => r.method === 'POST')).toHaveLength(1);
  });
});
