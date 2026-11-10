import { test, expect, type Page, type Locator } from '@playwright/test';
import { isolateCorrection } from './correction-browser-safety';

const candidates = {
  '201': { name: 'Prestador exclusivamente sintético', peopleId: '2147483647', cnpj: '12.345.678/0001-90' },
  '202': { name: 'Prestador exclusivamente sintético', peopleId: '2147483646', cnpj: '98.765.432/0001-10' },
  '203': { name: 'Prestador sintético intermediário', peopleId: '2147483645', cnpj: '11.222.333/0001-44' },
  '204': { name: 'Prestador sintético final', peopleId: '2147483644', cnpj: '55.666.777/0001-88' },
} as const;

async function selectedIdentity(page: Page, select: Locator, id: keyof typeof candidates, group = 101) {
  const candidate = candidates[id];
  await expect(select).toHaveValue(id);
  await expect(select.locator('option:checked')).toContainText(`${candidate.name}`);
  await expect(select.locator('option:checked')).toContainText(`ID People ${candidate.peopleId} · CNPJ ${candidate.cnpj}`);
  const detail = page.getByTestId(`text-correction-provider-${group}`);
  await expect(detail).toContainText(`Prestador selecionado: ${candidate.name}`);
  await expect(detail).toContainText(`ID People ${candidate.peopleId} · CNPJ ${candidate.cnpj}`);
}

async function focused(page: Page, target: Locator) {
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
  // Keyboard focus must bring the entire input/button into the scroll viewport.
  // Native keyboard scrolling can finish after focus changes (notably in
  // Firefox/WebKit). Observe it without manually scrolling the control.
  await expect.poll(() => target.evaluate(el => {
    const bounds = el.getBoundingClientRect();
    const dialog = el.closest('[role="dialog"]')!.getBoundingClientRect();
    return {
      above: bounds.top < dialog.top - 1,
      below: bounds.bottom > dialog.bottom + 1,
    };
  }), { message: `Focused ${await target.getAttribute('data-testid') ?? 'control'} must be fully inside the dialog` })
    .toEqual({ above: false, below: false });
}

test('already-correct batch blocks saving even with consent and after restoring the original type', async ({ page, baseURL }) => {
  const assertSafe = await isolateCorrection(page, baseURL!);
  try {
    await page.goto('tests/browser/export-correction.html?scenario=unchanged');
    const original = await page.evaluate(() => (window as any).correctionTestPreview);
    expect(original.rows.map((row: { id: number }) => row.id)).toEqual([1201, 1202, 1203, 1204, 1205, 1206]);
    expect(original.skipped).toEqual([]);
    expect(original.rows.every((row: { providerId: number; providerDecargoId: string; typeId: number; exportTarget: string }) =>
      [201, 202].includes(row.providerId)
      && row.providerDecargoId === candidates[String(row.providerId) as '201' | '202'].peopleId
      && row.typeId === 32 && row.exportTarget === 'diarias')).toBe(true);

    await page.getByTestId('button-open-export-correction').click();
    const type = page.getByTestId('select-correction-type');
    const reason = page.getByTestId('input-correction-reason');
    const consent = page.getByTestId('checkbox-correction-confirm');
    const summary = page.getByTestId('text-correction-summary');
    const save = page.getByTestId('button-save-correction');
    const explanation = 'Lote sintetico ja correto, sem necessidade de alteracao.';
    for (const group of [201, 202] as const) {
      await selectedIdentity(page, page.getByTestId(`select-correction-provider-${group}`), String(group) as '201' | '202', group);
      await expect(page.getByTestId(`input-correction-cnpj-${group}`)).toHaveCount(0);
    }
    await expect(type).toHaveValue('32');
    await expect(summary).toHaveText(/0 registro\(s\) serão alterados.*6 permanecerão/);
    await expect(save).toBeDisabled();
    await reason.fill(explanation);
    await consent.check();
    await expect(consent).toBeChecked();
    await expect(summary).toHaveText(/0 registro\(s\) serão alterados.*6 permanecerão/);
    await expect(save).toBeDisabled();
    await assertSafe(0);

    // Prove the form is otherwise valid, then recompute back to zero.
    await type.selectOption('33');
    await expect(summary).toHaveText(/6 registro\(s\) serão alterados.*0 permanecerão/);
    await expect(consent).not.toBeChecked();
    await expect(save).toBeDisabled();
    await consent.check();
    await expect(save).toBeEnabled();
    await assertSafe(0);

    await type.selectOption('32');
    await expect(summary).toHaveText(/0 registro\(s\) serão alterados.*6 permanecerão/);
    await expect(consent).not.toBeChecked();
    await expect(save).toBeDisabled();
    await expect(reason).toHaveValue(explanation);
    await consent.check();
    await expect(consent).toBeChecked();
    await expect(save).toBeDisabled();
    // Native activation of a disabled button must not submit or close.
    await save.evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.getByRole('dialog')).toBeVisible();
    const evidence = await page.evaluate(() => ({
      traffic: (window as any).correctionTestTraffic,
      preview: (window as any).correctionTestPreview,
    }));
    expect(evidence.preview).toEqual(original);
    expect(evidence.traffic.requests).toEqual([{
      method: 'POST', path: '/api/diarias/export/correction/preview',
      body: { diariaIds: original.rows.map((row: { id: number }) => row.id) },
    }]);
    expect(evidence.traffic.receipts).toEqual([]);
  } finally {
    await assertSafe(0);
  }
});

for (const finalType of ['32', '33'] as const) {
  test(`mixed batch ignores repeated save clicks while type ${finalType} response is pending`, async ({ page, baseURL }) => {
    const assertSafe = await isolateCorrection(page, baseURL!);
    try {
      await page.goto('tests/browser/export-correction.html?scenario=mixed&receipt=reordered&saveResponse=manual');
      const original = await page.evaluate(() => (window as any).correctionTestPreview);
      await page.getByTestId('button-open-export-correction').click();
      await page.getByTestId('select-correction-type').selectOption(finalType);
      await page.getByTestId('select-correction-provider-101').selectOption('201');
      await page.getByTestId('input-correction-cnpj-101').fill('12345678000190');
      const reason = 'Cliques repetidos durante resposta exclusivamente local.';
      await page.getByTestId('input-correction-reason').fill(reason);
      await page.getByTestId('checkbox-correction-confirm').check();
      const save = page.getByTestId('button-save-correction');
      await expect(save).toBeEnabled();
      await assertSafe(0, 0);
      await page.clock.install();
      await save.click();

      await expect(save).toBeDisabled();
      await expect(page.getByRole('dialog')).toBeVisible();
      await assertSafe(1, 0);
      expect(await page.evaluate(() => (window as any).correctionTestTraffic.receipts)).toEqual([]);
      // Real pointer attempts must reach the disabled button, rather than
      // Playwright waiting for it to become enabled and clicking after release.
      await save.scrollIntoViewIfNeeded();
      const bounds = await save.boundingBox();
      expect(bounds).not.toBeNull();
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
        // Native programmatic activation must also honor disabled semantics.
        await save.evaluate((button: HTMLButtonElement) => button.click());
        await expect(save).toBeDisabled();
        await expect(page.getByRole('dialog')).toBeVisible();
        await assertSafe(1, 0);
      }
      await page.clock.fastForward(1_000);
      await expect(save).toBeDisabled();
      await assertSafe(1, 0);
      expect(await page.evaluate(() => (window as any).correctionTestTraffic.receipts)).toEqual([]);

      await page.evaluate(() => (window as any).releaseCorrectionSaveResponse());
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByTestId('button-open-export-correction')).toBeFocused();
      await assertSafe(1, 1);
      await page.clock.fastForward(30_000);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await assertSafe(1, 1);
      const evidence = await page.evaluate(() => ({
        traffic: (window as any).correctionTestTraffic,
        preview: (window as any).correctionTestPreview,
      }));
      expect(evidence.preview).toEqual(original);
      expect(evidence.traffic.requests).toEqual([
        {
          method: 'POST', path: '/api/diarias/export/correction/preview',
          body: { diariaIds: [...original.rows.map((row: { id: number }) => row.id), 2001] },
        },
        {
          method: 'POST', path: '/api/diarias/export/correction',
          body: {
            confirmed: true, reason,
            corrections: original.rows.map((row: { id: number; providerId: number; typeId: number; updatedAt: string; providerDecargoId: string }) => ({
              id: row.id, expectedProviderId: row.providerId, expectedTypeId: row.typeId,
              expectedUpdatedAt: row.updatedAt, expectedProviderDecargoId: row.providerDecargoId,
              expectedPeopleId: candidates['201'].peopleId, providerId: 201, typeId: Number(finalType),
              ...(row.providerId === 101 ? { verifiedCnpj: '12345678000190' } : {}),
            })),
          },
        },
      ]);
      expect(evidence.traffic.receipts).toEqual([finalType === '32' ? {
        correctedIds: [1107, 1106, 1105], unchangedIds: [1104, 1103, 1102, 1101],
      } : {
        correctedIds: [1107, 1106, 1104, 1103, 1102, 1101], unchangedIds: [1105],
      }]);
    } finally {
      await assertSafe(1, 1);
    }
  });

  test(`mixed batch accepts exact reordered receipt sets for type ${finalType} without resubmission`, async ({ page, baseURL }) => {
    const assertSafe = await isolateCorrection(page, baseURL!);
    try {
      await page.goto('tests/browser/export-correction.html?scenario=mixed&receipt=reordered');
      const original = await page.evaluate(() => (window as any).correctionTestPreview);
      expect(original.rows.map((row: { id: number }) => row.id)).toEqual([1101, 1102, 1103, 1104, 1105, 1106, 1107]);
      await page.getByTestId('button-open-export-correction').click();
      const type = page.getByTestId('select-correction-type');
      const consent = page.getByTestId('checkbox-correction-confirm');
      const summary = page.getByTestId('text-correction-summary');
      const save = page.getByTestId('button-save-correction');
      const reason = 'Lote misto exclusivamente sintetico, sem alterar cadastros.';
      // Provider 201 is already integrated and must stay selected without
      // requiring a document for an unchanged link.
      await expect(page.getByTestId('select-correction-provider-201')).toHaveValue('201');
      await expect(page.getByTestId('input-correction-cnpj-201')).toHaveCount(0);
      await expect(type).toHaveValue(''); // Mixed original types require a choice.
      await type.selectOption('32');
      // The legacy group starts unselected; only an explicit choice links it.
      await expect(page.getByTestId('select-correction-provider-101')).toHaveValue('');
      await page.getByTestId('select-correction-provider-101').selectOption('201');
      await page.getByTestId('input-correction-cnpj-101').fill('12345678000190');
      await page.getByTestId('input-correction-reason').fill(reason);
      await expect(summary).toHaveText(/3 registro\(s\) serão alterados.*4 permanecerão/);
      await expect(save).toBeDisabled();
      await consent.check();
      await expect(save).toBeEnabled();
      await assertSafe(0);

      // Changing type affects the already-correct provider group as well.
      // Returning to 32 must recompute, not accumulate, changes.
      for (const [id, changed, unchanged] of [
        ['33', 6, 1], ['32', 3, 4],
        ...(finalType === '33' ? [['33', 6, 1] as const] : []),
      ] as const) {
        await type.selectOption(id);
        await expect(consent).not.toBeChecked();
        await expect(save).toBeDisabled();
        await expect(summary).toHaveText(new RegExp(`${changed} registro\\(s\\) serão alterados.*${unchanged} permanecerão`));
        for (const group of [201, 101]) {
          await selectedIdentity(page, page.getByTestId(`select-correction-provider-${group}`), '201', group);
        }
        await expect(page.getByTestId('input-correction-cnpj-201')).toHaveCount(0);
        await expect(page.getByTestId('input-correction-cnpj-101')).toHaveValue('12345678000190');
        await expect(page.getByTestId('input-correction-reason')).toHaveValue(reason);
        await assertSafe(0);
        await consent.check();
        await expect(save).toBeEnabled();
      }
      await expect(type).toHaveValue(finalType);
      await page.clock.install();
      await save.click();
      // Closing and onDone prove the real dialog accepted both receipt sets.
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByTestId('button-open-export-correction')).toBeFocused();
      await assertSafe(1, 1);
      // A valid but reordered receipt must not cause a delayed retry or callback.
      await page.clock.fastForward(30_000);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await assertSafe(1, 1);
      const evidence = await page.evaluate(() => ({
        traffic: (window as any).correctionTestTraffic,
        providers: (window as any).correctionTestPreview.providers,
      }));
      expect(evidence.providers).toEqual(original.providers);
      const saves = evidence.traffic.requests.filter((r: { path: string }) => r.path === '/api/diarias/export/correction');
      expect(saves).toHaveLength(1);
      expect(saves[0].body).toEqual({
        confirmed: true, reason,
        corrections: original.rows.map((row: { id: number; providerId: number; typeId: number; updatedAt: string; providerDecargoId: string }) => ({
          id: row.id, expectedProviderId: row.providerId, expectedTypeId: row.typeId,
          expectedUpdatedAt: row.updatedAt, expectedProviderDecargoId: row.providerDecargoId,
          expectedPeopleId: candidates['201'].peopleId, providerId: 201, typeId: Number(finalType),
          ...(row.providerId === 101 ? { verifiedCnpj: '12345678000190' } : {}),
        })),
      });
      expect(evidence.traffic.receipts).toEqual([finalType === '32' ? {
        correctedIds: [1107, 1106, 1105], unchangedIds: [1104, 1103, 1102, 1101],
      } : {
        correctedIds: [1107, 1106, 1104, 1103, 1102, 1101], unchangedIds: [1105],
      }]);
      // Check membership independently from the explicit response order above.
      // In particular, the request must remain in its original order.
      const corrections = saves[0].body.corrections;
      for (const [key, changed] of [['correctedIds', true], ['unchangedIds', false]] as const) {
        const expected = corrections.filter((correction: { id: number; providerId: number; typeId: number }) => {
          const row = original.rows.find((row: { id: number }) => row.id === correction.id);
          return (row.providerId !== correction.providerId || row.typeId !== correction.typeId) === changed;
        }).map((correction: { id: number }) => correction.id);
        const actual = evidence.traffic.receipts[0][key];
        expect([...actual].sort((a: number, b: number) => a - b)).toEqual(expected);
        if (expected.length > 1) expect(actual).not.toEqual(expected);
      }
    } finally {
      await assertSafe(1);
    }
  });
}

for (const invalid of [
  { kind: 'swapped', correctedIds: [1101, 1106, 1107], unchangedIds: [1105, 1102, 1103, 1104] },
  { kind: 'duplicate-corrected', correctedIds: [1105, 1105, 1107], unchangedIds: [1101, 1102, 1103, 1104] },
  { kind: 'duplicate-unchanged', correctedIds: [1105, 1106, 1107], unchangedIds: [1101, 1101, 1103, 1104] },
  { kind: 'omitted-corrected', correctedIds: [1105, 1106], unchangedIds: [1101, 1102, 1103, 1104] },
  { kind: 'omitted-unchanged', correctedIds: [1105, 1106, 1107], unchangedIds: [1101, 1102, 1103] },
  { kind: 'unknown-corrected', externalId: 9999, correctedIds: [9999, 1106, 1107], unchangedIds: [1101, 1102, 1103, 1104] },
  { kind: 'unknown-unchanged', externalId: 9999, correctedIds: [1105, 1106, 1107], unchangedIds: [9999, 1102, 1103, 1104] },
  { kind: 'skipped-corrected', externalId: 2001, correctedIds: [2001, 1106, 1107], unchangedIds: [1101, 1102, 1103, 1104] },
  { kind: 'skipped-unchanged', externalId: 2001, correctedIds: [1105, 1106, 1107], unchangedIds: [2001, 1102, 1103, 1104] },
] as const) {
  test(`mixed batch rejects ${invalid.kind} receipt without success or automatic resubmission`, async ({ page, baseURL }) => {
    const assertSafe = await isolateCorrection(page, baseURL!);
    try {
      await page.goto(`tests/browser/export-correction.html?scenario=mixed&receipt=${invalid.kind}`);
      if ('externalId' in invalid) {
        const preview = await page.evaluate(() => (window as any).correctionTestPreview);
        expect(preview.rows.map((row: { id: number }) => row.id)).not.toContain(invalid.externalId);
        expect(preview.skipped.map((row: { id: number }) => row.id)).toEqual([2001]);
        // Preserve both counts: only exact membership can reject this receipt.
        expect(invalid.correctedIds).toHaveLength(3);
        expect(invalid.unchangedIds).toHaveLength(4);
        expect(new Set([...invalid.correctedIds, ...invalid.unchangedIds]).size).toBe(7);
      }
      await page.getByTestId('button-open-export-correction').click();
      await page.getByTestId('select-correction-type').selectOption('32');
      await page.getByTestId('select-correction-provider-101').selectOption('201');
      await page.getByTestId('input-correction-cnpj-101').fill('12345678000190');
      await page.getByTestId('input-correction-reason').fill('Recibo misto invalido exclusivamente sintetico.');
      await expect(page.getByTestId('text-correction-summary'))
        .toHaveText(/3 registro\(s\) serão alterados.*4 permanecerão/);
      await page.getByTestId('checkbox-correction-confirm').check();
      const save = page.getByTestId('button-save-correction');
      await expect(save).toBeEnabled();
      await assertSafe(0);
      await page.clock.install();
      await save.click();

      const assertUnconfirmed = async () => {
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByRole('alert')).toHaveText(
          'Não foi possível confirmar o resultado da correção. Atualize a conferência antes de tentar novamente.',
        );
        await expect(save).toBeDisabled();
        await expect(page.getByTestId('button-refresh-correction')).toBeVisible();
        // A rejected receipt must not call onDone, even though one POST ran.
        await assertSafe(1, 0);
      };
      await assertUnconfirmed();
      // Advance a bounded retry window without issuing another user action.
      await page.clock.fastForward(30_000);
      await assertUnconfirmed();
      const traffic = await page.evaluate(() => (window as any).correctionTestTraffic);
      expect(traffic.receipts).toEqual([{
        correctedIds: [...invalid.correctedIds], unchangedIds: [...invalid.unchangedIds],
      }]);
      expect(traffic.requests.map((r: { path: string }) => r.path)).toEqual([
        '/api/diarias/export/correction/preview', '/api/diarias/export/correction',
      ]);
      expect(traffic.requests[0].body.diariaIds).toEqual([1101, 1102, 1103, 1104, 1105, 1106, 1107, 2001]);
      const corrections = traffic.requests[1].body.corrections;
      expect(corrections).toHaveLength(7);
      expect(corrections.map((row: { id: number }) => row.id)).toEqual([1101, 1102, 1103, 1104, 1105, 1106, 1107]);
      expect(corrections.every((row: { providerId: number; typeId: number }) =>
        row.providerId === 201 && row.typeId === 32)).toBe(true);
    } finally {
      await assertSafe(1, 0);
    }
  });
}

for (const filter of [
  { label: 'name', matching: 'exclusivamente sintético', excluding: 'intermediário', alternative: '203' },
  { label: 'People ID', matching: candidates['201'].peopleId, excluding: candidates['202'].peopleId, alternative: '202' },
  { label: 'CNPJ', matching: candidates['201'].cnpj, excluding: candidates['202'].cnpj.replace(/\D/g, ''), alternative: '202' },
] as const) {
  test(`search by ${filter.label} preserves the verified provider until an explicit homonym change`, async ({ page, baseURL }) => {
    const assertSafe = await isolateCorrection(page, baseURL!);
    try {
      await page.goto('tests/browser/export-correction.html');
      await page.getByTestId('button-open-export-correction').click();
      const select = page.getByTestId('select-correction-provider-101');
      const search = page.getByTestId('input-correction-search');
      const cnpj = page.getByTestId('input-correction-cnpj-101');
      const consent = page.getByRole('checkbox', { name: /Conferi o ID do People/ });
      const save = page.getByTestId('button-save-correction');
      const summary = page.getByTestId('text-correction-summary');
      const optionValues = () => select.locator('option').evaluateAll(options =>
        options.map(option => (option as HTMLOptionElement).value));
      // The default preview has multiple extra-payment types; search tests
      // must choose one explicitly before checking save authorization.
      await page.getByTestId('select-correction-type').selectOption('32');
      for (let group = 101; group <= 108; group++) {
        await page.getByTestId(`select-correction-provider-${group}`).selectOption(group === 101 ? '201' : '204');
        await page.getByTestId(`input-correction-cnpj-${group}`).fill(group === 101 ? '12345678000190' : '55666777000188');
      }
      await page.getByTestId('input-correction-reason').fill('Busca e conferencia exclusivamente sinteticas.');
      await consent.check();
      const assertPreserved = async (id: '201' | '202') => {
        await selectedIdentity(page, select, id);
        await expect(cnpj).toHaveValue(candidates[id].cnpj.replace(/\D/g, ''));
        await expect(consent).toBeChecked();
        await expect(save).toBeEnabled();
        await expect(summary).toHaveText(/24 registro\(s\) serão alterados.*0 permanecerão/);
        // The global search must not change another group's verified person.
        await selectedIdentity(page, page.getByTestId('select-correction-provider-108'), '204', 108);
        await expect(page.getByTestId('input-correction-cnpj-108')).toHaveValue('55666777000188');
      };
      await assertPreserved('201');
      await search.fill(filter.matching);
      await expect.poll(optionValues).toEqual(filter.label === 'name' ? ['', '201', '202'] : ['', '201']);
      await assertPreserved('201');
      // A non-matching selection remains pinned, ahead of the matching options.
      await search.fill(filter.excluding);
      await expect.poll(optionValues).toEqual(['', '201', filter.alternative]);
      await assertPreserved('201');
      await search.fill('nenhum-prestador-sintetico-encontrado');
      await expect.poll(optionValues).toEqual(['', '201']);
      await assertPreserved('201');
      await search.clear();
      await expect.poll(optionValues).toEqual(['', '201', '202', '203', '204']);
      await assertPreserved('201');
      // An actual choice, unlike filtering, must invalidate the old conference.
      await select.selectOption('202');
      await selectedIdentity(page, select, '202');
      await expect(cnpj).toHaveValue('');
      await expect(consent).not.toBeChecked();
      await expect(save).toBeDisabled();
      await cnpj.fill(candidates['201'].cnpj.replace(/\D/g, ''));
      await consent.check();
      await expect(save).toBeDisabled(); // The homonym's old document cannot authorize the new person.
      await cnpj.fill(candidates['202'].cnpj.replace(/\D/g, ''));
      await expect(consent).not.toBeChecked();
      await expect(save).toBeDisabled();
      await consent.check();
      await expect(save).toBeEnabled();
      await assertPreserved('202');
      // Save while no alternative matches: the payload must use the explicit
      // choice, not the filter, the old homonym, or a native-select fallback.
      await search.fill('nenhum-prestador-sintetico-encontrado');
      await expect.poll(optionValues).toEqual(['', '202']);
      await assertPreserved('202');
      await save.click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const saves = await page.evaluate(() => (window as any).correctionTestTraffic.requests
        .filter((request: { path: string }) => request.path === '/api/diarias/export/correction'));
      expect(saves).toHaveLength(1);
      expect(saves[0].body.confirmed).toBe(true);
      expect(saves[0].body.corrections).toEqual(Array.from({ length: 24 }, (_, i) => {
        const candidate = candidates[i < 3 ? '202' : '204'];
        return expect.objectContaining({
          id: 1001 + i,
          providerId: i < 3 ? 202 : 204,
          expectedPeopleId: candidate.peopleId,
          verifiedCnpj: candidate.cnpj.replace(/\D/g, ''),
          expectedProviderId: 101 + Math.floor(i / 3),
        });
      }));
    } finally {
      await assertSafe(1);
    }
  });
}

test('long synthetic groups remain readable and the whole correction is keyboard accessible', async ({ page, baseURL }, testInfo) => {
  const assertSafe = await isolateCorrection(page, baseURL!);
  await page.goto('tests/browser/export-correction.html');
  const opener = page.getByTestId('button-open-export-correction');
  const dialog = page.getByRole('dialog');
  try {
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toBeFocused();
    await expect(page.getByTestId('group-correction-108')).toHaveCount(1);
    await expect(dialog).toHaveAccessibleName('Corrigir prestador e tipo de pagamento extra');
    await expect(dialog).toHaveAccessibleDescription(/Valores, datas, equipe e autoria são preservados/);
    await expect(dialog).toHaveAccessibleDescription(/não são exportados/);
    await page.keyboard.press('Tab');
    const skipped = dialog.locator('summary');
    await focused(page, skipped);
    await page.keyboard.press('Enter');
    await expect(dialog.getByText(/esta correção nunca libera bloqueios/)).toBeVisible();
    await page.keyboard.press('Tab');
    await focused(page, page.getByTestId('select-correction-type'));
    await expect(page.getByTestId('select-correction-type')).toHaveValue('');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('select-correction-type')).toHaveValue('32');
    await page.keyboard.press('Tab'); // search
    await focused(page, page.getByTestId('input-correction-search'));
    for (let id = 101; id <= 108; id++) {
      await page.keyboard.press('Tab');
      const select = page.getByTestId(`select-correction-provider-${id}`);
      await focused(page, select);
      // A closed native select commits arrow/Home/End changes immediately.
      // Enter would reopen its popup, consuming the following Tab.
      if (id === 101) {
        const cnpj = page.getByTestId('input-correction-cnpj-101');
        const consent = page.getByRole('checkbox', { name: /Conferi o ID do People/ });
        await page.keyboard.press('Home');
        await expect(select).toHaveValue('');
        await page.keyboard.press('ArrowDown');
        await selectedIdentity(page, select, '201');
        await page.keyboard.press('ArrowDown');
        await selectedIdentity(page, select, '202'); // Same name, different person.
        await page.keyboard.press('ArrowUp');
        await selectedIdentity(page, select, '201');
        await cnpj.fill('12345678000190');
        await consent.check();
        await expect(consent).toBeChecked();
        await select.focus();
        await page.keyboard.press('ArrowDown');
        await selectedIdentity(page, select, '202');
        await expect(cnpj).toHaveValue('');
        await expect(consent).not.toBeChecked();
        await expect(page.getByTestId('button-save-correction')).toBeDisabled();
        await cnpj.fill('98765432000110');
        await consent.check();
        await select.focus();
        await page.keyboard.press('End');
        await selectedIdentity(page, select, '204');
        await expect(cnpj).toHaveValue('');
        await expect(consent).not.toBeChecked();
        await page.keyboard.press('ArrowUp');
        await selectedIdentity(page, select, '203');
        await page.keyboard.press('Home');
        await expect(select).toHaveValue('');
        await expect(page.getByTestId('text-correction-provider-101')).toHaveCount(0);
        await page.keyboard.press('ArrowDown');
        await selectedIdentity(page, select, '201');
        await page.keyboard.press('ArrowDown');
        await selectedIdentity(page, select, '202');
        await expect(cnpj).toHaveValue('');
      } else {
        await page.keyboard.press('End');
        await selectedIdentity(page, select, '204', id);
      }
      await page.keyboard.press('Tab');
      await focused(page, page.getByTestId(`input-correction-cnpj-${id}`));
      await page.keyboard.type(id === 101 ? '98765432000110' : '55666777000188');
    }
    await page.keyboard.press('Tab');
    const reason = page.getByTestId('input-correction-reason');
    await focused(page, reason);
    await expect(page.getByTestId('button-save-correction')).toBeDisabled();
    await page.keyboard.type('Conferencia sintetica do ID e CNPJ, sem escrita real.');
    await page.keyboard.press('Tab');
    const consent = page.getByRole('checkbox', { name: /Conferi o ID do People/ });
    await focused(page, consent);
    await page.keyboard.press('Space');
    await expect(consent).toBeChecked();
    await expect(page.getByTestId('text-correction-summary')).toHaveText(/24 registro\(s\) serão alterados.*0 permanecerão/);
    await page.keyboard.press('Tab');
    await focused(page, page.getByTestId('button-cancel-correction'));
    await page.keyboard.press('Tab');
    const save = page.getByTestId('button-save-correction');
    await focused(page, save);
    await expect(save).toBeEnabled();
    const layout = await dialog.evaluate(el => ({
      client: el.clientWidth, scroll: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight,
      top: el.scrollTop, x: el.getBoundingClientRect().x, right: el.getBoundingClientRect().right,
      viewport: window.innerWidth, pageScroll: document.documentElement.scrollWidth,
    }));
    expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
    expect(layout.pageScroll).toBeLessThanOrEqual(layout.viewport);
    expect(layout.x).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(layout.viewport);
    expect(layout.scrollHeight).toBeGreaterThan(layout.height);
    expect(layout.top).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath('summary-and-actions.png') });
    await page.keyboard.press('Tab'); // close button
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); // trap wraps to summary
    await focused(page, skipped);
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();

    // Cancel, X and successful synthetic save must all return focus to opener.
    for (const method of ['cancel', 'close', 'save']) {
      await page.keyboard.press('Enter');
      await expect(dialog.getByRole('heading')).toBeFocused();
      if (method === 'save') {
        await page.getByTestId('select-correction-type').focus();
        await page.keyboard.press('ArrowDown');
        await expect(page.getByTestId('select-correction-type')).toHaveValue('32');
        for (let id = 101; id <= 108; id++) {
          const select = page.getByTestId(`select-correction-provider-${id}`);
          if (id === 101) {
            // The saved homonym must be chosen with native keys, not selectOption.
            await select.focus();
            await page.keyboard.press('Home');
            await page.keyboard.press('ArrowDown');
            await selectedIdentity(page, select, '201');
            await page.getByTestId('input-correction-cnpj-101').fill('12345678000190');
            await consent.check();
            await select.focus();
            await page.keyboard.press('ArrowDown');
            await selectedIdentity(page, select, '202');
            await expect(page.getByTestId('input-correction-cnpj-101')).toHaveValue('');
            await expect(consent).not.toBeChecked();
            await expect(save).toBeDisabled();
          } else {
            await select.selectOption('204');
          }
          await page.getByTestId(`input-correction-cnpj-${id}`).fill(id === 101 ? '98765432000110' : '55666777000188');
        }
        await reason.fill('Conferencia sintetica sem escrita real.');
        await consent.check();
        await save.focus();
        await page.keyboard.press('Enter');
      } else if (method === 'cancel') {
        await page.getByTestId('button-cancel-correction').click();
      } else {
        await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      }
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
    const saves = await page.evaluate(() => (window as any).correctionTestTraffic.requests
      .filter((r: { path: string }) => r.path === '/api/diarias/export/correction'));
    expect(saves).toHaveLength(1);
    expect(saves[0].body.confirmed).toBe(true);
    expect(saves[0].body.corrections).toEqual(Array.from({ length: 24 }, (_, i) => {
      const firstGroup = i < 3;
      const candidate = firstGroup ? candidates['202'] : candidates['204'];
      return expect.objectContaining({
        id: 1001 + i,
        providerId: firstGroup ? 202 : 204,
        typeId: 32,
        expectedTypeId: 31,
        expectedPeopleId: candidate.peopleId,
        verifiedCnpj: candidate.cnpj.replace(/\D/g, ''),
        expectedProviderId: 101 + Math.floor(i / 3),
      });
    }));
  } finally {
    await assertSafe(1);
  }
});

test('native type keys invalidate consent and save only the reconfirmed synthetic type', async ({ page, baseURL }) => {
  const assertSafe = await isolateCorrection(page, baseURL!);
  await page.goto('tests/browser/export-correction.html');
  const opener = page.getByTestId('button-open-export-correction');
  const type = page.getByTestId('select-correction-type');
  const consent = page.getByTestId('checkbox-correction-confirm');
  const save = page.getByTestId('button-save-correction');
  const summary = page.getByTestId('text-correction-summary');
  const types = {
    '': 'Selecione o tipo de diária extra',
    '32': 'Diária extra sintética',
    '33': 'Diária extra sintética intermediária',
    '34': 'Diária extra sintética final',
  } as const;
  const reason = 'Escolha de tipo exclusivamente sintetica, sem exportacao.';
  try {
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog').getByRole('heading')).toBeFocused();
    await page.keyboard.press('Tab'); // exclusions summary
    await page.keyboard.press('Tab'); // native type select
    await focused(page, type);
    await expect(type).toHaveValue('');
    await expect(type.locator('option')).toHaveCount(4);
    await expect(summary).toHaveText(/0 registro\(s\) serão alterados.*0 permanecerão/);
    await page.keyboard.press('ArrowDown');
    await expect(type).toHaveValue('32');
    // Keep the provider scenarios in the original test. Here identities and
    // documents are fixed synthetic prerequisites, not People confirmation.
    for (let id = 101; id <= 108; id++) {
      await page.getByTestId(`select-correction-provider-${id}`).selectOption('204');
      await page.getByTestId(`input-correction-cnpj-${id}`).fill('55666777000188');
    }
    await page.getByTestId('input-correction-reason').fill(reason);
    await consent.focus();
    await page.keyboard.press('Space');
    await expect(consent).toBeChecked();
    await expect(save).toBeEnabled();
    await expect(summary).toHaveText(/24 registro\(s\) serão alterados.*0 permanecerão/);

    // Closed native selects commit immediately; Enter would reopen the popup.
    for (const [key, id] of [
      ['ArrowDown', '33'], ['End', '34'], ['ArrowUp', '33'],
      ['Home', ''], ['ArrowDown', '32'], ['ArrowDown', '33'],
    ] as const) {
      await type.focus();
      await focused(page, type);
      await page.keyboard.press(key);
      await expect(type).toHaveValue(id);
      await expect(type.locator('option:checked')).toHaveText(types[id]);
      await expect(consent).not.toBeChecked();
      await expect(save).toBeDisabled();
      // A missing type blocks saving without misrepresenting provider changes.
      await expect(summary).toHaveText(/24 registro\(s\) serão alterados.*0 permanecerão/);
      for (let group = 101; group <= 108; group++) {
        await expect(page.getByTestId(`select-correction-provider-${group}`)).toHaveValue('204');
        await expect(page.getByTestId(`input-correction-cnpj-${group}`)).toHaveValue('55666777000188');
      }
      await expect(page.getByTestId('input-correction-reason')).toHaveValue(reason);
      // Exercise the disabled action before authorizing the newly chosen type.
      await save.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      await assertSafe(0);
      await consent.focus();
      await page.keyboard.press('Space');
      await expect(consent).toBeChecked();
      if (id === '') await expect(save).toBeDisabled();
      else await expect(save).toBeEnabled();
    }
    await expect(type).toHaveValue('33');
    await save.focus();
    await focused(page, save);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
    const saves = await page.evaluate(() => (window as any).correctionTestTraffic.requests
      .filter((r: { path: string }) => r.path === '/api/diarias/export/correction'));
    expect(saves).toHaveLength(1);
    expect(saves[0].body).toEqual({
      confirmed: true,
      reason,
      corrections: Array.from({ length: 24 }, (_, i) => ({
        id: 1001 + i, expectedProviderId: 101 + Math.floor(i / 3),
        expectedTypeId: 31, expectedUpdatedAt: '2026-10-03T12:00:00Z',
        expectedProviderDecargoId: `manual-${'ReferenciaLonga'.repeat(15)}`,
        expectedPeopleId: candidates['204'].peopleId,
        providerId: 204, typeId: 33, verifiedCnpj: '55666777000188',
      })),
    });
  } finally {
    await assertSafe(1);
  }
});
