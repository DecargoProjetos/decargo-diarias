import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { admin, renderUI } from '@/test/peopleFixtures';
import Reports from './Reports';
import AnaliseDiarias from './AnaliseDiarias';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const record = {
  id: 101, providerId: 11, providerName: 'Prestador sintético', teamName: 'Equipe teste',
  status: 'disponivel_exportacao', value: 100, workDate: '2026-10-01',
  paymentDate: '2026-11-15', exportTarget: 'diaria_extra', createdAt: '2026-10-01T12:00:00Z',
};
const violations: string[] = [];
afterEach(() => {
  expect(violations.splice(0), 'No unexpected network or financial writes').toEqual([]);
});

function setup(Page: typeof Reports, capabilities: () => Response | Promise<Response>, role = 'admin', records = [record], paginated = false) {
  const capabilitiesRequest = vi.fn(capabilities);
  const exportRequest = vi.fn(() => json({ exported: 1, integrationRef: 'SYNTHETIC' }));
  const requests: { path: string; method: string; headers?: HeadersInit }[] = [];
  const reviewRequest = vi.fn(async (ids: number[]) => {
    const response = await capabilitiesRequest();
    if (!response.ok) return response;
    const { supportedTargets } = await response.json();
    return json({
      supportedTargets, reviewedCount: ids.length, missingIds: [],
      incompatibleRecords: records.filter(r => ids.includes(r.id)).flatMap(r => {
        const requiredTarget = r.exportTarget === 'falta' ? 'descontos' : 'diarias';
        return supportedTargets.includes(requiredTarget) ? [] : [{
          id: r.id, providerName: r.providerName, workDate: r.workDate, typeName: r.exportTarget === 'falta' ? 'Falta de teste' : 'Extra de teste',
          requiredTarget, reason: 'unsupported_target',
        }];
      }),
    });
  });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://synthetic.invalid');
    const method = init?.method ?? 'GET';
    requests.push({ path: url.pathname, method, headers: init?.headers });
    switch (`${method} ${url.pathname}`) {
      case 'GET /api/auth/me': return json({ ...admin, role });
      case 'GET /api/teams': return json([]);
      case 'GET /api/diarias/summary': return json({});
      case 'GET /api/diarias': return json({ data: paginated ? [records[Number(url.searchParams.get('page') ?? 1) - 1]] : records, total: records.length, page: 1, pageSize: 20, totalPages: paginated ? records.length : 1 });
      case 'GET /api/reports/diarias': return json({ data: records, totalRecords: records.length, totalValor: 100, byStatus: {}, byTeam: [] });
      case 'GET /api/diarias/export/capabilities': return capabilitiesRequest();
      case 'GET /api/diarias/export/attempts': return json([]);
      case 'POST /api/diarias/export/review': return reviewRequest(JSON.parse(String(init?.body)).diariaIds);
      case 'POST /api/diarias/export': return exportRequest();
      default:
        violations.push(`${method} ${url.pathname}`);
        throw new Error('Unexpected request; never forwarded to a real server');
    }
  }));
  renderUI(<Page />);
  return { capabilitiesRequest, exportRequest, requests, reviewRequest };
}

async function openConfirmation(Page: typeof Reports) {
  const user = userEvent.setup();
  if (Page === AnaliseDiarias) {
    await screen.findByText('Prestador sintético');
    await user.click(screen.getAllByRole('checkbox')[1]);
    await user.click(screen.getByRole('button', { name: 'Exportar selecionadas' }));
  } else {
    await user.click(await screen.findByRole('button', { name: 'Exportar Disponíveis para ERP' }));
  }
  return within(await screen.findByRole('dialog'));
}

describe.each([
  { name: 'Análise de Diárias', Page: AnaliseDiarias },
  { name: 'Relatórios', Page: Reports },
])('$name financial destinations using real generated hooks and mocked HTTP', ({ Page }) => {
  it('shows loading and cannot confirm or send while the query is pending', async () => {
    let resolve!: (response: Response) => void;
    const mock = setup(Page, () => new Promise<Response>(r => { resolve = r; }));
    await screen.findByText(/Consultando destinos financeiros/);
    const dialog = await openConfirmation(Page);
    expect(dialog.getByRole('button', { name: 'Confirmar exportação' })).toBeDisabled();
    expect(mock.exportRequest).not.toHaveBeenCalled();
    await act(async () => resolve(json({ supportedTargets: ['diarias', 'descontos'] })));
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Confirmar exportação' })).toBeEnabled());
    expect(mock.requests.every(r => new Headers(r.headers).get('x-api-key') === null)).toBe(true);
  });
  it('distinguishes failed access from lack of support and recovers on retry', async () => {
    const mock = setup(Page, () => json({ error: 'Falha sintética de acesso' }, 503));
    await screen.findByText(/Isso é uma falha de acesso/);
    expect(screen.queryByText(/Faltas → Descontos:/)).not.toBeInTheDocument();
    const dialog = await openConfirmation(Page);
    await dialog.findByText(/Isso não indica falta de suporte/);
    expect(dialog.getByRole('button', { name: 'Confirmar exportação' })).toBeDisabled();
    let resolve!: (response: Response) => void;
    mock.capabilitiesRequest.mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
    await userEvent.setup().click(dialog.getByRole('button', { name: 'Tentar novamente' }));
    expect(dialog.getByRole('button', { name: 'Confirmar exportação' })).toBeDisabled();
    await act(async () => resolve(json({ supportedTargets: ['diarias'] })));
    await dialog.findByText(/Faltas → Descontos: não suportado/);
    expect(mock.exportRequest).not.toHaveBeenCalled();
  });
  it.each([
    { targets: ['diarias'], faltaLabel: 'não suportado nesta integração' },
    { targets: ['diarias', 'descontos'], faltaLabel: 'disponível' },
  ])('announces capabilities before confirmation: $targets', async ({ targets, faltaLabel }) => {
    const mock = setup(Page, () => json({ supportedTargets: targets }));
    await screen.findByText(/Diárias extras → Diárias: disponível/);
    expect(screen.getByText(`Faltas → Descontos: ${faltaLabel}.`)).toBeInTheDocument();
    expect(mock.exportRequest).not.toHaveBeenCalled();
    const dialog = await openConfirmation(Page);
    await dialog.findByText(`Faltas → Descontos: ${faltaLabel}.`);
    expect(dialog.getByText(/servidor verificará novamente/)).toBeInTheDocument();
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Confirmar exportação' })).toBeEnabled());
    // The indication is not permission: the real POST may refuse new availability.
    mock.exportRequest.mockImplementation(() => json({ error: 'People indisponível após a consulta' }, 503));
    await userEvent.setup().click(dialog.getByRole('button', { name: 'Confirmar exportação' }));
    await waitFor(() => expect(mock.exportRequest).toHaveBeenCalledOnce());
    expect(mock.capabilitiesRequest.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mock.requests.filter(r => r.method === 'POST').map(r => r.path)).toEqual(['/api/diarias/export/review', '/api/diarias/export']);
  });
  it('shows unsupported destinations without presenting an access failure', async () => {
    const mock = setup(Page, () => json({ supportedTargets: [] }));
    await screen.findByText(/Diárias extras → Diárias: não suportado/);
    expect(screen.queryByText(/Isso é uma falha de acesso/)).not.toBeInTheDocument();
    const dialog = await openConfirmation(Page);
    await dialog.findByText(/Faltas → Descontos: não suportado/);
    expect(dialog.getByRole('button', { name: 'Confirmar exportação' })).toBeDisabled();
    expect(mock.exportRequest).not.toHaveBeenCalled();
  });
  it.each(['gestor', 'funcionario', 'prestador'])('does not query capabilities for %s', async role => {
    const mock = setup(Page, () => json({ supportedTargets: ['diarias'] }), role);
    await screen.findByText(Page === Reports ? /Acesso negado/ : /Acesso restrito/);
    expect(mock.capabilitiesRequest).not.toHaveBeenCalled();
    expect(mock.reviewRequest).not.toHaveBeenCalled();
  });
  it('names the unsupported records and preserves the complete selection on cancellation', async () => {
    const falta = { ...record, id: 222, providerName: 'Pessoa de outra página', exportTarget: 'falta' };
    const mock = setup(Page, () => json({ supportedTargets: ['diarias'] }), 'admin', [record, falta], Page === AnaliseDiarias);
    const user = userEvent.setup();
    if (Page === AnaliseDiarias) {
      await screen.findByText('Prestador sintético');
      await user.click(screen.getAllByRole('checkbox')[1]);
      await user.click(screen.getByRole('button', { name: 'Próxima' }));
      await screen.findByText('Pessoa de outra página');
      await user.click(screen.getAllByRole('checkbox')[1]);
      await user.click(screen.getByRole('button', { name: 'Exportar selecionadas' }));
    } else {
      await user.click(await screen.findByRole('button', { name: 'Exportar Disponíveis para ERP' }));
    }
    const dialog = within(await screen.findByRole('dialog'));
    await dialog.findByText(/#222 — Pessoa de outra página/);
    expect(dialog.getByText(/Tipo: Falta de teste/)).toHaveTextContent('Destino Descontos não suportado');
    expect(dialog.getByRole('button', { name: 'Confirmar exportação' })).toBeDisabled();
    expect(mock.reviewRequest).toHaveBeenCalledWith([101, 222]);
    expect(mock.exportRequest).not.toHaveBeenCalled();
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }));
    if (Page === AnaliseDiarias) {
      expect(screen.getByText('2 selecionada(s)')).toBeInTheDocument();
      expect(screen.getAllByRole('checkbox')[1]).toBeChecked();
    }
  });
  it('allows a supported falta-only batch even when diárias extras are unsupported', async () => {
    const falta = { ...record, exportTarget: 'falta' };
    const mock = setup(Page, () => json({ supportedTargets: ['descontos'] }), 'admin', [falta]);
    const dialog = await openConfirmation(Page);
    await dialog.findByText('Todos os tipos selecionados têm destinos suportados.');
    expect(dialog.getByRole('button', { name: 'Confirmar exportação' })).toBeEnabled();
    expect(mock.exportRequest).not.toHaveBeenCalled();
  });
  it('requires another review when the dialog is reopened instead of trusting the previous result', async () => {
    const mock = setup(Page, () => json({ supportedTargets: ['diarias'] }));
    let dialog = await openConfirmation(Page);
    await dialog.findByText('Todos os tipos selecionados têm destinos suportados.');
    await userEvent.setup().click(dialog.getByRole('button', { name: 'Cancelar' }));
    mock.capabilitiesRequest.mockImplementation(() => json({ supportedTargets: [] }));
    await userEvent.setup().click(screen.getByRole('button', {
      name: Page === AnaliseDiarias ? 'Exportar selecionadas' : 'Exportar Disponíveis para ERP',
    }));
    dialog = within(await screen.findByRole('dialog'));
    await dialog.findByText(/#101 — Prestador sintético/);
    expect(dialog.getByRole('button', { name: 'Confirmar exportação' })).toBeDisabled();
    expect(mock.reviewRequest).toHaveBeenCalledTimes(2);
    expect(mock.exportRequest).not.toHaveBeenCalled();
  });
});
