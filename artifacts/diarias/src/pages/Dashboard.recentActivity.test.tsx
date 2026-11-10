import { act, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActivityItem, DashboardSummary } from '@workspace/api-client-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
import { admin, renderUI } from '@/test/peopleFixtures';

const summary: DashboardSummary = {
  pendentes: 0, emAnalise: 0, aprovadas: 0, rejeitadas: 0,
  disponivelExportacao: 0, exportadas: 0, pagas: 0, canceladas: 0,
};

function activityItem(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: 501, diariaId: 701, providerName: 'Beneficiário fictício',
    teamName: 'Equipe fictícia', action: 'aprovada',
    userId: 801, userName: 'Responsável atual fictício',
    userNameAtAction: 'Responsável histórico fictício',
    timestamp: '2026-01-02T12:34:00Z', status: 'aprovada',
    ...overrides,
  };
}

const unexpectedRequests: string[] = [];
afterEach(() => {
  expect(unexpectedRequests.splice(0), 'Only synthetic dashboard GET responses are allowed').toEqual([]);
});

/** Exercise the real generated hooks; never forward requests to an API or database. */
function mockDashboardApi(activity: ActivityItem[] | (() => Response | Promise<Response>)) {
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'https://synthetic.example.invalid');
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const key = `${method} ${url.pathname}`;
    requests.push(key);
    const responses: Record<string, unknown> = {
      'GET /api/auth/me': admin,
      'GET /api/dashboard/summary': summary,
      'GET /api/dashboard/recent-activity': activity,
    };
    if (!Object.hasOwn(responses, key)) {
      unexpectedRequests.push(key);
      throw new Error(`No synthetic response for ${key}`);
    }
    if (key === 'GET /api/dashboard/recent-activity' && typeof activity === 'function') {
      return activity();
    }
    return new Response(JSON.stringify(responses[key]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
  return requests;
}

async function activityRow(item: ActivityItem) {
  const title = await screen.findByText(`Diária #${item.diariaId} - ${item.action}`);
  return within(title.parentElement!);
}

describe('Dashboard recent activity historical responsibility', () => {
  it.each(['HTTP 500', 'blocked network'])('shows %s as a failure and recovers on retry', async (failure) => {
    const user = userEvent.setup();
    const item = activityItem();
    let recovered = false;
    let finishRetry!: (response: Response) => void;
    const requests = mockDashboardApi(() => {
      if (recovered) return new Promise<Response>((resolve) => { finishRetry = resolve; });
      if (failure === 'blocked network') throw new TypeError('Failed to fetch');
      return new Response('Synthetic server failure', { status: 500 });
    });
    renderUI(<Dashboard />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a atividade recente');
    expect(screen.queryByText('Nenhuma atividade recente.')).not.toBeInTheDocument();
    expect(screen.getByText('Pendentes')).toBeInTheDocument();
    expect(screen.queryByText(/^Nome na época:/)).not.toBeInTheDocument();

    recovered = true;
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tentando novamente...' })).toBeDisabled());
    finishRetry(new Response(JSON.stringify([item]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));

    const row = await activityRow(item);
    expect(row.getByText(/^Nome na época:/)).toHaveTextContent('Responsável histórico fictício');
    expect(row.getByText(/^Nome na época:/)).not.toHaveTextContent(item.userName!);
    expect(row.getByText(/^Nome atual:/)).toHaveTextContent('Responsável atual fictício — usuário #801');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma atividade recente.')).not.toBeInTheDocument();
    expect(requests.filter((key) => key === 'GET /api/dashboard/recent-activity')).toHaveLength(2);
  });

  it.each(['HTTP 500', 'blocked network'])('handles %s during a cached background refresh and recovers manually', async (failure) => {
    const user = userEvent.setup();
    const initial = activityItem();
    const updated = activityItem({ userName: 'Responsável atual renomeado fictício' });
    const added = activityItem({
      id: 502, diariaId: 702, userId: 802,
      userName: 'Outro responsável atual fictício',
      userNameAtAction: 'Outro responsável histórico fictício',
    });
    let phase: 'initial' | 'failure' | 'recovery' = 'initial';
    let finishRetry!: (response: Response) => void;
    const requests = mockDashboardApi(() => {
      if (phase === 'initial') return new Response(JSON.stringify([initial]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
      if (phase === 'recovery') return new Promise<Response>((resolve) => { finishRetry = resolve; });
      if (failure === 'blocked network') throw new TypeError('Failed to fetch');
      return new Response('Synthetic server failure', { status: 500 });
    });
    const { client } = renderUI(<Dashboard />);
    const initialRow = await activityRow(initial);
    expect(initialRow.getByText(/^Nome na época:/)).toHaveTextContent(initial.userNameAtAction!);
    expect(initialRow.getByText(/^Nome atual:/)).toHaveTextContent(initial.userName!);
    expect(client.getQueryData(['getRecentActivity'])).toEqual([initial]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    phase = 'failure';
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['getRecentActivity'], exact: true });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a atividade recente');
    // Prove this is a refetch error with populated cache, not an initial failure.
    expect(client.getQueryState(['getRecentActivity'])).toMatchObject({
      status: 'error', fetchStatus: 'idle', data: [initial],
    });
    expect(screen.queryByText('Nenhuma atividade recente.')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Nome na época:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Nome atual:/)).not.toBeInTheDocument();
    expect(screen.getByText('Pendentes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();

    phase = 'recovery';
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tentando novamente...' })).toBeDisabled());
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar a atividade recente');
    expect(screen.queryByText('Nenhuma atividade recente.')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Nome na época:/)).not.toBeInTheDocument();
    expect(client.getQueryData(['getRecentActivity'])).toEqual([initial]);
    await act(async () => {
      finishRetry(new Response(JSON.stringify([updated, added]), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    });

    for (const item of [updated, added]) {
      const row = await activityRow(item);
      const historicalLine = row.getByText(/^Nome na época:/);
      const currentLine = row.getByText(/^Nome atual:/);
      expect(historicalLine).toHaveTextContent(`Nome na época: ${item.userNameAtAction} em `);
      expect(historicalLine).not.toHaveTextContent(item.userName!);
      expect(currentLine.textContent).toBe(`Nome atual: ${item.userName} — usuário #${item.userId}`);
      expect(currentLine).not.toHaveTextContent(item.userNameAtAction!);
    }
    expect(screen.getAllByText(/^Nome na época:/)).toHaveLength(2);
    expect(screen.queryByText(`Nome atual: ${initial.userName} — usuário #${initial.userId}`)).not.toBeInTheDocument();
    expect(client.getQueryData(['getRecentActivity'])).toEqual([updated, added]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tentar novamente|Tentando novamente/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma atividade recente.')).not.toBeInTheDocument();
    expect(requests.filter((key) => key === 'GET /api/dashboard/recent-activity')).toHaveLength(3);
    expect(requests.filter((key) => key === 'GET /api/auth/me')).toHaveLength(1);
    expect(requests.filter((key) => key === 'GET /api/dashboard/summary')).toHaveLength(1);
  });

  it('shows the empty state only after a successful empty response', async () => {
    mockDashboardApi([]);
    renderUI(<Dashboard />);
    expect(await screen.findByText('Nenhuma atividade recente.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it('keeps the failure explicit when retry fails, then accepts an empty recovery', async () => {
    const user = userEvent.setup();
    let recovered = false;
    const requests = mockDashboardApi(() => new Response(JSON.stringify(recovered ? [] : { error: 'failure' }), {
      status: recovered ? 200 : 503, headers: { 'Content-Type': 'application/json' },
    }));
    renderUI(<Dashboard />);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => {
      expect(requests.filter((key) => key === 'GET /api/dashboard/recent-activity')).toHaveLength(2);
      expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma atividade recente.')).not.toBeInTheDocument();
    recovered = true;
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Nenhuma atividade recente.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    {
      label: 'distinct historical and current names',
      overrides: {},
      historical: 'Responsável histórico fictício',
      current: 'Nome atual: Responsável atual fictício — usuário #801',
    },
    {
      label: 'a deleted responsible user with a preserved historical name',
      overrides: { userId: null, userName: null },
      historical: 'Responsável histórico fictício',
      current: 'Nome atual: Nome atual não disponível',
    },
    {
      label: 'a null historical name with a current user still present',
      overrides: { userNameAtAction: null },
      historical: 'Nome histórico não registrado',
      current: 'Nome atual: Responsável atual fictício — usuário #801',
    },
    {
      label: 'a deleted responsible user without a historical name',
      overrides: { userId: null, userName: null, userNameAtAction: null },
      historical: 'Nome histórico não registrado',
      current: 'Nome atual: Nome atual não disponível',
    },
    {
      label: 'an omitted optional historical name',
      overrides: { userNameAtAction: undefined },
      historical: 'Nome histórico não registrado',
      current: 'Nome atual: Responsável atual fictício — usuário #801',
    },
  ])('keeps the attribution explicit for $label', async ({ overrides, historical, current }) => {
    const item = activityItem(overrides);
    const requests = mockDashboardApi([item]);
    renderUI(<Dashboard />);

    const row = await activityRow(item);
    const historicalLine = row.getByText(/^Nome na época:/);
    expect(historicalLine).toHaveTextContent(`Nome na época: ${historical} em `);
    expect(historicalLine).not.toHaveTextContent(item.providerName);
    expect(historicalLine).not.toHaveTextContent(admin.name);
    if (item.userName) expect(historicalLine).not.toHaveTextContent(item.userName);
    expect(row.getByText(/^Nome atual:/).textContent).toBe(current);
    expect(row.queryByText(item.providerName, { exact: false })).not.toBeInTheDocument();
    expect(requests).toEqual([
      'GET /api/auth/me',
      'GET /api/dashboard/summary',
      'GET /api/dashboard/recent-activity',
    ]);
  });

  it('keeps each action attached to its own historical name in a mixed response', async () => {
    const first = activityItem();
    const deleted = activityItem({
      id: 502, diariaId: 702, userId: null, userName: null,
      userNameAtAction: 'Outro responsável histórico fictício',
      providerName: 'Outro beneficiário fictício',
    });
    const missing = activityItem({ id: 503, diariaId: 703, userNameAtAction: null });
    mockDashboardApi([first, deleted, missing]);
    renderUI(<Dashboard />);

    for (const item of [first, deleted, missing]) {
      const row = await activityRow(item);
      const historicalLine = row.getByText(/^Nome na época:/);
      expect(historicalLine).toHaveTextContent(
        `Nome na época: ${item.userNameAtAction ?? 'Nome histórico não registrado'} em `,
      );
      expect(historicalLine).not.toHaveTextContent(item.providerName);
      if (item.userName) expect(historicalLine).not.toHaveTextContent(item.userName);
    }
    expect(screen.getAllByText(/^Nome na época:/)).toHaveLength(3);
    expect(screen.getAllByText(/Nome histórico não registrado/)).toHaveLength(1);
  });
});
