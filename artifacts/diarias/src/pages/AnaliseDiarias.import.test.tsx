import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { navigate } from 'wouter/use-browser-location';
import { afterEach, expect, it, vi } from 'vitest';
import AnaliseDiarias from './AnaliseDiarias';
import { importAnalysisUrl } from '@/lib/importAnalysis';

const clients: QueryClient[] = [];
afterEach(() => {
  clients.forEach(client => client.clear());
  clients.length = 0;
  window.history.replaceState(null, '', '/');
});

function setup(url: string) {
  window.history.replaceState(null, '', url);
  const requests: { path: string; params: URLSearchParams }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'https://synthetic.invalid');
    if ((init?.method ?? 'GET') !== 'GET') throw new Error('Writes prohibited in this test.');
    requests.push({ path: url.pathname, params: url.searchParams });
    const body = url.pathname === '/api/auth/me' ? { id: 1, name: 'Admin fictício', role: 'admin' }
      : url.pathname === '/api/teams' ? []
        : url.pathname === '/api/diarias/export/capabilities' ? { supportedTargets: ['diarias'] }
        : url.pathname === '/api/diarias/export/attempts' ? []
        : url.pathname === '/api/diarias/summary' ? {}
          : url.pathname === '/api/diarias' ? { data: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }
            : undefined;
    if (body === undefined) throw new Error(`Unexpected synthetic request ${url.pathname}`);
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><AnaliseDiarias /></QueryClientProvider>);
  return requests;
}

it('opens the spreadsheet period without excluding pending records from list or summary', async () => {
  const requests = setup(importAnalysisUrl([{ workDate: '2026-09-30' }, { workDate: '2026-09-01' }]));
  await waitFor(() => expect(requests.some(request => request.path === '/api/diarias')).toBe(true));
  for (const path of ['/api/diarias', '/api/diarias/summary']) {
    const params = requests.find(request => request.path === path)!.params;
    expect(params.get('startDate')).toBe('2026-09-01');
    expect(params.get('endDate')).toBe('2026-09-30');
    expect(params.has('status')).toBe(false);
  }
  const dates = document.querySelectorAll('input[type="date"]');
  expect(dates[0]).toHaveValue('2026-09-01');
  expect(dates[1]).toHaveValue('2026-09-30');
});

it('clears a previous P/Exportar selection on navigation from another import', async () => {
  const requests = setup('/analise-diarias');
  const status = screen.getAllByRole('combobox').find(select =>
    select.querySelector('option[value="disponivel_exportacao"]'))!;
  await userEvent.setup().selectOptions(status, 'disponivel_exportacao');
  await waitFor(() => expect(requests.some(request =>
    request.params.get('status') === 'disponivel_exportacao')).toBe(true));
  act(() => navigate(importAnalysisUrl([{ workDate: '2026-10-02' }, { workDate: '2026-10-09' }])));
  await waitFor(() => {
    expect(status).toHaveValue('');
    for (const path of ['/api/diarias', '/api/diarias/summary']) {
      const params = requests.filter(request => request.path === path).at(-1)!.params;
      expect(params.get('startDate')).toBe('2026-10-02');
      expect(params.get('endDate')).toBe('2026-10-09');
      expect(params.has('status')).toBe(false);
    }
  });
});
