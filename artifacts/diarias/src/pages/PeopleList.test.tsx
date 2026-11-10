import { act, screen, waitFor, within } from '@testing-library/react';
import { getGetMeQueryKey, type User } from '@workspace/api-client-react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import PeopleList from './PeopleList';
import { admin, auditPage, confirmation, mockPeopleApi, renderUI } from '@/test/peopleFixtures';

const personRow = (name: string) => screen.getByText(name).closest('tr')!;
const openPerson = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  // Wait for the linked row and accessible controls, not only the person's name.
  const button = await waitFor(() =>
    within(personRow(name)).getByRole('button', { name: 'Confirmação People' }));
  await user.click(button);
};

describe('PeopleList confirmation navigation', () => {
  it('uses linkedProviderId for a user, standalone provider ID for another person, and resets the page on reopen', async () => {
    const api = mockPeopleApi({ audit: params => {
      const id = Number(params.get('entityId'));
      const page = Number(params.get('page'));
      return auditPage([confirmation(id, page, `Documento ${id} página ${page}`)], page, 2);
    } });
    const user = userEvent.setup();
    renderUI(<PeopleList />);
    await screen.findByText('Funcionária Alfa');
    expect(screen.queryByText('Cadastro vinculado Alfa')).not.toBeInTheDocument();
    expect(within(personRow('Funcionário sem diárias')).queryByRole('button', { name: 'Confirmação People' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Confirmação People' })).toHaveLength(2);

    await openPerson(user, 'Funcionária Alfa');
    expect(await screen.findByText('Documento 101 página 1')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Funcionária Alfa — cadastro de diárias #101');
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(await screen.findByText('Documento 101 página 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openPerson(user, 'Prestador Beta');
    expect(await screen.findByText('Documento 11 página 1')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Prestador Beta — cadastro de diárias #11');
    expect(screen.queryByText('Documento 101 página 2')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(Object.fromEntries(api.auditRequests.at(-1)!)).toMatchObject({ entityId: '11', page: '1' });
    await user.keyboard('{Escape}');

    await openPerson(user, 'Funcionária Alfa');
    expect(await screen.findByText('Documento 101 página 1')).toBeInTheDocument();
    expect(screen.queryByText('Documento 11 página 1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does not show a late response for the closed person in the newly opened dialog', async () => {
    let resolveAlfa!: (value: ReturnType<typeof auditPage>) => void;
    mockPeopleApi({ audit: params => params.get('entityId') === '101'
      ? new Promise(done => { resolveAlfa = done; })
      : auditPage([confirmation(11, 502, 'Documento Beta')]),
    });
    const user = userEvent.setup();
    renderUI(<PeopleList />);
    await screen.findByText('Funcionária Alfa');
    await openPerson(user, 'Funcionária Alfa');
    await waitFor(() => expect(resolveAlfa).toBeDefined());
    expect(screen.getByText('Carregando confirmações...')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await openPerson(user, 'Prestador Beta');
    expect(await screen.findByText('Documento Beta')).toBeInTheDocument();
    await act(async () => {
      resolveAlfa(auditPage([confirmation(101, 501, 'Documento Alfa atrasado')]));
      // Flush the late HTTP response and React Query's notification, not just
      // the already-rendered Beta content.
      await new Promise(done => setTimeout(done, 0));
    });
    expect(screen.getByRole('dialog')).toHaveTextContent('Documento Beta');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('Documento Alfa atrasado');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('cadastro de diárias #101');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each(['gestor', 'funcionario', 'prestador'] as const)('hides admin confirmation and reconciliation controls for %s', async role => {
    const api = mockPeopleApi({ user: { ...admin, role } });
    const { client } = renderUI(<PeopleList />);
    // The loading branch also says "access denied"; wait for the actual role.
    await waitFor(() => expect(client.getQueryData<User>(getGetMeQueryKey())?.role).toBe(role));
    expect(screen.getByText('Acesso negado. Apenas administradores.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmação People' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revisar vínculos People' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sincronizar com DECARGO People' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.auditRequests).toHaveLength(0);
    expect(api.requests.some(request => request.path === '/api/users')).toBe(false);
  });
});
