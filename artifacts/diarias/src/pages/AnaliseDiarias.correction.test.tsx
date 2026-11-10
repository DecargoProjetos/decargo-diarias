import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { Diaria, ExportCorrectionPreview, ExportCorrectionConfirmation } from '@workspace/api-client-react';
import AnaliseDiarias from './AnaliseDiarias';
import Reports from './Reports';
import Dashboard from './Dashboard';
import {
  CORRECT, PREVIEW, correctionPreview, documentB, json,
  mockCorrectionApi, reason, renderCorrectionUI, type Traffic,
} from '@/test/exportCorrectionFixtures';

function diaria(id: number, providerName = 'Prestador fictício'): Diaria {
  return {
    id, providerId: 101, providerName, teamId: 41, teamName: 'Equipe fictícia',
    status: 'disponivel_exportacao', value: 150, workDate: '2026-10-02',
    paymentDate: '2026-10-09', createdAt: '2026-10-01T12:00:00Z',
    createdByName: 'Autor fictício', approvedByName: 'Conferente fictício',
  };
}

// Real Reports and Dashboard pages exercise their custom keys and generated endpoints.
// Remaining mounted observers prove refetches and preserve unrelated provider cache.
const relatedPaths = ['/api/reports/diarias', '/api/dashboard/summary', '/api/dashboard/recent-activity', '/api/audit'];
function OtherLists() {
  return <>{['/api/audit', '/api/providers'].map(path => <ListObserver key={path} path={path} />)}</>;
}
function ListObserver({ path }: { path: string }) {
  const { data } = useQuery({
    queryKey: [path], queryFn: async () => (await fetch(path)).json() as Promise<{ version: string }>,
  });
  return <output data-testid={`cache-${path}`}>{data?.version}</output>;
}

function setup({ conflict = false, invalidReceipt = false } = {}) {
  window.history.replaceState(null, '', '/analise-diarias');
  let corrected = false;
  const observedReads = Object.fromEntries(['/api/audit', '/api/providers'].map(path => [
    `GET ${path}`, () => ({ version: corrected ? 'after-correction' : 'before-correction' }),
  ]));
  const api = mockCorrectionApi({
    ...observedReads,
    'GET /api/auth/me': () => ({ id: 900, role: 'admin', name: 'Admin fictício', email: 'admin@example.invalid' }),
    'GET /api/teams': () => [{ id: 41, name: 'Equipe fictícia' }],
    'GET /api/diarias/export/capabilities': () => ({ supportedTargets: ['diarias'] }),
    'GET /api/diarias/export/attempts': () => [],
    'GET /api/reports/diarias': () => ({
      data: [{ ...diaria(71), status: corrected ? 'pendente_aprovacao' : 'disponivel_exportacao' }],
      totalRecords: 1, totalValor: 150, byTeam: [],
      byStatus: corrected ? { pendente_aprovacao: 1 } : { disponivel_exportacao: 1 },
    }),
    'GET /api/dashboard/summary': () => ({
      pendentes: corrected ? 1 : 0, emAnalise: 0, aprovadas: 0, rejeitadas: 0,
      disponivelExportacao: corrected ? 0 : 1, exportadas: 0, pagas: 0, canceladas: 0,
      totalValorAprovadas: 0, totalValorExportadas: 0, totalValorPagas: 0,
    }),
    'GET /api/dashboard/recent-activity': () => [{
      id: 901, diariaId: 71, action: corrected ? 'Correção fictícia concluída' : 'Atividade fictícia anterior',
      status: corrected ? 'pendente_aprovacao' : 'disponivel_exportacao',
      timestamp: '2026-10-03T12:00:00Z', userId: 900, userName: 'Admin fictício',
      userNameAtAction: 'Admin fictício',
    }],
    'GET /api/diarias/summary': () => ({
      pendentesCount: corrected ? 1 : 0, pendentesValue: corrected ? 150 : 0,
      aprovadasCount: corrected ? 0 : 40, aprovadasValue: corrected ? 0 : 6000,
      reprovadasCount: 0, reprovadasValue: 0, exportadasCount: 0, exportadasValue: 0,
    }),
    'GET /api/diarias': request => {
      const page = Number(request.params.get('page'));
      return {
        data: corrected
          ? [{ ...diaria(71), providerId: 202, providerName: 'Vínculo corrigido fictício',
            status: 'pendente_aprovacao', approvedByName: null }]
          : [diaria(page === 2 ? 71 : 70), diaria(74, 'Não selecionado fictício')],
        page, pageSize: 20, total: corrected ? 1 : 40, totalPages: corrected ? 1 : 2,
      };
    },
    [`POST ${PREVIEW}`]: request => {
      const ids = (request.body as { diariaIds: number[] }).diariaIds;
      const p = correctionPreview();
      p.rows = ids.map(id => ({ ...p.rows[0], id }));
      return p satisfies ExportCorrectionPreview;
    },
    [`POST ${CORRECT}`]: request => {
      if (conflict) return json({ error: 'Conflito sintético: diária foi alterada.' }, 409);
      if (invalidReceipt) return { correctedIds: [], unchangedIds: [] };
      corrected = true;
      return { correctedIds: (request.body as ExportCorrectionConfirmation).corrections.map(c => c.id), unchangedIds: [] };
    },
  });
  const ui = renderCorrectionUI(<>
    <div data-testid="analysis"><AnaliseDiarias /></div>
    <div data-testid="reports"><Reports /></div>
    <div data-testid="dashboard"><Dashboard /></div>
    <OtherLists />
  </>);
  return { ...api, ...ui };
}

function listRequests(requests: Traffic[], path: string) {
  return requests.filter(r => r.path === path && r.method === 'GET');
}

async function selectAndCorrect() {
  const row = screen.getByRole('link', { name: 'Prestador fictício' }).closest('tr')!;
  await userEvent.click(within(row).getByRole('checkbox'));
  expect(screen.getByText('1 selecionada(s)')).toBeVisible();
  await userEvent.click(screen.getByTestId('button-open-export-correction'));
  await screen.findByTestId('select-correction-type');
  await userEvent.selectOptions(screen.getByTestId('select-correction-type'), '32');
  await userEvent.selectOptions(screen.getByTestId('select-correction-provider-101'), '202');
  await userEvent.type(screen.getByTestId('input-correction-cnpj-101'), documentB);
  await userEvent.type(screen.getByTestId('input-correction-reason'), reason);
  await userEvent.click(screen.getByTestId('checkbox-correction-confirm'));
  await userEvent.click(screen.getByTestId('button-save-correction'));
}

describe('analysis correction integration with all endpoints intercepted', () => {
  it('corrects only the checked ID, clears selection/name, resets page/status and refreshes all affected lists', async () => {
    const api = setup();
    await screen.findByRole('link', { name: 'Prestador fictício' });
    expect(await within(screen.getByTestId('reports')).findByText('P/ Exportar', { selector: 'span' })).toBeVisible();
    expect(await within(screen.getByTestId('dashboard')).findByText(/Atividade fictícia anterior/)).toBeVisible();
    await waitFor(() => expect(screen.getByTestId('cache-/api/audit')).toHaveTextContent('before-correction'));
    const name = screen.getByPlaceholderText('Buscar por nome...');
    const status = screen.getAllByRole('combobox').find(select => select.querySelector('option[value="disponivel_exportacao"]'))!;
    const team = screen.getAllByRole('combobox').find(select => select.querySelector('option[value="41"]'))!;
    await userEvent.type(name, 'fictício');
    await userEvent.selectOptions(status, 'disponivel_exportacao');
    await userEvent.selectOptions(team, '41');
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByText('Página 2 de 2');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Prestador fictício' })).toHaveAttribute('href', '/diarias/71'));
    const baseline = Object.fromEntries(
      ['/api/diarias', '/api/diarias/summary', ...relatedPaths, '/api/providers'].map(path => [path, listRequests(api.requests, path).length]),
    );
    await selectAndCorrect();
    await screen.findByRole('link', { name: 'Vínculo corrigido fictício' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('1 selecionada(s)')).not.toBeInTheDocument();
    expect(screen.queryByTestId('button-open-export-correction')).not.toBeInTheDocument();
    expect(name).toHaveValue('');
    expect(status).toHaveValue('pendente_aprovacao');
    expect(team).toHaveValue('41'); // Unrelated filters remain intact.
    expect(screen.getByText('Página 1 de 1')).toBeVisible();
    const analysis = within(screen.getByTestId('analysis'));
    expect(analysis.getByText('Pendentes').nextElementSibling).toHaveTextContent(/^1$/);
    expect(analysis.getByText('Aprovadas (a exportar)').nextElementSibling).toHaveTextContent(/^0$/);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
    for (const path of ['/api/diarias', '/api/diarias/summary']) {
      const reads = listRequests(api.requests, path);
      expect(reads.length).toBeGreaterThan(baseline[path]);
      const params = reads.at(-1)!.params;
      expect(params.has('name')).toBe(false);
      expect(params.get('status')).toBe('pendente_aprovacao');
      expect(params.get('teamId')).toBe('41');
      if (path === '/api/diarias') expect(params.get('page')).toBe('1');
    }
    await waitFor(() => {
      for (const path of relatedPaths) {
        expect(listRequests(api.requests, path)).toHaveLength(baseline[path] + 1);
      }
    });
    expect(screen.getByTestId('cache-/api/audit')).toHaveTextContent('after-correction');
    const reports = within(screen.getByTestId('reports'));
    expect(reports.queryByText('P/ Exportar', { selector: 'span' })).not.toBeInTheDocument();
    expect(reports.getByText('Pendente', { selector: 'span' })).toBeVisible();
    const dashboard = within(screen.getByTestId('dashboard'));
    expect(dashboard.getByText(/Correção fictícia concluída/)).toBeVisible();
    expect(dashboard.queryByText(/Atividade fictícia anterior/)).not.toBeInTheDocument();
    expect(dashboard.getByText('Pendentes').parentElement?.nextElementSibling).toHaveTextContent('1');
    expect(listRequests(api.requests, '/api/providers')).toHaveLength(baseline['/api/providers']);
    expect(screen.getByTestId('cache-/api/providers')).toHaveTextContent('before-correction');
    const correctedRow = screen.getByRole('link', { name: 'Vínculo corrigido fictício' }).closest('tr')!;
    expect(correctedRow).toHaveTextContent('Pendente');
    expect(correctedRow).not.toHaveTextContent('Conferente fictício');
    expect(api.requests.filter(r => r.method !== 'GET').map(r => `${r.method} ${r.path}`))
      .toEqual([`POST ${PREVIEW}`, `POST ${CORRECT}`]);
    expect(api.requests.find(r => r.path === PREVIEW)!.body).toEqual({ diariaIds: [71] });
    expect(api.writes()[0].body).toMatchObject({
      corrections: [{ id: 71, expectedProviderId: 101, providerId: 202, expectedPeopleId: '502', typeId: 32 }],
    });
  });

  it.each([
    ['409 conflict', { conflict: true }, 'Conflito sintético'],
    ['incomplete receipt', { invalidReceipt: true }, 'Não foi possível confirmar o resultado'],
  ])('retains selection and filters without refetch or retry after %s', async (_name, options, message) => {
    const api = setup(options);
    await screen.findByRole('link', { name: 'Prestador fictício' });
    await within(screen.getByTestId('reports')).findByText('P/ Exportar', { selector: 'span' });
    await within(screen.getByTestId('dashboard')).findByText(/Atividade fictícia anterior/);
    const name = screen.getByPlaceholderText('Buscar por nome...');
    await userEvent.type(name, 'fictício');
    const baseline = listRequests(api.requests, '/api/diarias').length;
    const otherBaseline = Object.fromEntries(relatedPaths.map(path => [path, listRequests(api.requests, path).length]));
    await selectAndCorrect();
    expect(await screen.findByTestId('text-correction-error')).toHaveTextContent(message);
    expect(screen.getByTestId('button-save-correction')).toBeDisabled();
    await userEvent.click(screen.getByTestId('button-save-correction'));
    await userEvent.click(screen.getByTestId('button-cancel-correction'));
    expect(screen.getByText('1 selecionada(s)')).toBeVisible();
    expect(name).toHaveValue('fictício');
    expect(listRequests(api.requests, '/api/diarias')).toHaveLength(baseline);
    for (const path of relatedPaths) expect(listRequests(api.requests, path)).toHaveLength(otherBaseline[path]);
    expect(within(screen.getByTestId('reports')).getByText('P/ Exportar', { selector: 'span' })).toBeVisible();
    expect(within(screen.getByTestId('dashboard')).queryByText(/Correção fictícia concluída/)).not.toBeInTheDocument();
    expect(api.writes()).toHaveLength(1);
    expect(api.requests.filter(r => r.method !== 'GET').map(r => `${r.method} ${r.path}`))
      .toEqual([`POST ${PREVIEW}`, `POST ${CORRECT}`]);
  });
});
