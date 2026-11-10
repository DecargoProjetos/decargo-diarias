import type { ReactElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, vi } from 'vitest';
import {
  setAuthTokenGetter, setBaseUrl,
  type ExportCorrectionPreview, type ExportCorrectionConfirmation,
} from '@workspace/api-client-react';

export const PREVIEW = '/api/diarias/export/correction/preview';
export const CORRECT = '/api/diarias/export/correction';
export const reason = 'Conferência sintética do ID e documento no People.';
export const documentA = '12345678000190';
export const documentB = '98765432000110';

export function correctionPreview(): ExportCorrectionPreview {
  return {
    rows: [{
      id: 71, providerId: 101, providerName: 'Prestador fictício',
      providerDecargoId: 'manual-synthetic', cnpj: null,
      typeId: 31, typeName: 'Falta fictícia', exportTarget: 'descontos',
      status: 'disponivel_exportacao', integrationId: null, exportedAt: null, exportedBy: null,
      approvedAt: '2026-10-01T12:00:00Z', approvedBy: 900,
      workDate: '2026-10-02', paymentDate: '2026-10-09', value: '150.00',
      updatedAt: '2026-10-03T12:00:00Z',
    }],
    skipped: [],
    // Same names deliberately cannot determine the selected identity.
    providers: [
      { id: 201, name: 'Prestador fictício', decargoId: '501', cnpj: documentA },
      { id: 202, name: 'Prestador fictício', decargoId: '502', cnpj: documentB },
      { id: 203, name: 'Sem documento fictício', decargoId: '503', cnpj: null },
    ],
    types: [{ id: 32, name: 'Diária extra fictícia' }, { id: 33, name: 'Outra diária extra fictícia' }],
  };
}

export function typeOnlyPreview(): ExportCorrectionPreview {
  const p = correctionPreview();
  p.rows[0] = { ...p.rows[0], providerId: 201, providerDecargoId: '501', typeId: 32, cnpj: null };
  p.providers[0].cnpj = null;
  return p;
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export type Traffic = { path: string; method: string; params: URLSearchParams; body: unknown };
type Handler = (request: Traffic) => unknown | Promise<unknown>;
type Handlers = Partial<Record<string, Handler>>;
const clients: QueryClient[] = [];
const guards: { violations: string[]; requests: Traffic[]; allowed: Set<string> }[] = [];

afterEach(() => {
  // Tear down observers before clearing clients; caught HTTP errors must still fail the test.
  cleanup();
  vi.useRealTimers();
  clients.splice(0).forEach(client => client.clear());
  setBaseUrl(null);
  setAuthTokenGetter(null);
  window.history.replaceState(null, '', '/');
  for (const guard of guards.splice(0)) {
    expect(guard.violations, 'Forbidden traffic, including errors caught by the UI').toEqual([]);
    expect(guard.requests.filter(r => r.method !== 'GET').every(r =>
      r.method === 'POST' && [PREVIEW, CORRECT].includes(r.path)),
    'Only preview and correction POSTs are allowed; no approval, export, release or person/account writes').toBe(true);
    expect(guard.requests.every(r => guard.allowed.has(`${r.method} ${r.path}`))).toBe(true);
  }
});

/** Real components, generated HTTP clients and cache; no credentials, API server or database. */
export function renderCorrectionUI(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  clients.push(client);
  const wrap = (child: ReactElement) => <QueryClientProvider client={client}>{child}</QueryClientProvider>;
  const ui = render(wrap(element));
  return { ...ui, rerender: (child: ReactElement) => ui.rerender(wrap(child)), client };
}

/** Exact method+path allowlist; never falls through to any real transport. */
export function mockCorrectionApi(handlers: Handlers = {}) {
  setBaseUrl(null);
  setAuthTokenGetter(null);
  const requests: Traffic[] = [];
  const violations: string[] = [];
  const routes: Handlers = {
    [`POST ${PREVIEW}`]: () => correctionPreview(),
    [`POST ${CORRECT}`]: request => {
      const input = request.body as ExportCorrectionConfirmation;
      return {
        correctedIds: input.corrections.filter(c => c.providerId !== c.expectedProviderId || c.typeId !== c.expectedTypeId).map(c => c.id),
        unchangedIds: input.corrections.filter(c => c.providerId === c.expectedProviderId && c.typeId === c.expectedTypeId).map(c => c.id),
      };
    },
    ...handlers,
  };
  const allowed = new Set(Object.keys(routes));
  guards.push({ requests, violations, allowed });
  function forbidden(message: string): never {
    violations.push(message);
    throw new Error(`Synthetic correction test blocked: ${message}`);
  }
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'https://synthetic.invalid');
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const body = init?.body ?? (input instanceof Request ? await input.clone().text() : null);
    const request: Traffic = {
      path: url.pathname, method, params: url.searchParams,
      body: body ? JSON.parse(String(body)) : null,
    };
    requests.push(request);
    if (url.origin !== 'https://synthetic.invalid') forbidden(`External origin ${url.origin}`);
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) forbidden(`${method} ${url.pathname}`);
    // Only the two correction POSTs can ever be simulated as writes.
    if (method !== 'GET' && (method !== 'POST' || ![PREVIEW, CORRECT].includes(url.pathname))) {
      forbidden(`Mutation ${method} ${url.pathname}`);
    }
    const response = await handler(request);
    return response instanceof Response ? response : json(response);
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => forbidden('XMLHttpRequest'));
  vi.stubGlobal('WebSocket', class { constructor() { forbidden('WebSocket'); } });
  if ('sendBeacon' in navigator) {
    vi.spyOn(navigator, 'sendBeacon').mockImplementation(() => forbidden('sendBeacon'));
  }
  return { requests, fetchMock, writes: () => requests.filter(r => r.path === CORRECT) };
}
