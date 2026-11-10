import { createRoot } from 'react-dom/client';
import { setAuthTokenGetter, setBaseUrl, type ExportCorrectionPreview, type ExportCorrectionConfirmation, type ExportCorrectionResult } from '@workspace/api-client-react';
import ExportCorrectionDialog from '../../src/components/ExportCorrectionDialog';
import '../../src/index.css';

// This entry is not part of the production build. Even when opened manually,
// no fetch can reach an API, identity service, or database.
if (!import.meta.env.DEV) throw new Error('Synthetic browser fixture is development-only.');
setAuthTokenGetter(null);
setBaseUrl(null);
const traffic: {
  requests: { method: string; path: string; body: unknown }[];
  receipts: ExportCorrectionResult[]; violations: string[]; completed: number;
} = {
  requests: [], receipts: [], violations: [], completed: 0,
};
Object.assign(window, { correctionTestTraffic: traffic });
const document = '12.345.678/0001-90';
const longName = `Prestador exclusivamente sintético de operações e serviços ${'NomeSemEspacos'.repeat(12)}`;
const preview: ExportCorrectionPreview = {
  rows: Array.from({ length: 24 }, (_, i) => ({
    id: 1001 + i, providerId: 101 + Math.floor(i / 3), providerName: `${longName} grupo ${Math.floor(i / 3) + 1}`,
    providerDecargoId: `manual-${'ReferenciaLonga'.repeat(15)}`, cnpj: `${document} ${'DocumentoLegado'.repeat(10)}`,
    typeId: 31, typeName: `Tipo histórico ${'TipoLongo'.repeat(15)}`, exportTarget: 'descontos',
    status: 'disponivel_exportacao', integrationId: null, exportedAt: null, exportedBy: null,
    approvedAt: null, approvedBy: null, updatedAt: '2026-10-03T12:00:00Z',
    workDate: '2026-10-02', paymentDate: '2026-10-09', value: '150.00',
  })),
  skipped: [{ id: 2001, reason: `Reserva fictícia: ${'AvisoLongo'.repeat(20)}` }],
  providers: [
    { id: 201, name: longName, decargoId: '2147483647', cnpj: document },
    { id: 202, name: longName, decargoId: '2147483646', cnpj: '98.765.432/0001-10' },
    { id: 203, name: 'Prestador sintético intermediário', decargoId: '2147483645', cnpj: '11.222.333/0001-44' },
    { id: 204, name: 'Prestador sintético final', decargoId: '2147483644', cnpj: '55.666.777/0001-88' },
  ],
  // Preview candidates represent active extra-payment types; all are local,
  // synthetic options, with no catalog/People request.
  types: [
    { id: 32, name: 'Diária extra sintética' },
    { id: 33, name: 'Diária extra sintética intermediária' },
    { id: 34, name: 'Diária extra sintética final' },
  ],
};
// Opt-in scenario: retain the original 24-row keyboard/viewport fixture.
// Four rows already match provider 201/type 32; one needs only its type
// changed, and two need only their provider changed when type 32 is chosen.
const params = new URLSearchParams(window.location.search);
// Opt-in gate delays only the local save response, never preview or real HTTP.
// Release explicitly from the test so repeated activations happen in flight.
let releaseSaveResponse: (() => void) | undefined;
const saveResponseGate = params.get('saveResponse') === 'manual'
  ? new Promise<void>(resolve => { releaseSaveResponse = resolve; })
  : null;
Object.assign(window, {
  releaseCorrectionSaveResponse: () => {
    if (!releaseSaveResponse) throw new Error('No synthetic save response to release.');
    releaseSaveResponse();
    releaseSaveResponse = undefined;
  },
});
if (params.get('scenario') === 'mixed') {
  const template = preview.rows[0];
  preview.rows = Array.from({ length: 7 }, (_, i) => {
    const provider = i < 5 ? preview.providers[0] : null;
    const type = preview.types[i === 4 ? 1 : 0];
    return {
      ...template,
      id: 1101 + i,
      providerId: provider?.id ?? 101,
      providerName: provider?.name ?? template.providerName,
      providerDecargoId: provider?.decargoId ?? template.providerDecargoId,
      cnpj: provider?.cnpj ?? template.cnpj,
      typeId: type.id, typeName: type.name, exportTarget: 'diarias',
    };
  });
}
// Separate non-empty no-op batch: every original link and extra type is
// already valid. Do not reuse the mixed batch or refresh-to-empty scenario.
if (new URLSearchParams(window.location.search).get('scenario') === 'unchanged') {
  const template = preview.rows[0];
  const type = preview.types[0];
  preview.rows = Array.from({ length: 6 }, (_, i) => {
    const provider = preview.providers[Math.floor(i / 3)];
    return {
      ...template,
      id: 1201 + i,
      providerId: provider.id, providerName: provider.name,
      providerDecargoId: provider.decargoId, cnpj: provider.cnpj,
      typeId: type.id, typeName: type.name, exportTarget: 'diarias',
    };
  });
  preview.skipped = [];
}
Object.assign(window, { correctionTestPreview: preview });
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const key = `${method} ${url.pathname}`;
  if (url.origin !== window.location.origin || url.search || method !== 'POST'
    || !['/api/diarias/export/correction/preview', '/api/diarias/export/correction'].includes(url.pathname)) {
    traffic.violations.push(key);
    throw new Error(`Forbidden synthetic traffic: ${key}`);
  }
  const body = JSON.parse(String(init?.body));
  traffic.requests.push({ method, path: url.pathname, body });
  let result: ExportCorrectionPreview | ExportCorrectionResult = preview;
  if (!url.pathname.endsWith('/preview')) {
    const receipt: ExportCorrectionResult = { correctedIds: [], unchangedIds: [] };
    for (const correction of (body as ExportCorrectionConfirmation).corrections) {
      // Compare to synthetic original rows, not the client's expected fields
      // or hardcoded counts. Never mutate provider registrations.
      const row = preview.rows.find(r => r.id === correction.id);
      if (!row) throw new Error(`Unknown synthetic correction ID: ${correction.id}`);
      const changed = row.providerId !== correction.providerId || row.typeId !== correction.typeId;
      (changed ? receipt.correctedIds : receipt.unchangedIds).push(row.id);
    }
    // Vary only the synthetic response, after independently calculating
    // the correct partition. The submitted corrections remain untouched.
    if (params.get('scenario') === 'mixed') {
      switch (params.get('receipt')) {
        case 'reordered':
          // Valid receipt sets need not follow the submitted corrections.
          // A singleton (type 33's unchanged set) has only one possible order.
          receipt.correctedIds.reverse();
          receipt.unchangedIds.reverse();
          break;
        case 'swapped':
          [receipt.correctedIds[0], receipt.unchangedIds[0]] = [receipt.unchangedIds[0], receipt.correctedIds[0]];
          break;
        case 'duplicate-corrected':
          receipt.correctedIds[1] = receipt.correctedIds[0];
          break;
        case 'duplicate-unchanged':
          receipt.unchangedIds[1] = receipt.unchangedIds[0];
          break;
        case 'omitted-corrected':
          receipt.correctedIds.pop();
          break;
        case 'omitted-unchanged':
          receipt.unchangedIds.pop();
          break;
        case 'unknown-corrected':
          receipt.correctedIds[0] = 9999;
          break;
        case 'unknown-unchanged':
          receipt.unchangedIds[0] = 9999;
          break;
        case 'skipped-corrected':
          receipt.correctedIds[0] = 2001;
          break;
        case 'skipped-unchanged':
          receipt.unchangedIds[0] = 2001;
          break;
      }
    }
    if (saveResponseGate) await saveResponseGate;
    traffic.receipts.push(receipt);
    result = receipt;
  }
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};
createRoot(window.document.getElementById('root')!).render(
  <main className="p-4">
    <h1>Teste isolado de correção financeira</h1>
    <ExportCorrectionDialog diariaIds={[...preview.rows.map(r => r.id), ...preview.skipped.map(r => r.id)]} onDone={() => { traffic.completed++; }} />
  </main>,
);
