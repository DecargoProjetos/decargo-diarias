import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PeopleConfirmationDetails } from './PeopleConfirmationDetails';
import { confirmation, longDocument } from '@/test/peopleFixtures';
import { formatDateTime } from '@/lib/utils';

describe('PeopleConfirmationDetails — documentary evidence', () => {
  it('shows recorded identities, actor, date and formatted CNPJ, not current person data', () => {
    const log = confirmation();
    log.userName = 'Nome atual fictício';
    render(<PeopleConfirmationDetails log={log} />);
    expect(screen.getByText('Responsável fictício — usuário #900')).toBeInTheDocument();
    expect(screen.getByText('Nome atual fictício')).toBeInTheDocument();
    expect(screen.getByText(formatDateTime(log.timestamp))).toBeInTheDocument();
    expect(screen.getByText('people-101')).toBeInTheDocument();
    expect(screen.getByText('12.345.678/0001-90')).toBeInTheDocument();
    expect(screen.getByText('#101 — Cadastro histórico 101 (DECARGO ID: people-101)')).toBeInTheDocument();
    expect(screen.getByText('#1101 — Cadastro retirado fictício (DECARGO ID: manual-test)')).toBeInTheDocument();
  });

  it('keeps the entire long document, line breaks and wrapping without truncation', () => {
    render(<PeopleConfirmationDetails log={confirmation(101, 501, longDocument)} />);
    const document = screen.getByText('Descrição do documento conferido').nextElementSibling!;
    expect(document.textContent).toBe(longDocument);
    expect(document).toHaveClass('whitespace-pre-wrap');
    expect(document.closest('dl')).toHaveClass('[&_dd]:break-words');
    expect(document).not.toHaveClass('truncate');
  });

  it('does not invent evidence when the audit projection is absent', () => {
    render(<PeopleConfirmationDetails log={{ ...confirmation(), peopleConfirmation: null }} />);
    expect(screen.getByText(/Não há evidência registrada/)).toBeInTheDocument();
    expect(screen.queryByText('Responsável pela confirmação — nome na época')).not.toBeInTheDocument();
    expect(screen.queryByText('CNPJ verificado')).not.toBeInTheDocument();
  });

  it('labels missing historical fields and an absent removed record explicitly', () => {
    const log = confirmation();
    log.userName = null;
    log.userId = null;
    log.peopleConfirmation = {
      confirmedByName: null, externalId: null, verifiedCnpj: null, documentDescription: null,
      preservedProvider: null, removedProvider: null,
    };
    render(<PeopleConfirmationDetails log={log} />);
    expect(screen.getByText('Nome histórico não registrado')).toBeInTheDocument();
    expect(screen.getByText('Nome atual não disponível')).toBeInTheDocument();
    expect(screen.getByText('Não registrada')).toBeInTheDocument();
    expect(screen.getAllByText('Não registrado')).toHaveLength(2);
    expect(screen.getByText('Não há evidência documental registrada.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum cadastro retirado nesta confirmação.')).toBeInTheDocument();
  });
});
