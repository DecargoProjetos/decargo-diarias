import { Fragment, StrictMode, useEffect, type ReactNode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({
  mounts: [] as { token: string | null; cachedQueries: number }[],
  unmounts: 0,
  getToken: () => null as string | null,
}));

// Keep App, HandoffGate, SessionQueryProvider, auth and QueryClient real.
// Replace unrelated pages with a route observer: no login, API hooks or database.
vi.mock('@/components/layout/Shell', () => ({
  Shell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/pages/Dashboard', () => ({
  default: function RouteProbe() {
    const client = useQueryClient();
    const token = probe.getToken();
    useEffect(() => {
      probe.mounts.push({ token, cachedQueries: client.getQueryCache().getAll().length });
      return () => { probe.unmounts += 1; };
    }, []);
    return <h1>Painel sintético: {token}</h1>;
  },
}));
vi.mock('@/pages/not-found', () => ({ default: () => null }));
vi.mock('@/pages/DiariasCalendar', () => ({ default: () => null }));
vi.mock('@/pages/DiariasEquipe', () => ({ default: () => null }));
vi.mock('@/pages/DiariaForm', () => ({ default: () => null }));
vi.mock('@/pages/DiariaDetails', () => ({ default: () => null }));
vi.mock('@/pages/TeamsList', () => ({ default: () => null }));
vi.mock('@/pages/PeopleList', () => ({ default: () => null }));
vi.mock('@/pages/UsersList', () => ({ default: () => null }));
vi.mock('@/pages/Reports', () => ({ default: () => null }));
vi.mock('@/pages/AnaliseDiarias', () => ({ default: () => null }));
vi.mock('@/pages/AuditLogs', () => ({ default: () => null }));
vi.mock('@/pages/Configuracoes', () => ({ default: () => null }));
vi.mock('@/pages/Login', () => ({ default: () => null }));

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
const HANDOFF = 'synthetic-portal-token';
const OLD = 'synthetic-old-credential';
const NEW = 'synthetic-new-credential';
const NEXT = 'synthetic-next-credential';
let auth: typeof import('@/lib/auth');
let queryClient: typeof import('@/lib/queryClient')['queryClient'];
const unexpectedRequests: string[] = [];

beforeEach(async () => {
  // pendingToken is read at App module evaluation. Each test simulates a fresh
  // page entry, importing App only AFTER installing the synthetic URL fragment.
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', '');
  window.history.replaceState(null, '', '/?entry=synthetic');
  sessionStorage.clear();
  probe.mounts.length = 0;
  probe.unmounts = 0;
  auth = await import('@/lib/auth');
  ({ queryClient } = await import('@/lib/queryClient'));
  probe.getToken = auth.getToken;
});

afterEach(async () => {
  cleanup();
  auth.clearToken();
  const api = await import('@workspace/api-client-react');
  api.setAuthTokenGetter(null);
  api.setBaseUrl(null);
  window.history.replaceState(null, '', '/');
  vi.unstubAllEnvs();
  expect(unexpectedRequests.splice(0), 'No real HTTP, login or database access').toEqual([]);
});

function mockExchange(
  response: () => Response | Promise<Response>,
  token = HANDOFF,
  endpoint = '/api/auth/handoff',
) {
  const requests = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    // Exact allowlist, without passthrough: App must only send this POST.
    if (String(input) !== endpoint ||
        init?.method !== 'POST' ||
        new Headers(init.headers).get('Content-Type') !== 'application/json' ||
        init.body !== JSON.stringify({ token })) {
      unexpectedRequests.push(`${init?.method ?? 'GET'} ${String(input)}`);
      throw new Error('Unexpected request: synthetic handoff POST only.');
    }
    return response();
  });
  vi.stubGlobal('fetch', requests);
  return requests;
}

function seedOldSession() {
  auth.setToken(OLD);
  queryClient.setQueryData(['/api/auth/me'], { name: 'Conta anterior fictícia' });
  queryClient.setQueryData(['getRecentActivity'], [{ action: 'Atividade anterior fictícia' }]);
  queryClient.getMutationCache().build(queryClient, {
    mutationKey: ['synthetic-old-mutation'],
  });
}

async function enterFromPortal(strict: boolean, fragment = `#handoff=${HANDOFF}`) {
  window.history.replaceState(null, '', `/?entry=synthetic${fragment}`);
  const { default: App } = await import('./App');
  // Removed before first render, while preserving path and query string.
  expect(window.location.hash).toBe('');
  expect(window.location.pathname + window.location.search).toBe('/?entry=synthetic');
  // Importing App must capture the fragment, but must not start an exchange.
  expect(fetch).not.toHaveBeenCalled();
  const Wrapper = strict ? StrictMode : Fragment;
  const tree = () => <Wrapper><App /></Wrapper>;
  return { tree, view: render(tree()) };
}

function expectRoutesBlocked() {
  expect(screen.queryByRole('heading', { name: /Painel sintético/ })).not.toBeInTheDocument();
  expect(probe.mounts).toEqual([]);
}

describe.each([false, true])('App synthetic portal handoff (StrictMode=%s)', strict => {
  const effectRuns = strict ? 2 : 1;

  it.each([
    'https://api.diarias.example',
    'https://api.diarias.example/',
    'https://api.diarias.example////',
    '  https://api.diarias.example///  ',
  ])('sends the handoff only to the configured HTTPS origin (%s)', async apiUrl => {
    // .example is reserved; the allowlist below never forwards network traffic.
    // Set the environment BEFORE importing App, where API_BASE is evaluated.
    vi.stubEnv('VITE_API_URL', apiUrl);
    const endpoint = 'https://api.diarias.example/api/auth/handoff';
    const requests = mockExchange(() => json({ access_token: NEW }), HANDOFF, endpoint);
    const { tree, view } = await enterFromPortal(strict);

    expect(await screen.findByRole('heading', { name: `Painel sintético: ${NEW}` })).toBeInTheDocument();
    expect(requests).toHaveBeenCalledTimes(1);
    expect(requests).toHaveBeenCalledWith(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: HANDOFF }),
    });
    expect(auth.getToken()).toBe(NEW);
    expect(window.location.hash).toBe('');
    view.rerender(tree());
    expect(requests).toHaveBeenCalledTimes(1);
  });

  it.each([
    '/api',
    '//api.diarias.example',
    'api.diarias.example',
    'ftp://api.diarias.example',
    'javascript:synthetic',
    'https://',
  ])('rejects invalid API configuration without sending the token (%s)', async apiUrl => {
    seedOldSession();
    vi.stubEnv('VITE_API_URL', apiUrl);
    const requests = mockExchange(() => {
      throw new Error('Invalid configuration must not exchange the token.');
    });
    const installToken = vi.spyOn(auth, 'setToken');
    window.history.replaceState(null, '', `/?entry=synthetic#handoff=${HANDOFF}`);

    // Validation fails at module evaluation, before App can render or fetch.
    await expect(import('./App')).rejects.toThrow(
      'VITE_API_URL must be an absolute http(s) URL',
    );
    expect(requests).not.toHaveBeenCalled();
    expect(installToken).not.toHaveBeenCalled();
    expect(auth.getToken()).toBe(OLD);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(1);
    expectRoutesBlocked();
  });

  it('clears the old cache, exchanges once and keeps the gate mounted across route remounts', async () => {
    seedOldSession();
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    const requests = mockExchange(() => pending);
    const { tree, view } = await enterFromPortal(strict);

    expect(screen.getByText('Autenticando via DECARGO ID…')).toBeInTheDocument();
    expectRoutesBlocked();
    expect(auth.getToken()).toBe(OLD);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
    expect(requests).toHaveBeenCalledTimes(1);
    view.rerender(tree());
    expect(requests).toHaveBeenCalledTimes(1);

    // Observe the installation itself, not just the eventual route render.
    const installed: { token: string | null; queries: number; mutations: number }[] = [];
    const unsubscribe = auth.subscribeToSession(() => {
      installed.push({
        token: auth.getToken(),
        queries: queryClient.getQueryCache().getAll().length,
        mutations: queryClient.getMutationCache().getAll().length,
      });
    });
    try {
      await act(async () => { resolve(json({ access_token: NEW })); });
      expect(await screen.findByRole('heading', { name: `Painel sintético: ${NEW}` })).toBeInTheDocument();
      expect(installed).toEqual([{ token: NEW, queries: 0, mutations: 0 }]);
      expect(probe.mounts).toEqual(Array.from({ length: effectRuns }, () => ({ token: NEW, cachedQueries: 0 })));
      expect(requests).toHaveBeenCalledTimes(1);

      // A further credential change really remounts the routes. If HandoffGate
      // moves inside the keyed provider, it consumes pendingToken again here.
      queryClient.setQueryData(['getRecentActivity'], [{ action: 'Outra atividade fictícia' }]);
      act(() => auth.setToken(NEXT));
      expect(await screen.findByRole('heading', { name: `Painel sintético: ${NEXT}` })).toBeInTheDocument();
      expect(probe.mounts).toEqual([
        ...Array.from({ length: effectRuns }, () => ({ token: NEW, cachedQueries: 0 })),
        ...Array.from({ length: effectRuns }, () => ({ token: NEXT, cachedQueries: 0 })),
      ]);
      expect(probe.unmounts).toBe(effectRuns * 2 - 1);
      view.rerender(tree());
      expect(requests).toHaveBeenCalledTimes(1);
      expect(window.location.hash).toBe('');
      expect(auth.getToken()).toBe(NEXT);
    } finally {
      unsubscribe();
    }
  });

  it.each([
    ['HTTP rejection', () => json({ error: 'Token sintético expirado' }, 401), 'Token sintético expirado'],
    ['unreadable error body', () => new Response('not-json', { status: 503 }), 'Falha no handoff (503)'],
    ['network rejection', () => Promise.reject(new TypeError('Falha de rede sintética')), 'Falha de rede sintética'],
  ])('blocks the app after %s, even with an old credential', async (_case, response, message) => {
    seedOldSession();
    const requests = mockExchange(response);
    const { tree, view } = await enterFromPortal(strict);
    await screen.findByRole('heading', { name: 'Falha na autenticação' });
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar ao DECARGO People' })).toBeEnabled();
    expect(screen.queryByText('Autenticando via DECARGO ID…')).not.toBeInTheDocument();
    expectRoutesBlocked();
    expect(auth.getToken()).toBe(OLD);
    expect(window.location.hash).toBe('');
    view.rerender(tree());
    expectRoutesBlocked();
    expect(requests).toHaveBeenCalledTimes(1);
  });

  describe.each([false, true])('invalid successful response (old session: %s)', (hasOldSession) => {
    it.each([
      ['missing token', {}],
      ['empty token', { access_token: '' }],
      ['whitespace-only token', { access_token: ' \t\n ' }],
      ['null token', { access_token: null }],
      ['numeric token', { access_token: 123 }],
      ['boolean token', { access_token: true }],
      ['object token', { access_token: { value: NEW } }],
      ['array token', { access_token: [NEW] }],
      ['null body', null],
      ['array body', []],
      ['string body', NEW],
    ])('blocks %s without installing a session', async (_case, body) => {
      if (hasOldSession) seedOldSession();
      const installToken = vi.spyOn(auth, 'setToken');
      const sessionChanged = vi.fn();
      const unsubscribe = auth.subscribeToSession(sessionChanged);
      const requests = mockExchange(() => json(body));
      try {
        const { tree, view } = await enterFromPortal(strict);
        await screen.findByRole('heading', { name: 'Falha na autenticação' });
        expect(screen.getByText(
          'O portal retornou uma credencial inválida. Tente novamente pelo portal.',
        )).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Voltar ao DECARGO People' })).toBeEnabled();
        expect(screen.queryByText('Autenticando via DECARGO ID…')).not.toBeInTheDocument();
        expectRoutesBlocked();
        expect(installToken).not.toHaveBeenCalled();
        expect(sessionChanged).not.toHaveBeenCalled();
        expect(auth.getToken()).toBe(hasOldSession ? OLD : null);
        expect(queryClient.getQueryCache().getAll()).toHaveLength(hasOldSession ? 2 : 0);
        expect(queryClient.getMutationCache().getAll()).toHaveLength(hasOldSession ? 1 : 0);
        expect(window.location.hash).toBe('');
        view.rerender(tree());
        expectRoutesBlocked();
        expect(requests).toHaveBeenCalledTimes(1);
      } finally {
        unsubscribe();
      }
    });
  });

  it.each(['', '#handoff=', '#section=synthetic'])('does not exchange an absent token (%s)', async fragment => {
    const requests = mockExchange(() => { throw new Error('No exchange expected'); });
    window.history.replaceState(null, '', `/?entry=synthetic${fragment}`);
    const { default: App } = await import('./App');
    const Wrapper = strict ? StrictMode : Fragment;
    render(<Wrapper><App /></Wrapper>);
    expect(screen.getByRole('heading', { name: 'Painel sintético:' })).toBeInTheDocument();
    expect(probe.mounts).toEqual(Array.from({ length: effectRuns }, () => ({ token: null, cachedQueries: 0 })));
    expect(requests).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(fragment === '#handoff=' ? '' : fragment);
    expect(window.location.pathname + window.location.search).toBe('/?entry=synthetic');
  });

  it('sends the captured synthetic fragment unchanged', async () => {
    const token = 'synthetic%2Bencoded%3Dtoken';
    const requests = mockExchange(() => json({ access_token: NEW }), token);
    await enterFromPortal(strict, `#handoff=${token}`);
    expect(await screen.findByRole('heading', { name: `Painel sintético: ${NEW}` })).toBeInTheDocument();
    expect(requests).toHaveBeenCalledTimes(1);
    expect(auth.getToken()).toBe(NEW);
  });

  describe.each(['new session', 'logout', 'same credential', 'change and return'] as const)(
    'pending entry superseded by %s',
    action => {
      it.each(['success', 'HTTP failure', 'network failure', 'invalid token'])(
        'ignores late %s without changing the current session or cache',
        async outcome => {
          seedOldSession();
          let resolve!: (response: Response) => void;
          let reject!: (error: Error) => void;
          const pending = new Promise<Response>((done, fail) => {
            resolve = done;
            reject = fail;
          });
          const requests = mockExchange(() => pending);
          const { tree, view } = await enterFromPortal(strict);
          expectRoutesBlocked();

          act(() => {
            if (action === 'logout') auth.clearToken();
            else if (action === 'new session') auth.setToken(NEXT);
            else {
              if (action === 'change and return') auth.setToken(NEXT);
              auth.setToken(OLD);
            }
          });
          const currentToken = action === 'logout' ? null : action === 'new session' ? NEXT : OLD;
          const heading = currentToken ? `Painel sintético: ${currentToken}` : 'Painel sintético:';
          expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
          expect(screen.queryByText('Autenticando via DECARGO ID…')).not.toBeInTheDocument();
          expect(probe.mounts).toEqual(Array.from({ length: effectRuns }, () => ({
            token: currentToken, cachedQueries: 0,
          })));
          queryClient.setQueryData(['synthetic-current-session'], { value: 'Preservar' });
          const mutation = queryClient.getMutationCache().build(queryClient, {
            mutationKey: ['synthetic-current-mutation'],
          });
          const sessionChanged = vi.fn();
          const installToken = vi.spyOn(auth, 'setToken');
          const unsubscribe = auth.subscribeToSession(sessionChanged);
          try {
            await act(async () => {
              if (outcome === 'network failure') reject(new TypeError('Erro sintético tardio'));
              else resolve(outcome === 'success'
                ? json({ access_token: NEW })
                : outcome === 'invalid token'
                  ? json({ access_token: null })
                  : json({ error: 'Erro sintético tardio' }, 401));
            });
            view.rerender(tree());
            expect(auth.getToken()).toBe(currentToken);
            expect(installToken).not.toHaveBeenCalled();
            expect(sessionChanged).not.toHaveBeenCalled();
            expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
            expect(screen.queryByText('Falha na autenticação')).not.toBeInTheDocument();
            expect(queryClient.getQueryData(['synthetic-current-session'])).toEqual({ value: 'Preservar' });
            expect(queryClient.getMutationCache().getAll()).toEqual([mutation]);
            expect(probe.mounts).toHaveLength(effectRuns);
            expect(requests).toHaveBeenCalledTimes(1);
            expect(window.location.hash).toBe('');
          } finally {
            unsubscribe();
          }
        },
      );
    },
  );

  it.each(['success', 'failure'])('ignores a late %s after the gate unmounts', async outcome => {
    seedOldSession();
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    const requests = mockExchange(() => pending);
    const { view } = await enterFromPortal(strict);
    expectRoutesBlocked();
    view.unmount();
    await act(async () => {
      resolve(outcome === 'success'
        ? json({ access_token: NEW })
        : json({ error: 'Erro sintético tardio' }, 401));
    });
    expect(auth.getToken()).toBe(OLD);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
    expectRoutesBlocked();
    expect(requests).toHaveBeenCalledTimes(1);
  });
});
