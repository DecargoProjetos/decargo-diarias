import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImportarPlanilhaDialog from './ImportarPlanilhaDialog';
import { importAnalysisUrl } from '@/lib/importAnalysis';

vi.mock('@/lib/auth', () => ({ getToken: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const row = (line: number, status: 'valido' | 'duplicado' | 'erro' = 'valido') => ({
  line, status, prestadorRaw: `Pessoa fictícia ${line}`, tipoRaw: 'Diária',
  dataRaw: '01/09/2026', workDate: line === 2 ? '2026-09-01' : '2026-09-30',
  horarioInicial: null, horarioFinal: null, observacoes: null, valor: null,
  providerId: line, teamId: 1, typeId: 1,
  errors: status === 'valido' ? [] : [{ campo: 'prestador', motivo: `Motivo sintético ${status}` }],
});
const preview = (mixed = false) => ({
  rows: mixed ? [row(2), row(3), row(4, 'duplicado'), row(5, 'erro')] : [row(2), row(3)],
  summary: { total: mixed ? 4 : 2, validos: 2, duplicados: mixed ? 1 : 0, erros: mixed ? 1 : 0 },
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const clients: QueryClient[] = [];
afterEach(() => { clients.forEach(client => client.clear()); clients.length = 0; });

function setup(response: () => Response | Promise<Response>, mixed = false, isAdmin = true) {
  const requests: { path: string; rows?: unknown[] }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'https://synthetic.invalid').pathname;
    if (path === '/api/diarias/import/preview' && init?.method === 'POST') {
      requests.push({ path });
      return json(preview(mixed));
    }
    if (path === '/api/diarias/import/confirm' && init?.method === 'POST') {
      requests.push({ path, rows: JSON.parse(String(init.body)).rows });
      return response();
    }
    throw new Error(`Network blocked: unexpected request ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const keys = [['diariasRange', '2026-09-01', '2026-09-30'], ['/api/diarias'],
    ['/api/diarias/summary'], ['/api/dashboard/summary'], ['/api/dashboard/recent-activity'],
    ['/api/audit'], ['listDiariasEquipe', {}, 1], ['getReportDiarias', {}],
    ['/api/reports/diarias'], ['/api/providers']];
  keys.forEach(key => client.setQueryData(key, { synthetic: true }));
  const onImportDone = vi.fn();
  render(<QueryClientProvider client={client}>
    <ImportarPlanilhaDialog open onOpenChange={vi.fn()} onImportDone={onImportDone} isAdmin={isAdmin} />
  </QueryClientProvider>);
  return { client, keys, requests, onImportDone };
}

async function validate() {
  const user = userEvent.setup();
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File(['synthetic,content'], 'ficticia.csv', { type: 'text/csv' }));
  await user.click(screen.getByRole('button', { name: 'Validar Planilha' }));
  await screen.findByRole('heading', { name: 'Pré-visualização' });
  return user;
}

function count(label: string, value: number) {
  expect(screen.getByText(label).parentElement?.firstElementChild).toHaveTextContent(String(value));
}

describe('Spreadsheet import — synthetic responses only', () => {
  it('does not write during preview and sends only valid rows after explicit confirmation', async () => {
    const api = setup(() => json({ imported: 2, skipped: 0, details: [] }), true);
    const user = await validate();
    expect(screen.getByText(/Nenhuma diária foi gravada nesta etapa/)).toBeInTheDocument();
    expect(api.requests).toHaveLength(1);
    expect(api.onImportDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Importar 2 registros' }));
    await screen.findByRole('heading', { name: 'Importação parcial' });
    expect(api.requests[1].rows).toEqual([row(2), row(3)]);
    count('Linhas na planilha', 4);
    count('Duplicados na prévia (não enviados)', 1);
    count('Com erro na prévia (não enviados)', 1);
    expect(screen.getByText(/Motivo sintético duplicado/)).toBeInTheDocument();
    expect(screen.getByText(/Motivo sintético erro/)).toBeInTheDocument();
  });

  it.each([
    { imported: 0, skipped: 2, title: 'Nenhuma diária importada' },
    { imported: 1, skipped: 1, title: 'Importação parcial' },
    { imported: 2, skipped: 0, title: 'Gravação confirmada' },
  ])('shows $title and refreshes only after positive confirmed writes', async ({ imported, skipped, title }) => {
    const api = setup(() => json({ imported, skipped, details: skipped
      ? [{ line: 2, motivo: 'Duplicata detectada durante confirmação.' }] : [] }));
    const user = await validate();
    await user.click(screen.getByRole('button', { name: 'Importar 2 registros' }));
    await screen.findByRole('heading', { name: title });
    count('Importados', imported);
    count('Não gravados na confirmação', skipped);
    if (skipped) expect(screen.getByText(/Duplicata detectada durante confirmação/)).toBeInTheDocument();
    expect(api.onImportDone).toHaveBeenCalledTimes(imported > 0 ? 1 : 0);
    await waitFor(() => {
      api.keys.slice(0, -1).forEach(key =>
        expect(api.client.getQueryState(key)?.isInvalidated).toBe(imported > 0));
    });
    expect(api.client.getQueryState(['/api/providers'])?.isInvalidated).toBe(false);
    expect(api.requests.filter(request => request.path.endsWith('/confirm'))).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Importar 2 registros' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Consultar na Análise de Diárias' })).toHaveAttribute(
      'href', '/analise-diarias?fromImport=1&startDate=2026-09-01&endDate=2026-09-30');
  });

  it.each([
    { label: 'HTTP error', response: () => json({ error: 'Falha sintética' }, 500) },
    { label: 'lost connection', response: () => Promise.reject(new Error('Conexão interrompida')) },
    { label: 'malformed response', response: () => json({ imported: '2', skipped: 0, details: [] }) },
    { label: 'invalid JSON', response: () => new Response('not JSON') },
  ])('does not claim success or resend after $label', async ({ response }) => {
    const api = setup(response);
    const user = await validate();
    await user.click(screen.getByRole('button', { name: 'Importar 2 registros' }));
    await screen.findByRole('heading', { name: 'Gravação não confirmada' });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Algumas linhas podem ter sido gravadas/)).toBeInTheDocument();
    expect(screen.queryByText('Importados')).not.toBeInTheDocument();
    expect(api.onImportDone).not.toHaveBeenCalled();
    expect(api.requests).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Importar 2 registros' })).not.toBeInTheDocument();
  });

  it('does not offer the admin analysis shortcut to a manager', async () => {
    setup(() => json({ imported: 2, skipped: 0, details: [] }), false, false);
    const user = await validate();
    await user.click(screen.getByRole('button', { name: 'Importar 2 registros' }));
    await screen.findByRole('heading', { name: 'Gravação confirmada' });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('prevents another submission and closing while confirmation is pending', async () => {
    let resolve!: (response: Response) => void;
    const api = setup(() => new Promise<Response>(done => { resolve = done; }));
    const user = await validate();
    const submit = screen.getByRole('button', { name: 'Importar 2 registros' });
    await user.dblClick(submit);
    expect(submit).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.requests).toHaveLength(2);
    resolve(json({ imported: 2, skipped: 0, details: [] }));
    await screen.findByRole('heading', { name: 'Gravação confirmada' });
  });

  it('keeps duplicate-only previews from being confirmed', async () => {
    setup(() => { throw new Error('Confirmation must not run'); });
    vi.mocked(fetch).mockResolvedValue(json({
      rows: [row(2, 'duplicado')], summary: { total: 1, validos: 0, duplicados: 1, erros: 0 },
    }));
    await validate();
    expect(screen.getByRole('button', { name: 'Importar 0 registros' })).toBeDisabled();
    expect(within(screen.getByRole('dialog')).getByText('Duplicado')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not invent a spreadsheet period without normalized dates', () => {
    expect(importAnalysisUrl([{}, { workDate: '31/09/2026' }])).toBe('/analise-diarias?fromImport=1');
  });
});
