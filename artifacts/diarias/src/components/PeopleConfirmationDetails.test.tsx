import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AuditLog } from '@workspace/api-client-react';
import { PeopleConfirmationDetails } from './PeopleConfirmationDetails';

const historicalLabel = 'Responsável pela confirmação — nome na época';
const currentLabel = 'Nome atual no cadastro de usuários';
const historicalName = 'Responsável na confirmação';
const currentName = 'Responsável após alteração';
const explanation = 'O nome atual é consultado no cadastro de usuários e não substitui um nome histórico ausente.';

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 101,
    entityType: 'provider',
    entityId: 202,
    action: 'identidade People reconciliada',
    userId: 42,
    userName: currentName,
    timestamp: '2026-10-09T12:00:00.000Z',
    peopleConfirmation: {
      confirmedByName: historicalName,
      externalId: 'people-fixture',
      verifiedCnpj: '12345678000190',
      documentDescription: 'Documento conferido para o teste',
      preservedProvider: { id: 202, name: 'Pessoa preservada', decargoId: 'people-fixture' },
      removedProvider: null,
    },
    ...overrides,
  };
}

// Read each rendered value with its label, rather than searching names anywhere
// in the markup (which would miss swapped fields or inferred historical names).
function definition(markup: string, label: string): string {
  const definitions = [...markup.matchAll(/<dt>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)];
  const matches = definitions.filter(([, term]) => term === label);
  expect(matches, `campo renderizado: ${label}`).toHaveLength(1);
  return matches[0][2];
}

describe('PeopleConfirmationDetails — nome histórico e nome atual', () => {
  it('exibe nomes diferentes sob os rótulos corretos, sem trocar o histórico pelo atual', () => {
    const markup = renderToStaticMarkup(<PeopleConfirmationDetails log={makeLog()} />);

    expect(definition(markup, historicalLabel)).toBe(`${historicalName} — usuário #42`);
    expect(definition(markup, currentLabel)).toBe(currentName);
    expect(definition(markup, historicalLabel)).not.toContain(currentName);
    expect(definition(markup, currentLabel)).not.toContain(historicalName);
    expect(markup).toContain(explanation);
  });

  it.each([null, undefined])('mantém o nome histórico e o ID quando o nome atual é %s', userName => {
    const markup = renderToStaticMarkup(
      <PeopleConfirmationDetails log={makeLog({ userName })} />,
    );

    expect(definition(markup, historicalLabel)).toBe(`${historicalName} — usuário #42`);
    expect(definition(markup, currentLabel)).toBe('Nome atual não disponível');
    expect(definition(markup, currentLabel)).not.toContain(historicalName);
    expect(markup).not.toContain(currentName);
  });

  it('não preenche o nome histórico de um registro legado com o nome atual disponível', () => {
    const log = makeLog();
    log.peopleConfirmation = { ...log.peopleConfirmation!, confirmedByName: null };
    const markup = renderToStaticMarkup(<PeopleConfirmationDetails log={log} />);

    expect(definition(markup, historicalLabel)).toBe('Nome histórico não registrado — usuário #42');
    expect(definition(markup, historicalLabel)).not.toContain(currentName);
    expect(definition(markup, currentLabel)).toBe(currentName);
    expect(markup).not.toContain(historicalName);
    expect(markup).toContain(explanation);
  });

  it.each([null, undefined])('mostra apenas a ausência de evidência quando a confirmação é %s', peopleConfirmation => {
    const markup = renderToStaticMarkup(
      <PeopleConfirmationDetails log={makeLog({ peopleConfirmation })} />,
    );

    expect(markup).toMatch(/^<p[^>]*>Não há evidência registrada de confirmação deste vínculo People\.<\/p>$/);
    expect(markup).not.toContain('<dl');
    expect(markup).not.toContain(historicalLabel);
    expect(markup).not.toContain(currentLabel);
    expect(markup).not.toContain(currentName);
    expect(markup).not.toContain(historicalName);
    expect(markup).not.toContain('usuário #42');
  });
});
