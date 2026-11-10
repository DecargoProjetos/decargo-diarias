import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DashboardSummary } from '@workspace/api-client-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
import { admin, renderUI } from '@/test/peopleFixtures';

const zeros: DashboardSummary = {
  pendentes: 0, emAnalise: 0, aprovadas: 0, rejeitadas: 0,
  disponivelExportacao: 0, exportadas: 0, pagas: 0, canceladas: 0,
  totalValorAprovadas: 0, totalValorExportadas: 0, totalValorPagas: 0,
};
const populated: DashboardSummary = {
  ...zeros, pendentes: 11, aprovadas: 12, exportadas: 13, pagas: 14,
  rejeitadas: 15, disponivelExportacao: 16,
  totalValorAprovadas: 120, totalValorExportadas: 130, totalValorPagas: 140,
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
const failed = () => json({ message: 'Falha sintética' }, 503);
const unexpectedRequests: string[] = [];
afterEach(() => {
  expect(unexpectedRequests.splice(0), 'No real network or mutations allowed').toEqual([]);
});

/** Real hooks and QueryClient, synthetic HTTP only, with no passthrough. */
function mockApi(summaryResponse: () => Response | Promise<Response>) {
  const summaryRequests = vi.fn(summaryResponse);
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'https://synthetic.example.invalid');
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const key = `${method} ${url.pathname}`;
    requests.push(key);
    switch (key) {
      case 'GET /api/auth/me': return json(admin);
      case 'GET /api/dashboard/summary': return summaryRequests();
      case 'GET /api/dashboard/recent-activity': return json([]);
      default:
        unexpectedRequests.push(key);
        throw new Error(`No synthetic response for ${key}`);
    }
  }));
  return { summaryRequests, requests };
}

function expectNoIndicators() {
  const region = within(screen.getByRole('region', { name: 'Indicadores de diárias' }));
  for (const title of ['Pendentes', 'Aprovadas', 'Exportadas', 'Pagas']) {
    expect(region.queryByText(title)).not.toBeInTheDocument();
  }
  expect(region.queryByText('0')).not.toBeInTheDocument();
  expect(region.queryByText(/R\$/)).not.toBeInTheDocument();
  expect(screen.queryByText('Atenção Necessária')).not.toBeInTheDocument();
  expect(screen.queryByText(/Diárias Rejeitadas/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Disponíveis p\/ Exportação/)).not.toBeInTheDocument();
}

describe('Dashboard summary availability', () => {
  const invalidResponses = [
    { label: 'JSON null', response: () => json(null) },
    { label: 'HTTP 204', response: () => new Response(null, { status: 204 }) },
    { label: 'empty HTTP 200', response: () => new Response('', { status: 200 }) },
    { label: 'empty object', response: () => json({}) },
    { label: 'array instead of object', response: () => json([]) },
    { label: 'string count', response: () => json({ ...zeros, pendentes: '0' }) },
    { label: 'null count', response: () => json({ ...zeros, pendentes: null }) },
    { label: 'fractional count', response: () => json({ ...zeros, pendentes: 0.5 }) },
    { label: 'negative count', response: () => json({ ...zeros, pendentes: -1 }) },
    { label: 'string financial total', response: () => json({ ...zeros, totalValorPagas: '0' }) },
    ...['pendentes', 'emAnalise', 'aprovadas', 'rejeitadas', 'disponivelExportacao',
      'exportadas', 'pagas', 'canceladas'].map(field => ({
      label: `missing ${field}`,
      response: () => {
        const incomplete: Record<string, unknown> = { ...zeros };
        delete incomplete[field];
        return json(incomplete);
      },
    })),
  ];

  it.each(invalidResponses)('warns and recovers from $label without rendering partial indicators', async ({ response }) => {
    const { summaryRequests, requests } = mockApi(response);
    renderUI(<Dashboard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os indicadores.');
    expect(screen.queryByText('Carregando indicadores...')).not.toBeInTheDocument();
    expectNoIndicators();
    expect(screen.getByText('Nenhuma atividade recente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();

    summaryRequests.mockImplementation(() => json(zeros));
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByText('Pendentes');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Indicadores de diárias' })).getAllByText('0')).toHaveLength(4);
    expect(summaryRequests).toHaveBeenCalledTimes(2);
    expect(requests.filter(key => key === 'GET /api/dashboard/recent-activity')).toHaveLength(1);
  });

  it.each(['omitted', 'null'] as const)('accepts %s optional financial totals', async mode => {
    const { totalValorAprovadas, totalValorExportadas, totalValorPagas, ...counts } = zeros;
    mockApi(() => json(mode === 'omitted' ? counts : {
      ...counts, totalValorAprovadas: null, totalValorExportadas: null, totalValorPagas: null,
    }));
    renderUI(<Dashboard />);
    await screen.findByText('Pendentes');
    expect(within(screen.getByRole('region', { name: 'Indicadores de diárias' })).getAllByText('0')).toHaveLength(4);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides cached indicators when a refresh returns an incomplete successful response', async () => {
    const { summaryRequests } = mockApi(() => json(populated));
    const { client } = renderUI(<Dashboard />);
    await screen.findByText('Pendentes');
    summaryRequests.mockImplementation(() => json({ pendentes: 0 }));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['getDashboardSummary'] });
    });
    await screen.findByRole('alert');
    expectNoIndicators();
    expect(screen.getByText('Nenhuma atividade recente.')).toBeInTheDocument();
  });

  it('shows a query failure, not zeros, while recent activity stays independent', async () => {
    const { requests, summaryRequests } = mockApi(failed);
    renderUI(<Dashboard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os indicadores.');
    expect(screen.getByText(/Isso não significa que não há diárias/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();
    expectNoIndicators();
    expect(screen.getByText('Nenhuma atividade recente.')).toBeInTheDocument();
    expect(summaryRequests).toHaveBeenCalledTimes(1);
    expect(requests).toEqual([
      'GET /api/auth/me', 'GET /api/dashboard/summary', 'GET /api/dashboard/recent-activity',
    ]);
  });

  it('retries only the summary and restores counts and financial totals after recovery', async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>(done => { resolve = done; });
    const { summaryRequests, requests } = mockApi(failed);
    summaryRequests.mockImplementationOnce(failed).mockImplementationOnce(() => pending);
    renderUI(<Dashboard />);
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(summaryRequests).toHaveBeenCalledTimes(2));
    expectNoIndicators();
    const retry = screen.queryByRole('button', { name: /Tentando novamente|Tentar novamente/ });
    if (retry) expect(retry).toBeDisabled();
    else expect(screen.getByRole('status')).toHaveTextContent('Carregando indicadores...');
    expect(screen.getByText('Nenhuma atividade recente.')).toBeInTheDocument();

    await act(async () => { resolve(json(populated)); });
    await screen.findByText('Pendentes');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
    const region = within(screen.getByRole('region', { name: 'Indicadores de diárias' }));
    for (const count of [11, 12, 13, 14]) expect(region.getByText(String(count))).toBeInTheDocument();
    for (const total of [120, 130, 140]) {
      expect(region.getByText(new RegExp(`R\\$\\s*${total},00`))).toBeInTheDocument();
    }
    expect(screen.getByText('15 Diárias Rejeitadas')).toBeInTheDocument();
    expect(screen.getByText('16 Disponíveis p/ Exportação')).toBeInTheDocument();
    expect(requests.filter(key => key === 'GET /api/auth/me')).toHaveLength(1);
    expect(requests.filter(key => key === 'GET /api/dashboard/recent-activity')).toHaveLength(1);
  });

  it('keeps a repeated failure explicit and allows another attempt', async () => {
    const { summaryRequests } = mockApi(failed);
    renderUI(<Dashboard />);
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(summaryRequests).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os indicadores.');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();
    expectNoIndicators();
  });

  it('renders a successful zero response as real zero indicators', async () => {
    mockApi(() => json(zeros));
    renderUI(<Dashboard />);
    await screen.findByText('Pendentes');
    const region = within(screen.getByRole('region', { name: 'Indicadores de diárias' }));
    expect(region.getAllByText('0')).toHaveLength(4);
    expect(region.getAllByText(/R\$\s*0,00/)).toHaveLength(3);
    expect(screen.getByText('0 Diárias Rejeitadas')).toBeInTheDocument();
    expect(screen.getByText('0 Disponíveis p/ Exportação')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it('hides cached indicators if a background refresh fails', async () => {
    const { summaryRequests } = mockApi(() => json(populated));
    const { client } = renderUI(<Dashboard />);
    await screen.findByText('Pendentes');
    summaryRequests.mockImplementation(failed);
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['getDashboardSummary'] });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os indicadores.');
    expectNoIndicators();
  });

  it('does not display zero indicators while the initial response is still pending', async () => {
    let resolve!: (response: Response) => void;
    mockApi(() => new Promise<Response>(done => { resolve = done; }));
    renderUI(<Dashboard />);
    expect(await screen.findByRole('status')).toHaveTextContent('Carregando indicadores...');
    expectNoIndicators();
    await act(async () => { resolve(json(zeros)); });
    await screen.findByText('Pendentes');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
