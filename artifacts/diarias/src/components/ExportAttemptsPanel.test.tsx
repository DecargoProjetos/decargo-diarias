import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExportAttempt } from '@workspace/api-client-react';
import { renderUI } from '@/test/peopleFixtures';
import ExportAttemptsPanel from './ExportAttemptsPanel';

const attempt: ExportAttempt = {
  integrationRef: 'EXP-synthetic', status: 'interrupted',
  createdAt: '2026-10-10T10:00:00Z', updatedAt: '2026-10-10T10:01:00Z',
  total: 4, confirmed: [1], rejected: [2], uncertain: [3], unsent: [4],
  skipped: [{ id: 5, reason: 'Data de pagamento ausente' }], message: 'Conferência necessária',
};
const requests: string[] = [];
const violations: string[] = [];
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}
afterEach(() => {
  expect(violations.splice(0), 'Only synthetic GET consultations are allowed').toEqual([]);
  requests.splice(0);
});
function mockApi(response: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'https://synthetic.invalid');
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${url.pathname}`);
    if (method !== 'GET' || !url.pathname.startsWith('/api/diarias/export/attempts')) {
      violations.push(`${method} ${url.pathname}`);
      throw new Error('Network request blocked by synthetic test');
    }
    if (url.pathname.endsWith('/EXP-old')) return json({ ...attempt, integrationRef: 'EXP-old' });
    return response();
  }));
}

describe('export consultation with real generated hooks and synthetic services', () => {
  it('rediscovers persistent results after remount without a remembered reference or a POST', async () => {
    mockApi(() => json([attempt]));
    const first = renderUI(<ExportAttemptsPanel enabled />);
    expect(await screen.findByText('EXP-synthetic')).toBeVisible();
    first.unmount();
    renderUI(<ExportAttemptsPanel enabled />);
    expect(await screen.findByText('EXP-synthetic')).toBeVisible();
    await userEvent.click(screen.getByText('Consultar registros e validações'));
    expect(screen.getByText('2 de 4 registros com resposta confirmada.')).toBeVisible();
    expect(screen.getByText('#1')).toBeVisible();
    expect(screen.getByText('#2')).toBeVisible();
    expect(screen.getByText('#3')).toBeVisible();
    expect(screen.getByText('#4')).toBeVisible();
    expect(screen.getByText('#5: Data de pagamento ausente')).toBeVisible();
    expect(requests.filter(r => r === 'GET /api/diarias/export/attempts')).toHaveLength(2);
    expect(requests.every(r => r.startsWith('GET '))).toBe(true);
  });
  it('consults an older reference missing from the recent list', async () => {
    mockApi(() => json([]));
    renderUI(<ExportAttemptsPanel enabled />);
    await userEvent.type(screen.getByLabelText('Referência da exportação'), 'EXP-old');
    await userEvent.click(screen.getByRole('button', { name: 'Consultar referência' }));
    expect(await screen.findByText('EXP-old')).toBeVisible();
    expect(requests).toContain('GET /api/diarias/export/attempts/EXP-old');
    expect(requests.every(r => r.startsWith('GET '))).toBe(true);
  });
  it('hides cached progress after a failed refresh and recovers by consultation only', async () => {
    let unavailable = false;
    mockApi(() => unavailable ? json({}, 503) : json([attempt]));
    renderUI(<ExportAttemptsPanel enabled />);
    expect(await screen.findByText('EXP-synthetic')).toBeVisible();
    unavailable = true;
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar o resultado atual');
    expect(screen.queryByText('EXP-synthetic')).not.toBeInTheDocument();
    unavailable = false;
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(await screen.findByText('EXP-synthetic')).toBeVisible();
    expect(requests.every(r => r.startsWith('GET '))).toBe(true);
  });
  it('does not consult or render financial attempts for a non-admin', async () => {
    mockApi(() => json([attempt]));
    renderUI(<ExportAttemptsPanel enabled={false} />);
    await waitFor(() => expect(screen.queryByText('Acompanhamento de exportações')).not.toBeInTheDocument());
    expect(requests).toEqual([]);
  });
});
