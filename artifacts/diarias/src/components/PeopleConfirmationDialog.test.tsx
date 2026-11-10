import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeopleConfirmationDialog } from './PeopleConfirmationDialog';
import { auditPage, confirmation, confirmationAction, failedAudit, mockPeopleApi, renderUI } from '@/test/peopleFixtures';

describe('PeopleConfirmationDialog', () => {
  it('queries only this provider confirmation and paginates without changing identity', async () => {
    const api = mockPeopleApi({ audit: params => auditPage(
      [confirmation(101, Number(params.get('page')), `Documento página ${params.get('page')}`)],
      Number(params.get('page')), 2,
    ) });
    const user = userEvent.setup();
    renderUI(<PeopleConfirmationDialog providerId={101} name="Funcionária Alfa" onClose={vi.fn()} />);
    expect(await screen.findByText('Documento página 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(Object.fromEntries(api.auditRequests[0])).toEqual({
      entityType: 'provider', entityId: '101', action: confirmationAction, page: '1', pageSize: '10',
    });
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(await screen.findByText('Documento página 2')).toBeInTheDocument();
    expect(screen.queryByText('Documento página 1')).not.toBeInTheDocument();
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(await screen.findByText('Documento página 1')).toBeInTheDocument();
    expect(api.auditRequests.every(params => params.get('entityId') === '101')).toBe(true);
  });

  it('shows loading then a legacy link without assigning a responsible person or document', async () => {
    let resolve!: (value: ReturnType<typeof auditPage>) => void;
    mockPeopleApi({ audit: () => new Promise(done => { resolve = done; }) });
    renderUI(<PeopleConfirmationDialog providerId={101} name="Funcionária Alfa" onClose={vi.fn()} />);
    expect(screen.getByText('Carregando confirmações...')).toBeInTheDocument();
    await waitFor(() => expect(resolve).toBeDefined());
    resolve(auditPage([]));
    expect(await screen.findByText(/Vínculos antigos podem não possuir auditoria/)).toBeInTheDocument();
    expect(screen.queryByText(/Responsável pela confirmação/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Próxima' })).not.toBeInTheDocument();
  });

  it('recovers from an API failure by retrying the same person and page', async () => {
    let attempts = 0;
    const api = mockPeopleApi({ audit: params => {
      const page = Number(params.get('page'));
      return page === 2 && ++attempts === 1 ? failedAudit()
        : auditPage([confirmation(101, page, `Documento página ${page}`)], page, 2);
    } });
    const user = userEvent.setup();
    renderUI(<PeopleConfirmationDialog providerId={101} name="Funcionária Alfa" onClose={vi.fn()} />);
    await screen.findByText('Documento página 1');
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível consultar a auditoria');
    expect(screen.queryByText('Documento página 1')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Documento página 2')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.auditRequests).toHaveLength(3);
    expect(Object.fromEntries(api.auditRequests[2])).toEqual(Object.fromEntries(api.auditRequests[1]));
    expect(api.auditRequests[2].get('page')).toBe('2');
  });

  it.each(['button', 'escape'])('closes via %s without a write request', async method => {
    const onClose = vi.fn();
    const api = mockPeopleApi();
    const user = userEvent.setup();
    renderUI(<PeopleConfirmationDialog providerId={101} name="Funcionária Alfa" onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    if (method === 'button') await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    else await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(api.requests.every(request => request.method === 'GET')).toBe(true);
  });
});
