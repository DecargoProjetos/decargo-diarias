import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildPeopleRows, linkPeopleProviders } from './personIdentity.ts';

const user = { id: 1, decargoId: 'manual-local-pair', email: 'person@test.invalid',
  name: 'Same Name', role: 'gestor', teamId: 9, teamName: 'Team', active: true };
const provider = { ...user, id: 2, dailyRate: 321.45, syncedAt: null };

for (const role of ['admin', 'gestor', 'funcionario', 'prestador']) {
  test(`${role}: one row and unchanged daily rate before and after ID handoff`, () => {
    const before = buildPeopleRows([{ ...user, role }], [provider]);
    const after = buildPeopleRows([{ ...user, role, decargoId: '12345' }], [provider]);
    assert.equal(before.length, 1);
    assert.equal(after.length, 1);
    assert.equal(after[0].dailyRate, 321.45);
    assert.equal(after[0].sourceId, user.id);
    assert.equal(after[0].linkedProviderId, provider.id);
    assert.equal(after[0].tipo, before[0].tipo);
  });
}

test('numeric collision and homonyms stay separate, with no rate assigned to wrong user', () => {
  const rows = buildPeopleRows([{ ...user, decargoId: '123' }],
    [{ ...provider, decargoId: '123', email: 'other@test.invalid' }]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(r => r.key === 'user-1')?.dailyRate, null);
  assert.equal(rows.find(r => r.key === 'user-1')?.linkedProviderId, undefined);
});

for (const reference of [user.decargoId, `local-user:${user.id}`]) {
  test(`People reconciliation keeps one person and the same rate/role via ${reference}`, () => {
    const local = { ...provider, decargoId: reference, active: false };
    const reconciled = { ...local, decargoId: '56789', localReference: reference };
    const before = buildPeopleRows([user], [local]);
    const after = buildPeopleRows([user], [reconciled]);
    assert.equal(before.length, 1);
    assert.equal(after.length, 1);
    assert.equal(after[0].linkedProviderId, provider.id);
    assert.equal(after[0].dailyRate, 321.45);
    assert.equal(after[0].tipo, 'Gestor');
    assert.equal(after[0].localOnly, false);
    assert.equal(after[0].sourceId, user.id);
  });
}

test('a conflicting explicit alias never chooses an arbitrary provider', () => {
  const first = { ...provider, decargoId: 'local-user:1' };
  const second = { ...provider, id: 3, decargoId: '999', localReference: 'local-user:1' };
  assert.equal(linkPeopleProviders([user], [first, second]).size, 0);
  assert.equal(buildPeopleRows([user], [first, second]).length, 3);
});

test('unique email is normalized; missing and duplicate links never guess', () => {
  assert.equal(linkPeopleProviders([user], [{ ...provider, email: ' PERSON@TEST.INVALID ' }]).get(1)?.id, 2);
  assert.equal(buildPeopleRows([user], []).length, 1);
  assert.equal(linkPeopleProviders([user], [{ ...provider, decargoId: '777', email: null }]).size, 0);
  assert.equal(linkPeopleProviders([user], [provider, { ...provider, id: 3, decargoId: '777' }]).size, 0);
  assert.equal(linkPeopleProviders([user, { ...user, id: 3 }], [provider]).size, 0);
});

test('local manual pair without provider email remains linked, but conflicting email does not', () => {
  assert.equal(buildPeopleRows([user], [{ ...provider, email: null }]).length, 1);
  assert.equal(linkPeopleProviders([user], [{ ...provider, email: 'other@test.invalid' }]).size, 0);
  assert.equal(buildPeopleRows([], [provider]).length, 1);
  assert.deepEqual(buildPeopleRows([], []), []);
});

test('synced provider without email joins only after admin confirmation, without replacing its financial row', () => {
  const syncedUser = { ...user, role: 'prestador', decargoId: '90001' };
  const syncedProvider = { ...provider, decargoId: '90002', email: null };
  assert.equal(buildPeopleRows([syncedUser], [syncedProvider]).length, 2);
  const rows = buildPeopleRows([syncedUser], [{ ...syncedProvider, email: user.email }]);
  assert.equal(rows.length, 1);
  // Unified people rows retain the account's edit identity while referencing
  // the same financial provider; matching email does not replace either ID.
  assert.equal(rows[0].key, `user-${user.id}`);
  assert.equal(rows[0].linkedProviderId, provider.id);
  assert.equal(rows[0].decargoId, '90001');
  assert.equal(rows[0].dailyRate, 321.45);
});

test('person rows carry separate versions of access and provider records', () => {
  const [row] = buildPeopleRows(
    [{ ...user, updatedAt: '2026-10-09T12:00:00.000Z' }],
    [{ ...provider, updatedAt: '2026-10-09T12:00:01.000Z' }],
  );
  assert.equal(row.updatedAt, '2026-10-09T12:00:00.000Z');
  assert.equal(row.linkedProviderUpdatedAt, '2026-10-09T12:00:01.000Z');
});

test('an explicit local provider cannot also be claimed by another email-matched account', () => {
  const local = { ...provider, decargoId: `local-user:${user.id}` };
  const links = linkPeopleProviders(
    [user, { ...user, id: 99, decargoId: 'unrelated', email: user.email }], [local],
  );
  assert.equal(links.get(user.id)?.id, local.id);
  assert.equal(links.has(99), false);
});
