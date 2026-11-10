import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getGetMeQueryKey, type User } from '@workspace/api-client-react';
import { describe, expect, it } from 'vitest';
import AuditLogs from './AuditLogs';
import { admin, auditPage, confirmation, confirmationAction, failedAudit, longDocument, mockPeopleApi, renderUI } from '@/test/peopleFixtures';

describe('AuditLogs People confirmations', () => {
  it('paginates, resets to page one when filtering confirmations and removes the filter again', async () => {
    const api = mockPeopleApi({ audit: params => auditPage(
      [confirmation(101, Number(params.get('page')))], Number(params.get('page')), 2,
    ) });
    const user = userEvent.setup();
    renderUI(<AuditLogs />);
    await screen.findByRole('button', { name: 'Ver confirmação People' });
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(Object.fromEntries(api.auditRequests[0])).toEqual({ page: '1', pageSize: '30' });
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(await screen.findByText('Página 2 de 2 (21 registros)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
    const filter = screen.getByRole('checkbox', { name: 'Somente confirmações de vínculo People' });
    await user.click(filter);
    await waitFor(() => expect(Object.fromEntries(api.auditRequests.at(-1)!)).toEqual({
      page: '1', pageSize: '30', action: confirmationAction, entityType: 'provider',
    }));
    expect(await screen.findByText('Página 1 de 2 (21 registros)')).toBeInTheDocument();
    expect(filter).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(await screen.findByText('Página 2 de 2 (21 registros)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(await screen.findByText('Página 1 de 2 (21 registros)')).toBeInTheDocument();
    await user.click(filter);
    expect(filter).not.toBeChecked();
    await waitFor(() => expect(Object.fromEntries(api.auditRequests.at(-1)!)).toEqual({ page: '1', pageSize: '30' }));
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(Object.fromEntries(api.auditRequests.at(-1)!)).toEqual({ page: '2', pageSize: '30' }));
  });

  it('opens the selected historical confirmation, closes it and shows another without stale details', async () => {
    mockPeopleApi({ audit: () => auditPage([
      confirmation(101, 501, longDocument), confirmation(11, 502, 'Documento Beta'),
      { ...confirmation(20, 503), action: 'UPDATE', newValues: { name: 'Cadastro atualizado' } },
      { ...confirmation(30, 504), entityType: 'user' },
    ]) });
    const user = userEvent.setup();
    renderUI(<AuditLogs />);
    const buttons = await screen.findAllByRole('button', { name: 'Ver confirmação People' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[0]);
    let dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Auditoria #501');
    const document = within(dialog).getByText('Descrição do documento conferido').nextElementSibling!;
    expect(document.textContent).toBe(longDocument);
    expect(dialog).toHaveClass('overflow-y-auto');
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(buttons[1]);
    dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Auditoria #502');
    expect(within(dialog).getByText('Documento Beta')).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('INÍCIO DO DOCUMENTO FICTÍCIO');
    expect(within(dialog).getByText('people-11')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an explicit absence of evidence for a historical confirmation without projection', async () => {
    mockPeopleApi({ audit: () => auditPage([{ ...confirmation(), peopleConfirmation: null }]) });
    renderUI(<AuditLogs />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Ver confirmação People' }));
    expect(within(screen.getByRole('dialog')).getByText(/Não há evidência registrada/)).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByText(/Responsável pela confirmação/)).not.toBeInTheDocument();
  });

  it('shows an empty list without confirmation controls or pagination', async () => {
    mockPeopleApi();
    renderUI(<AuditLogs />);
    expect(await screen.findByText('Nenhum registro encontrado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver confirmação People' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Próxima' })).not.toBeInTheDocument();
  });

  it('retries an API failure while retaining the confirmation filter and page', async () => {
    let filteredAttempts = 0;
    const api = mockPeopleApi({ audit: params => params.has('action') && ++filteredAttempts === 1
      ? failedAudit() : auditPage([confirmation()]),
    });
    const user = userEvent.setup();
    renderUI(<AuditLogs />);
    await screen.findByRole('button', { name: 'Ver confirmação People' });
    await user.click(screen.getByRole('checkbox', { name: 'Somente confirmações de vínculo People' }));
    const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
    expect(screen.getByText(/Não foi possível consultar a auditoria/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver confirmação People' })).not.toBeInTheDocument();
    await user.click(retry);
    expect(await screen.findByRole('button', { name: 'Ver confirmação People' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
    expect(Object.fromEntries(api.auditRequests.at(-1)!)).toEqual({
      page: '1', pageSize: '30', action: confirmationAction, entityType: 'provider',
    });
    expect(filteredAttempts).toBe(2);
  });

  it.each(['gestor', 'funcionario', 'prestador'] as const)('does not fetch audit or expose confirmation controls for %s', async role => {
    const api = mockPeopleApi({ user: { ...admin, role } });
    const { client } = renderUI(<AuditLogs />);
    await waitFor(() => expect(client.getQueryData<User>(getGetMeQueryKey())?.role).toBe(role));
    expect(screen.getByText('Acesso negado. Apenas administradores.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver confirmação People' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.auditRequests).toHaveLength(0);
  });
});
