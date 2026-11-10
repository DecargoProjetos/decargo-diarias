import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExportCorrectionDialog from './ExportCorrectionDialog';
import {
  CORRECT, PREVIEW, correctionPreview, typeOnlyPreview, documentA, documentB,
  json, mockCorrectionApi, reason, renderCorrectionUI,
} from '@/test/exportCorrectionFixtures';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
beforeEach(() => toast.mockClear());

const control = (name: string) => screen.getByTestId(name);
const save = () => control('button-save-correction');
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function requestSignal(api: ReturnType<typeof mockCorrectionApi>, index: number) {
  const signal = api.fetchMock.mock.calls[index][1]?.signal;
  expect(signal).toBeInstanceOf(AbortSignal);
  return signal!;
}
function expectFreshForm() {
  expect(control('select-correction-type')).toHaveValue('');
  expect(control('select-correction-provider-101')).toHaveValue('');
  expect(screen.queryByTestId('input-correction-cnpj-101')).not.toBeInTheDocument();
  expect(control('input-correction-reason')).toHaveValue('');
  expect(control('input-correction-search')).toHaveValue('');
  expect(control('checkbox-correction-confirm')).not.toBeChecked();
  expect(save()).toBeDisabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
}
async function open() {
  await userEvent.click(control('button-open-export-correction'));
  await screen.findByTestId('select-correction-type');
}
async function authorize() {
  await userEvent.type(control('input-correction-reason'), reason);
  await userEvent.click(control('checkbox-correction-confirm'));
}
async function choose(provider = '201', document = documentA) {
  await userEvent.selectOptions(control('select-correction-type'), '32');
  await userEvent.selectOptions(control('select-correction-provider-101'), provider);
  await userEvent.type(control('input-correction-cnpj-101'), document);
}

describe('correction dialog: synthetic HTTP, never financial or identity mutations', () => {
  it.each(['resolve', 'reject'] as const)('ignores a cancelled preview that later %ss while the next opening is still loading', async outcome => {
    const old = deferred(), current = deferred();
    const api = mockCorrectionApi({
      [`POST ${PREVIEW}`]: () => api.requests.length === 1 ? old.promise : current.promise,
    });
    const onDone = vi.fn();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={onDone} />);
    await userEvent.click(control('button-open-export-correction'));
    const signal = requestSignal(api, 0);
    await userEvent.click(control('button-cancel-correction'));
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(control('button-open-export-correction'));
    await act(async () => {
      if (outcome === 'resolve') old.resolve(typeOnlyPreview());
      else old.reject(new Error('Erro da abertura cancelada'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Consultando');
    expect(screen.queryByTestId('select-correction-type')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
    await act(async () => { current.resolve(correctionPreview()); });
    expectFreshForm();
    expect(onDone).not.toHaveBeenCalled();
    expect(api.writes()).toEqual([]);
    expect(api.requests).toHaveLength(2);
  });

  it.each(['resolve', 'reject'] as const)('keeps the current choices and consent when an older preview later %ss', async outcome => {
    const old = deferred();
    const api = mockCorrectionApi({
      [`POST ${PREVIEW}`]: () => api.requests.length === 1 ? old.promise : correctionPreview(),
    });
    const onDone = vi.fn();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={onDone} />);
    await userEvent.click(control('button-open-export-correction'));
    await userEvent.click(control('button-cancel-correction'));
    await open(); await choose(); await authorize();
    await act(async () => {
      if (outcome === 'resolve') old.resolve(typeOnlyPreview());
      else old.reject(new Error('Erro da abertura cancelada'));
    });
    expect(control('select-correction-type')).toHaveValue('32');
    expect(control('select-correction-provider-101')).toHaveValue('201');
    expect(control('input-correction-cnpj-101')).toHaveValue(documentA);
    expect(control('input-correction-reason')).toHaveValue(reason);
    expect(control('checkbox-correction-confirm')).toBeChecked();
    expect(save()).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(api.writes()).toEqual([]);
    expect(api.requests).toHaveLength(2);
  });

  it('clears identity evidence and consent on an ordinary close and reopen', async () => {
    const api = mockCorrectionApi();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={vi.fn()} />);
    await open(); await choose(); await authorize();
    await userEvent.type(control('input-correction-search'), '501');
    await userEvent.click(control('button-cancel-correction'));
    await open();
    expectFreshForm();
    expect(api.requests).toHaveLength(2);
    expect(api.writes()).toEqual([]);
  });

  it.each([
    ['preview', 'resolve'], ['preview', 'reject'],
    ['correction', 'resolve'], ['correction', 'reject'],
  ] as const)('aborts pending %s on unmount and ignores a late %s in a new instance', async (phase, outcome) => {
    const old = deferred();
    const api = mockCorrectionApi({
      [phase === 'preview' ? `POST ${PREVIEW}` : `POST ${CORRECT}`]: () =>
        phase === 'preview' && api.requests.length > 1 ? correctionPreview() : old.promise,
    });
    const onDone = vi.fn();
    const ui = renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={onDone} />);
    if (phase === 'preview') {
      await userEvent.click(control('button-open-export-correction'));
    } else {
      await open(); await choose(); await authorize();
      await userEvent.click(save());
      expect(control('button-cancel-correction')).toBeDisabled();
      await userEvent.click(control('button-cancel-correction'));
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(screen.getByRole('dialog')).toBeVisible();
    }
    const signal = requestSignal(api, phase === 'preview' ? 0 : 1);
    ui.unmount();
    expect(signal.aborted).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={onDone} />);
    await open();
    expectFreshForm();
    await act(async () => {
      if (outcome === 'resolve') old.resolve(phase === 'preview' ? typeOnlyPreview() : { correctedIds: [71], unchangedIds: [] });
      else old.reject(new Error('Erro da instância desmontada'));
    });
    expect(screen.getByRole('dialog')).toBeVisible();
    expectFreshForm();
    expect(onDone).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(api.requests).toHaveLength(phase === 'preview' ? 2 : 3);
    expect(api.writes()).toHaveLength(phase === 'preview' ? 0 : 1);
  });

  it.each(['preview', 'correction'] as const)('ends a pending %s at exactly 30 seconds without retrying or carrying consent into a fresh opening', async phase => {
    const pending = deferred();
    let delayed = true;
    const api = mockCorrectionApi({
      [phase === 'preview' ? `POST ${PREVIEW}` : `POST ${CORRECT}`]: () => delayed
        ? pending.promise : correctionPreview(),
    });
    const onDone = vi.fn();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={onDone} />);
    if (phase === 'correction') { await open(); await choose(); await authorize(); }
    vi.useFakeTimers();
    fireEvent.click(control(phase === 'preview' ? 'button-open-export-correction' : 'button-save-correction'));
    const signal = requestSignal(api, phase === 'preview' ? 0 : 1);
    // Simulate fetch's abort rejection, entirely inside the synthetic network guard.
    signal.addEventListener('abort', () => pending.reject(new DOMException('Synthetic abort', 'AbortError')), { once: true });
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
    expect(signal.aborted).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent('O servidor não respondeu a tempo ou a operação foi cancelada. Atualize a conferência.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('select-correction-type')).not.toBeInTheDocument();
    expect(control('button-refresh-correction')).toBeEnabled();
    expect(control('button-cancel-correction')).toBeEnabled();
    expect(save()).toBeDisabled();
    const count = api.requests.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(api.requests).toHaveLength(count);
    expect(onDone).not.toHaveBeenCalled();
    vi.useRealTimers();
    delayed = false;
    await userEvent.click(control('button-cancel-correction'));
    await open();
    expectFreshForm();
    expect(api.requests).toHaveLength(count + 1);
    expect(api.writes()).toHaveLength(phase === 'preview' ? 0 : 1);
    expect(onDone).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('requires explicit identity despite duplicate names and sends only selected IDs with concurrency evidence', async () => {
    const p = correctionPreview();
    p.rows.push({ ...p.rows[0], id: 72 });
    p.skipped.push({ id: 73, reason: 'Reserva fictícia existente' });
    const api = mockCorrectionApi({ [`POST ${PREVIEW}`]: () => p });
    const onDone = vi.fn();
    const ui = renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71, 72, 73, 71]} onDone={onDone} />);
    await open();
    expect(api.requests[0].body).toEqual({ diariaIds: [71, 72, 73] });
    expect(control('select-correction-provider-101')).toHaveValue('');
    expect(screen.getAllByRole('option', { name: /Prestador fictício/ })).toHaveLength(2);
    expect(screen.getByText(/esta correção nunca libera bloqueios/)).toBeInTheDocument();
    ui.rerender(<ExportCorrectionDialog diariaIds={[999]} onDone={onDone} />);
    await userEvent.selectOptions(control('select-correction-type'), '32');
    await authorize();
    expect(save()).toBeDisabled();
    await userEvent.selectOptions(control('select-correction-provider-101'), '202');
    expect(control('checkbox-correction-confirm')).not.toBeChecked();
    expect(control('input-correction-cnpj-101')).toHaveValue('');
    await userEvent.type(control('input-correction-cnpj-101'), '98.765.432/0001-10');
    await userEvent.click(control('checkbox-correction-confirm'));
    await userEvent.click(save());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(api.writes()).toHaveLength(1);
    expect(api.writes()[0].body).toEqual({
      confirmed: true, reason, corrections: [71, 72].map(id => ({
        id, expectedProviderId: 101, expectedTypeId: 31,
        expectedUpdatedAt: p.rows[0].updatedAt, expectedProviderDecargoId: 'manual-synthetic',
        expectedPeopleId: '502', providerId: 202, typeId: 32, verifiedCnpj: documentB,
      })),
    });
    expect(api.requests.map(r => `${r.method} ${r.path}`)).toEqual([`POST ${PREVIEW}`, `POST ${CORRECT}`]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('requires independent matching CNPJ, clears it and consent on a different binding', async () => {
    const api = mockCorrectionApi();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={vi.fn()} />);
    await open();
    await choose();
    await authorize();
    expect(save()).toBeEnabled();
    await userEvent.selectOptions(control('select-correction-provider-101'), '202');
    expect(control('input-correction-cnpj-101')).toHaveValue('');
    expect(control('checkbox-correction-confirm')).not.toBeChecked();
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(save()).toBeDisabled();
    await userEvent.type(control('input-correction-cnpj-101'), documentA);
    expect(screen.getByText('O CNPJ informado não corresponde ao prestador escolhido.')).toBeVisible();
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(save()).toBeDisabled();
    await userEvent.clear(control('input-correction-cnpj-101'));
    await userEvent.type(control('input-correction-cnpj-101'), documentB.slice(0, 13));
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(save()).toBeDisabled();
    await userEvent.type(control('input-correction-cnpj-101'), documentB.slice(-1));
    expect(control('checkbox-correction-confirm')).not.toBeChecked();
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(save()).toBeEnabled();
    expect(api.writes()).toEqual([]);
  });

  it('permits a type-only change without a local CNPJ or a verifiedCnpj in the payload', async () => {
    const api = mockCorrectionApi({ [`POST ${PREVIEW}`]: typeOnlyPreview });
    const onDone = vi.fn();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={onDone} />);
    await open();
    expect(control('select-correction-provider-201')).toHaveValue('201');
    await authorize();
    expect(save()).toBeDisabled(); // No change is not a correction.
    await userEvent.selectOptions(control('select-correction-type'), '33');
    expect(control('checkbox-correction-confirm')).not.toBeChecked();
    expect(screen.queryByTestId('input-correction-cnpj-201')).not.toBeInTheDocument();
    await userEvent.click(control('checkbox-correction-confirm'));
    await userEvent.click(save());
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(api.writes()[0].body).toEqual({
      confirmed: true, reason, corrections: [{
        id: 71, expectedProviderId: 201, expectedProviderDecargoId: '501',
        expectedTypeId: 32, expectedUpdatedAt: typeOnlyPreview().rows[0].updatedAt,
        expectedPeopleId: '501', providerId: 201, typeId: 33,
      }],
    });
  });

  it('requires a nonblank reason of at least ten characters and explicit consent', async () => {
    const api = mockCorrectionApi();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={vi.fn()} />);
    await open();
    await choose();
    await userEvent.click(control('checkbox-correction-confirm'));
    for (const text of ['          ', '123456789']) {
      await userEvent.clear(control('input-correction-reason'));
      await userEvent.type(control('input-correction-reason'), text);
      expect(save()).toBeDisabled();
      await userEvent.click(save());
    }
    await userEvent.clear(control('input-correction-reason'));
    await userEvent.type(control('input-correction-reason'), `  ${reason}  `);
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(save()).toBeDisabled();
    expect(api.writes()).toEqual([]);
    await userEvent.click(control('checkbox-correction-confirm'));
    await userEvent.click(save());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.writes()).toHaveLength(1);
    expect(api.writes()[0].body).toMatchObject({ confirmed: true, reason });
  });

  it('warns explicitly when local documents are absent and still requires manual evidence', async () => {
    const api = mockCorrectionApi();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={vi.fn()} />);
    await open();
    await userEvent.selectOptions(control('select-correction-type'), '32');
    await userEvent.selectOptions(control('select-correction-provider-101'), '203');
    expect(screen.getByText(/CNPJ não consta no cadastro local/)).toHaveTextContent('Confira diretamente no People o ID 503');
    expect(screen.getByText(/Esta conferência manual/)).toHaveTextContent('não preenche nem altera o cadastro de Pessoas');
    expect(control('input-correction-cnpj-101')).toHaveValue('');
    await authorize();
    expect(save()).toBeDisabled();
    await userEvent.type(control('input-correction-cnpj-101'), documentA);
    await userEvent.click(control('checkbox-correction-confirm'));
    await userEvent.click(save());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.writes()[0].body).toMatchObject({
      corrections: [{ id: 71, providerId: 203, expectedPeopleId: '503', verifiedCnpj: documentA }],
    });
  });

  it.each([
    ['missing selected row', (p: ReturnType<typeof correctionPreview>) => { p.rows = []; }],
    ['duplicate selected row', (p: ReturnType<typeof correctionPreview>) => { p.rows.push(p.rows[0]); }],
    ['unknown row ID', (p: ReturnType<typeof correctionPreview>) => { p.rows[0].id = 999; }],
    ['overlapping skipped row', (p: ReturnType<typeof correctionPreview>) => { p.skipped.push({ id: 71, reason: 'Bloqueada' }); }],
    ['missing candidate roster', (p: ReturnType<typeof correctionPreview>) => { Reflect.deleteProperty(p, 'providers'); }],
    ['missing concurrency version', (p: ReturnType<typeof correctionPreview>) => { p.rows[0].updatedAt = ''; }],
    ['reserved row', (p: ReturnType<typeof correctionPreview>) => { p.rows[0].integrationId = 'synthetic-reservation'; }],
  ])('rejects incomplete/unsafe preview: %s', async (_name, corrupt) => {
    const p = correctionPreview(); corrupt(p);
    const api = mockCorrectionApi({ [`POST ${PREVIEW}`]: () => p });
    const onDone = vi.fn();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={onDone} />);
    await userEvent.click(control('button-open-export-correction'));
    expect(await screen.findByRole('alert')).toHaveTextContent('conferência inválida');
    expect(save()).toBeDisabled();
    expect(screen.queryByTestId('select-correction-provider-101')).not.toBeInTheDocument();
    await userEvent.click(save());
    expect(api.writes()).toEqual([]);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows excluded rows without offering to release, approve or export them', async () => {
    const api = mockCorrectionApi({
      [`POST ${PREVIEW}`]: () => ({ ...correctionPreview(), rows: [], skipped: [{ id: 71, reason: 'Reserva fictícia' }] }),
    });
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={vi.fn()} />);
    await userEvent.click(control('button-open-export-correction'));
    expect(await screen.findByText(/Nenhum registro selecionado pode ser corrigido/)).toBeVisible();
    await userEvent.click(screen.getByText('1 registro(s) não podem ser corrigidos aqui'));
    expect(screen.getByText('Diária #71: Reserva fictícia')).toBeVisible();
    expect(save()).toBeDisabled();
    expect(api.writes()).toEqual([]);
  });

  it('blocks correction when a manual refresh after 409 excludes every previously authorized row', async () => {
    const first = correctionPreview();
    first.rows.push({ ...first.rows[0], id: 72 });
    const refreshed = {
      ...first,
      rows: [],
      skipped: first.rows.map(({ id }) => ({ id, reason: 'Reserva concorrente fictícia' })),
    };
    let previews = 0;
    const api = mockCorrectionApi({
      [`POST ${PREVIEW}`]: () => ++previews === 1 ? first : refreshed,
      [`POST ${CORRECT}`]: () => json({ error: 'Registro alterado desde a conferência.' }, 409),
    });
    const onDone = vi.fn();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71, 72]} onDone={onDone} />);
    await open(); await choose(); await authorize();
    expect(control('checkbox-correction-confirm')).toBeChecked();
    expect(save()).toBeEnabled();
    vi.useFakeTimers();
    fireEvent.click(save());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('alert')).toHaveTextContent('Registro alterado desde a conferência.');
    expect(save()).toBeDisabled();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    vi.useRealTimers();
    expect(api.requests.map(r => `${r.method} ${r.path}`)).toEqual([`POST ${PREVIEW}`, `POST ${CORRECT}`]);
    expect(onDone).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();

    await userEvent.click(control('button-refresh-correction'));
    expect(await screen.findByText('Nenhum registro selecionado pode ser corrigido. Ajuste a seleção e abra novamente.')).toBeVisible();
    await userEvent.click(screen.getByText('2 registro(s) não podem ser corrigidos aqui'));
    for (const id of [71, 72]) {
      expect(screen.getByText(`Diária #${id}: Reserva concorrente fictícia`)).toBeVisible();
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('checkbox-correction-confirm')).not.toBeInTheDocument();
    expect(screen.queryByTestId('select-correction-type')).not.toBeInTheDocument();
    expect(screen.queryByTestId('select-correction-provider-101')).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    vi.useRealTimers();
    expect(save()).toBeDisabled();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(api.requests.map(r => `${r.method} ${r.path}`)).toEqual([
      `POST ${PREVIEW}`, `POST ${CORRECT}`, `POST ${PREVIEW}`,
    ]);
    expect(api.requests.filter(r => r.path === PREVIEW).map(r => r.body)).toEqual([
      { diariaIds: [71, 72] }, { diariaIds: [71, 72] },
    ]);
    expect(api.writes()).toHaveLength(1);
    expect(api.writes()[0].body).toMatchObject({
      confirmed: true, reason, corrections: [{ id: 71 }, { id: 72 }],
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it.each(['removed selected type', 'no active types'] as const)('requires a fresh available choice and consent after a 409 refresh with %s', async catalog => {
    const first = correctionPreview();
    const refreshed = correctionPreview();
    refreshed.rows[0].updatedAt = '2026-10-04T12:00:00Z';
    refreshed.types = catalog === 'no active types' ? [] : [
      first.types[1],
      { ...first.types[1], id: 34, name: 'Terceira diária extra fictícia' },
    ];
    let previews = 0;
    let corrections = 0;
    const api = mockCorrectionApi({
      [`POST ${PREVIEW}`]: () => ++previews === 1 ? first : refreshed,
      [`POST ${CORRECT}`]: () => ++corrections === 1
        ? json({ error: 'Registro alterado desde a conferência.' }, 409)
        : { correctedIds: [71], unchangedIds: [] },
    });
    const onDone = vi.fn();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={onDone} />);
    await open(); await choose(); await authorize();
    expect(control('select-correction-type')).toHaveValue('32');
    expect(control('checkbox-correction-confirm')).toBeChecked();
    expect(save()).toBeEnabled();
    vi.useFakeTimers();
    fireEvent.click(save());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('alert')).toHaveTextContent('Registro alterado desde a conferência');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    vi.useRealTimers();
    expect(save()).toBeDisabled();
    expect(screen.queryByTestId('select-correction-type')).not.toBeInTheDocument();
    await userEvent.click(save());
    expect(api.requests.map(r => `${r.method} ${r.path}`)).toEqual([`POST ${PREVIEW}`, `POST ${CORRECT}`]);
    expect(onDone).not.toHaveBeenCalled();
    await userEvent.click(control('button-refresh-correction'));
    if (catalog === 'no active types') {
      expect(await screen.findByText(/Não há tipo ativo de diária extra cadastrado/)).toBeVisible();
      expect(screen.queryByTestId('select-correction-type')).not.toBeInTheDocument();
      expect(screen.queryByTestId('checkbox-correction-confirm')).not.toBeInTheDocument();
    } else {
      await screen.findByTestId('select-correction-type');
      expect(control('select-correction-type')).toHaveValue('');
      expect(screen.queryByRole('option', { name: first.types[0].name })).not.toBeInTheDocument();
      expect(control('select-correction-provider-101')).toHaveValue('');
      expect(screen.queryByTestId('input-correction-cnpj-101')).not.toBeInTheDocument();
      expect(control('checkbox-correction-confirm')).not.toBeChecked();
    }
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    vi.useRealTimers();
    expect(api.requests.map(r => `${r.method} ${r.path}`)).toEqual([`POST ${PREVIEW}`, `POST ${CORRECT}`, `POST ${PREVIEW}`]);
    expect(api.requests.filter(r => r.path === PREVIEW).map(r => r.body)).toEqual([
      { diariaIds: [71] }, { diariaIds: [71] },
    ]);
    expect(api.writes()).toHaveLength(1);
    expect(api.writes()[0].body).toMatchObject({
      confirmed: true, corrections: [{ typeId: 32, expectedUpdatedAt: first.rows[0].updatedAt }],
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    if (catalog === 'no active types') return;

    // Reconfirming identity alone cannot reuse the withdrawn type selection.
    await userEvent.selectOptions(control('select-correction-provider-101'), '201');
    await userEvent.type(control('input-correction-cnpj-101'), documentA);
    expect(control('input-correction-reason')).toHaveValue(reason);
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    expect(api.writes()).toHaveLength(1);
    await userEvent.selectOptions(control('select-correction-type'), '33');
    expect(control('checkbox-correction-confirm')).not.toBeChecked();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    expect(api.writes()).toHaveLength(1);
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(save()).toBeEnabled();
    expect(api.writes()).toHaveLength(1);
    await userEvent.click(save());
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(api.writes()).toHaveLength(2);
    expect(api.writes()[1].body).toEqual({
      confirmed: true, reason, corrections: [{
        id: 71, expectedProviderId: 101, expectedProviderDecargoId: 'manual-synthetic',
        expectedTypeId: 31, expectedUpdatedAt: refreshed.rows[0].updatedAt,
        expectedPeopleId: '501', providerId: 201, typeId: 33, verifiedCnpj: documentA,
      }],
    });
    expect(api.requests.map(r => `${r.method} ${r.path}`)).toEqual([
      `POST ${PREVIEW}`, `POST ${CORRECT}`, `POST ${PREVIEW}`, `POST ${CORRECT}`,
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('requires fresh identity evidence and consent when a 409 refresh changes People ID and CNPJ for the same local provider', async () => {
    const first = correctionPreview();
    const refreshed = correctionPreview();
    refreshed.rows[0].updatedAt = '2026-10-04T12:00:00Z';
    refreshed.providers[0] = { ...first.providers[0], decargoId: '504', cnpj: documentB };
    let previews = 0;
    let corrections = 0;
    const api = mockCorrectionApi({
      [`POST ${PREVIEW}`]: () => ++previews === 1 ? first : refreshed,
      [`POST ${CORRECT}`]: () => ++corrections === 1
        ? json({ error: 'Registro alterado desde a conferência.' }, 409)
        : { correctedIds: [71], unchangedIds: [] },
    });
    const onDone = vi.fn();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={onDone} />);
    await open(); await choose(); await authorize();
    expect(save()).toBeEnabled();
    await userEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('Registro alterado desde a conferência');
    expect(save()).toBeDisabled();
    expect(screen.queryByTestId('select-correction-provider-101')).not.toBeInTheDocument();
    await userEvent.click(save());
    expect(api.requests.map(r => `${r.method} ${r.path}`)).toEqual([
      `POST ${PREVIEW}`, `POST ${CORRECT}`,
    ]);
    expect(api.writes()[0].body).toEqual({
      confirmed: true, reason, corrections: [{
        id: 71, expectedProviderId: 101, expectedProviderDecargoId: 'manual-synthetic',
        expectedTypeId: 31, expectedUpdatedAt: first.rows[0].updatedAt,
        expectedPeopleId: '501', providerId: 201, typeId: 32, verifiedCnpj: documentA,
      }],
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();

    await userEvent.click(control('button-refresh-correction'));
    await screen.findByTestId('select-correction-type');
    expect(control('select-correction-provider-101')).toHaveValue('');
    expect(screen.queryByTestId('input-correction-cnpj-101')).not.toBeInTheDocument();
    expect(control('checkbox-correction-confirm')).not.toBeChecked();
    expect(control('input-correction-reason')).toHaveValue(reason);
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    expect(api.writes()).toHaveLength(1);

    // The same local ID now identifies someone else in People; old evidence is invalid.
    await userEvent.selectOptions(control('select-correction-type'), '32');
    await userEvent.selectOptions(control('select-correction-provider-101'), '201');
    expect(control('text-correction-provider-101')).toHaveTextContent(`ID People 504 · CNPJ ${documentB}`);
    expect(control('text-correction-provider-101')).not.toHaveTextContent('ID People 501');
    expect(control('input-correction-cnpj-101')).toHaveValue('');
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(control('checkbox-correction-confirm')).toBeChecked();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    expect(api.writes()).toHaveLength(1);

    await userEvent.type(control('input-correction-cnpj-101'), documentA);
    expect(control('checkbox-correction-confirm')).not.toBeChecked();
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(control('checkbox-correction-confirm')).toBeChecked();
    expect(screen.getByText('O CNPJ informado não corresponde ao prestador escolhido.')).toBeVisible();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    expect(api.writes()).toHaveLength(1);

    // Valid refreshed evidence still needs a new explicit confirmation.
    await userEvent.clear(control('input-correction-cnpj-101'));
    await userEvent.type(control('input-correction-cnpj-101'), documentB);
    expect(screen.queryByText('O CNPJ informado não corresponde ao prestador escolhido.')).not.toBeInTheDocument();
    expect(control('checkbox-correction-confirm')).not.toBeChecked();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    expect(api.writes()).toHaveLength(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(save()).toBeEnabled();
    expect(api.writes()).toHaveLength(1);
    await userEvent.click(save());
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(api.writes()).toHaveLength(2);
    expect(api.writes()[1].body).toEqual({
      confirmed: true, reason, corrections: [{
        id: 71, expectedProviderId: 101, expectedProviderDecargoId: 'manual-synthetic',
        expectedTypeId: 31, expectedUpdatedAt: refreshed.rows[0].updatedAt,
        expectedPeopleId: '504', providerId: 201, typeId: 32, verifiedCnpj: documentB,
      }],
    });
    expect(api.requests.filter(r => r.path === PREVIEW).map(r => r.body)).toEqual([
      { diariaIds: [71] }, { diariaIds: [71] },
    ]);
    expect(api.requests.map(r => `${r.method} ${r.path}`)).toEqual([
      `POST ${PREVIEW}`, `POST ${CORRECT}`, `POST ${PREVIEW}`, `POST ${CORRECT}`,
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('requires new consent and valid identity evidence when a 409 refresh auto-selects a different sole active type', async () => {
    const first = correctionPreview();
    const refreshed = correctionPreview();
    refreshed.rows[0].updatedAt = '2026-10-04T12:00:00Z';
    refreshed.types = [first.types[1]];
    let previews = 0;
    let corrections = 0;
    const api = mockCorrectionApi({
      [`POST ${PREVIEW}`]: () => ++previews === 1 ? first : refreshed,
      [`POST ${CORRECT}`]: () => ++corrections === 1
        ? json({ error: 'Registro alterado desde a conferência.' }, 409)
        : { correctedIds: [71], unchangedIds: [] },
    });
    const onDone = vi.fn();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={onDone} />);
    await open(); await choose(); await authorize();
    expect(control('select-correction-type')).toHaveValue('32');
    expect(control('checkbox-correction-confirm')).toBeChecked();
    expect(save()).toBeEnabled();
    await userEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('Registro alterado desde a conferência');
    expect(save()).toBeDisabled();
    expect(onDone).not.toHaveBeenCalled();

    await userEvent.click(control('button-refresh-correction'));
    await screen.findByTestId('select-correction-type');
    expect(control('select-correction-type')).toHaveValue('33');
    expect(screen.queryByRole('option', { name: first.types[0].name })).not.toBeInTheDocument();
    expect(control('select-correction-provider-101')).toHaveValue('');
    expect(screen.queryByTestId('input-correction-cnpj-101')).not.toBeInTheDocument();
    expect(control('input-correction-reason')).toHaveValue(reason);
    expect(control('checkbox-correction-confirm')).not.toBeChecked();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    vi.useRealTimers();
    expect(api.requests.map(r => `${r.method} ${r.path}`)).toEqual([
      `POST ${PREVIEW}`, `POST ${CORRECT}`, `POST ${PREVIEW}`,
    ]);
    expect(api.writes()).toHaveLength(1);
    expect(api.writes()[0].body).toMatchObject({
      confirmed: true, corrections: [{ typeId: 32, expectedUpdatedAt: first.rows[0].updatedAt }],
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();

    // New consent cannot compensate for missing or mismatched identity evidence.
    await userEvent.selectOptions(control('select-correction-provider-101'), '201');
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    expect(api.writes()).toHaveLength(1);
    await userEvent.type(control('input-correction-cnpj-101'), documentB);
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(control('checkbox-correction-confirm')).toBeChecked();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    expect(api.writes()).toHaveLength(1);

    // Restoring valid evidence must still not restore the previous consent.
    await userEvent.clear(control('input-correction-cnpj-101'));
    await userEvent.type(control('input-correction-cnpj-101'), documentA);
    expect(control('checkbox-correction-confirm')).not.toBeChecked();
    expect(save()).toBeDisabled();
    await userEvent.click(save());
    expect(api.writes()).toHaveLength(1);
    await userEvent.click(control('checkbox-correction-confirm'));
    expect(save()).toBeEnabled();
    expect(api.writes()).toHaveLength(1);
    await userEvent.click(save());
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(api.writes()).toHaveLength(2);
    expect(api.writes()[1].body).toEqual({
      confirmed: true, reason, corrections: [{
        id: 71, expectedProviderId: 101, expectedProviderDecargoId: 'manual-synthetic',
        expectedTypeId: 31, expectedUpdatedAt: refreshed.rows[0].updatedAt,
        expectedPeopleId: '501', providerId: 201, typeId: 33, verifiedCnpj: documentA,
      }],
    });
    expect(api.requests.map(r => `${r.method} ${r.path}`)).toEqual([
      `POST ${PREVIEW}`, `POST ${CORRECT}`, `POST ${PREVIEW}`, `POST ${CORRECT}`,
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    { correctedIds: [], unchangedIds: [] },
    { correctedIds: [999], unchangedIds: [] },
    { correctedIds: [71], unchangedIds: [71] },
  ])('does not announce success or retry for an incomplete correction receipt: %j', async result => {
    const api = mockCorrectionApi({ [`POST ${CORRECT}`]: () => result });
    const onDone = vi.fn();
    renderCorrectionUI(<ExportCorrectionDialog diariaIds={[71]} onDone={onDone} />);
    await open(); await choose(); await authorize();
    await userEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível confirmar o resultado');
    expect(onDone).not.toHaveBeenCalled();
    expect(save()).toBeDisabled();
    expect(api.writes()).toHaveLength(1);
  });
});
