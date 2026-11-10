import { test, expect, type Locator, type Page } from '@playwright/test';
import { isolateCorrection } from './correction-browser-safety';

async function insideVisibleArea(page: Page, target: Locator, scroll = true) {
  await expect.poll(async () => target.evaluate((el, scroll) => {
    const container = el.closest('[role=dialog]')!;
    if (scroll) {
      const r = el.getBoundingClientRect(), d = container.getBoundingClientRect();
      if (r.bottom > d.bottom) container.scrollTop += r.bottom - d.bottom + 2;
      else if (r.top < d.top) container.scrollTop -= d.top - r.top + 2;
    }
    const rect = el.getBoundingClientRect();
    const dialog = container.getBoundingClientRect();
    const vv = window.visualViewport!;
    return rect.top >= Math.max(dialog.top, vv.offsetTop) - 1
      && rect.bottom <= Math.min(dialog.bottom, vv.offsetTop + vv.height) + 1
      && rect.left >= Math.max(dialog.left, vv.offsetLeft) - 1
      && rect.right <= Math.min(dialog.right, vv.offsetLeft + vv.width) + 1;
  }, scroll)).toBe(true);
}

async function noClipping(page: Page) {
  await expect.poll(() => page.getByRole('dialog').evaluate(el => {
    const r = el.getBoundingClientRect(), v = window.visualViewport!;
    return el.scrollWidth <= el.clientWidth + 1
      && r.top >= v.offsetTop - 1 && r.bottom <= v.offsetTop + v.height + 1
      && r.left >= v.offsetLeft - 1 && r.right <= v.offsetLeft + v.width + 1;
  })).toBe(true);
}

// Long paragraphs can exceed a short keyboard viewport. Check every rendered
// text fragment fits horizontally and that BOTH ends are reachable by scrolling.
async function readable(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  expect(await target.evaluate(el => {
    const dialog = el.closest('[role=dialog]')!;
    const bounds = dialog.getBoundingClientRect();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some(r => r.left < bounds.left - 1 || r.right > bounds.right + 1)) return false;
    }
    return true;
  })).toBe(true);
  for (const block of ['start', 'end'] as const) {
    await expect.poll(async () => {
      await target.evaluate((el, block) => {
        const dialog = el.closest('[role=dialog]')!;
        const r = el.getBoundingClientRect(), d = dialog.getBoundingClientRect();
        dialog.scrollTop += block === 'start' ? r.top - d.top - 2 : r.bottom - d.bottom + 2;
      }, block);
      return target.evaluate((el, block) => {
        const r = el.getBoundingClientRect(), d = el.closest('[role=dialog]')!.getBoundingClientRect();
        const v = window.visualViewport!;
        const edge = block === 'start' ? r.top : r.bottom;
        return edge >= Math.max(d.top, v.offsetTop) - 1
          && edge <= Math.min(d.bottom, v.offsetTop + v.height) + 1;
      }, block);
    }).toBe(true);
  }
  await noClipping(page);
}

const rotationReason = 'Conferência exclusivamente sintética durante rotação e deslocamento do zoom.';
const syntheticCnpj = '12345678000190';

async function prepareConfirmedCorrection(page: Page) {
  await page.getByTestId('button-open-export-correction').click();
  await expect(page.getByTestId('group-correction-108')).toBeVisible();
  await page.getByTestId('select-correction-type').selectOption('32');
  await page.getByRole('dialog').locator('summary').click();
  for (let id = 101; id <= 108; id++) {
    await page.getByTestId(`select-correction-provider-${id}`).selectOption('201');
    await page.getByTestId(`input-correction-cnpj-${id}`).fill(syntheticCnpj);
  }
  await page.getByTestId('input-correction-reason').fill(rotationReason);
  await page.getByTestId('checkbox-correction-confirm').check();
  await confirmedCorrectionPreserved(page);
}

async function confirmedCorrectionPreserved(page: Page) {
  for (let id = 101; id <= 108; id++) {
    await expect(page.getByTestId(`select-correction-provider-${id}`)).toHaveValue('201');
    await expect(page.getByTestId(`input-correction-cnpj-${id}`)).toHaveValue(syntheticCnpj);
  }
  await expect(page.getByTestId('input-correction-reason')).toHaveValue(rotationReason);
  await expect(page.getByTestId('checkbox-correction-confirm')).toBeChecked();
  await expect(page.getByTestId('button-save-correction')).toBeEnabled();
}

async function correctionWarningsReadable(page: Page) {
  const dialog = page.getByRole('dialog');
  await readable(page, dialog.getByRole('heading'));
  await readable(page, dialog.locator('[id]').filter({ hasText: /^Escolha o prestador integrado/ }).first());
  await readable(page, dialog.locator('details li'));
  await readable(page, dialog.getByText(/esta correção nunca libera bloqueios/));
  await readable(page, dialog.locator('label').filter({ has: page.getByTestId('checkbox-correction-confirm') }));
  await readable(page, page.getByTestId('text-correction-summary'));
}

// Emulate the VisualViewport scroll contract, not a native swipe. Keep the
// actual Chromium scale/width/height, changing only the pan offsets.
async function panWithoutReturningToField(page: Page, focused: Locator, left: number, top: number) {
  const dialog = page.getByRole('dialog');
  const before = await dialog.evaluate(el => el.scrollTop);
  await expect(focused).toBeFocused();
  await page.evaluate(({ left, top }) => {
    const v = window.visualViewport!;
    Object.defineProperties(v, {
      offsetLeft: { configurable: true, value: left },
      offsetTop: { configurable: true, value: top },
    });
    v.dispatchEvent(new Event('scroll'));
  }, { left, top });
  await expect.poll(() => dialog.evaluate(el => {
    const r = el.getBoundingClientRect(), v = window.visualViewport!;
    return Math.abs(r.left + r.width / 2 - (v.offsetLeft + v.width / 2)) < 1
      && Math.abs(r.top + r.height / 2 - (v.offsetTop + v.height / 2)) < 1;
  })).toBe(true);
  // Wait for committed geometry and subsequent frame callbacks before checking
  // the reader's position; never "fix" it with assisted scrolling after pan.
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect(await dialog.evaluate(el => el.scrollTop)).toBeCloseTo(before, 0);
  await expect(focused).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBe(2);
  expect(await page.evaluate(() => window.visualViewport!.offsetLeft)).toBe(left);
  await noClipping(page);
}

test('portrait/landscape rotation at actual 200% scale preserves focused editing and consent', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop-keyboard', 'Rotation covers the two mobile viewports.');
  const assertSafe = await isolateCorrection(page, baseURL!);
  await page.goto('tests/browser/export-correction.html');
  const cdp = await page.context().newCDPSession(page);
  const portrait = page.viewportSize()!;
  const landscape = { width: portrait.height, height: portrait.width };
  try {
    await prepareConfirmedCorrection(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBe(2);
    // Viewport dimension swaps simulate rotation, not OS orientation events or
    // a native software keyboard. Each field stays focused across BOTH swaps.
    for (const fieldId of ['input-correction-cnpj-108', 'input-correction-reason']) {
      const field = page.getByTestId(fieldId);
      await field.focus();
      await insideVisibleArea(page, field);
      for (const [orientation, size] of [['landscape', landscape], ['portrait', portrait]] as const) {
        await page.setViewportSize(size);
        await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBe(2);
        await expect.poll(() => page.evaluate(() => window.visualViewport!.width)).toBeCloseTo(size.width / 2, 0);
        await expect(field).toBeFocused();
        await insideVisibleArea(page, field, false);
        await noClipping(page);
        await confirmedCorrectionPreserved(page);
        await page.screenshot({ path: testInfo.outputPath(`rotation-200-${fieldId}-${orientation}.png`) });
        await correctionWarningsReadable(page);
        await insideVisibleArea(page, page.getByTestId('button-save-correction'));
        await insideVisibleArea(page, page.getByTestId('button-cancel-correction'));
        await expect(field).toBeFocused();
        // Restore the editing position BEFORE the next resize; that resize must
        // keep the field visible without any help from this test.
        await insideVisibleArea(page, field);
      }
    }
    await confirmedCorrectionPreserved(page);
    await page.getByTestId('button-cancel-correction').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('button-open-export-correction')).toBeFocused();
  } finally {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await cdp.detach();
    await assertSafe(0);
  }
});

test('horizontal visual viewport pan at actual 200% scale never returns reading to the old field', async ({ page, baseURL }, testInfo) => {
  const assertSafe = await isolateCorrection(page, baseURL!);
  await page.goto('tests/browser/export-correction.html');
  const cdp = await page.context().newCDPSession(page);
  try {
    await prepareConfirmedCorrection(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBe(2);
    const oldField = page.getByTestId('input-correction-cnpj-101');
    await oldField.focus();
    await insideVisibleArea(page, oldField);
    const dialog = page.getByRole('dialog');
    const warning = dialog.getByText(/esta correção nunca libera bloqueios/);
    await readable(page, warning);
    // Prove that the reader has deliberately left the still-focused field.
    expect(await oldField.evaluate(el => {
      const r = el.getBoundingClientRect(), d = el.closest('[role=dialog]')!.getBoundingClientRect();
      return r.top > d.bottom || r.bottom < d.top;
    })).toBe(true);
    await panWithoutReturningToField(page, oldField, 24, 32);
    await correctionWarningsReadable(page);
    await confirmedCorrectionPreserved(page);
    await insideVisibleArea(page, page.getByTestId('button-cancel-correction'));
    await insideVisibleArea(page, page.getByTestId('button-save-correction'));
    await panWithoutReturningToField(page, oldField, 48, 64);
    await insideVisibleArea(page, page.getByTestId('button-save-correction'), false);
    await insideVisibleArea(page, page.getByTestId('button-cancel-correction'));
    await panWithoutReturningToField(page, oldField, 16, 32);
    await insideVisibleArea(page, page.getByTestId('button-cancel-correction'), false);
    await page.screenshot({ path: testInfo.outputPath('page-scale-200-horizontal-pan-actions.png') });
    await confirmedCorrectionPreserved(page);
    await page.getByTestId('button-cancel-correction').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('button-open-export-correction')).toBeFocused();
  } finally {
    await page.evaluate(() => {
      const v = window.visualViewport!;
      delete (v as any).offsetLeft;
      delete (v as any).offsetTop;
      v.dispatchEvent(new Event('scroll'));
    });
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await cdp.detach();
    await assertSafe(0);
  }
});

test('200% text enlargement and narrow reflow keep correction readable', async ({ page, baseURL }, testInfo) => {
  const assertSafe = await isolateCorrection(page, baseURL!);
  // 1280 CSS pixels at 400% browser zoom has 320 CSS pixels available.
  // This is an explicit reflow equivalent, not OS/browser zoom automation.
  if (testInfo.project.name.endsWith('desktop-keyboard')) await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('tests/browser/export-correction.html');
  try {
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.getByTestId('button-open-export-correction').click();
    await expect(page.getByTestId('group-correction-108')).toBeVisible();
    await page.getByTestId('select-correction-type').selectOption('32');
    expect(await page.getByRole('dialog').getByRole('heading').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBe(36);
    const dialog = page.getByRole('dialog');
    await readable(page, dialog.getByRole('heading'));
    await readable(page, dialog.locator('[id]').filter({ hasText: /^Escolha o prestador integrado/ }).first());
    for (let id = 101; id <= 108; id++) {
      await page.getByTestId(`select-correction-provider-${id}`).selectOption('201');
      await readable(page, page.getByTestId(`text-correction-provider-${id}`));
      const document = page.getByTestId(`input-correction-cnpj-${id}`);
      await document.fill('12345678000190');
      await insideVisibleArea(page, document);
    }
    const reason = page.getByTestId('input-correction-reason');
    await reason.fill('Conferência sintética com texto ampliado, sem alteração real.');
    await insideVisibleArea(page, reason);
    await readable(page, dialog.locator('label').filter({ has: page.getByTestId('checkbox-correction-confirm') }));
    await expect(page.getByTestId('button-save-correction')).toBeDisabled();
    await page.getByTestId('checkbox-correction-confirm').check();
    await readable(page, page.getByTestId('text-correction-summary'));
    await insideVisibleArea(page, page.getByTestId('button-cancel-correction'));
    const save = page.getByTestId('button-save-correction');
    await insideVisibleArea(page, save);
    await expect(save).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('text-200-reflow-actions.png') });
    await save.click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await assertSafe(1);
  }
});

test('keyboard opening, panning and closing while editing preserve visible controls and values', async ({ page, baseURL }, testInfo) => {
  const assertSafe = await isolateCorrection(page, baseURL!);
  await page.goto('tests/browser/export-correction.html');
  try {
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.getByTestId('button-open-export-correction').click();
    await expect(page.getByTestId('group-correction-108')).toBeVisible();
    await page.getByTestId('select-correction-type').selectOption('32');
    for (let id = 101; id <= 108; id++) {
      await page.getByTestId(`select-correction-provider-${id}`).selectOption('201');
      await page.getByTestId(`input-correction-cnpj-${id}`).fill('12345678000190');
    }
    const input = page.getByTestId('input-correction-cnpj-108');
    await input.focus();
    // Model browsers that resize the layout viewport when the OS keyboard opens.
    const original = page.viewportSize()!;
    await page.setViewportSize({ width: original.width, height: 300 });
    await expect(input).toBeFocused();
    await insideVisibleArea(page, input, false);
    await noClipping(page);
    await page.screenshot({ path: testInfo.outputPath('keyboard-layout-resize-document.png') });
    await page.setViewportSize(original);

    // Model visual-only resize + browser panning, with unchanged layout/dvh.
    // This emits the real VisualViewport event contract; it is NOT a native
    // software keyboard, and deliberately does not claim device certification.
    await page.evaluate(() => {
      const v = window.visualViewport!;
      Object.defineProperties(v, {
        height: { configurable: true, value: 300 },
        offsetTop: { configurable: true, value: 80 },
      });
      v.dispatchEvent(new Event('resize'));
      v.dispatchEvent(new Event('scroll'));
    });
    await insideVisibleArea(page, input, false);
    await expect(input).toHaveValue('12345678000190');
    await noClipping(page);
    const reason = page.getByTestId('input-correction-reason');
    await reason.fill('Motivo sintético digitado com teclado virtual simulado.');
    await insideVisibleArea(page, reason);
    await expect(reason).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('keyboard-visual-only-reason.png') });
    await readable(page, page.getByRole('dialog').locator('label').filter({ has: page.getByTestId('checkbox-correction-confirm') }));
    await page.getByTestId('checkbox-correction-confirm').check();
    await readable(page, page.getByTestId('text-correction-summary'));
    await insideVisibleArea(page, page.getByTestId('button-save-correction'));
    await insideVisibleArea(page, page.getByTestId('button-cancel-correction'));
    await page.screenshot({ path: testInfo.outputPath('keyboard-visual-only-actions.png') });
    await page.evaluate(() => {
      const v = window.visualViewport!;
      delete (v as any).height;
      delete (v as any).offsetTop;
      v.dispatchEvent(new Event('resize'));
    });
    await noClipping(page);
    await expect(reason).toHaveValue('Motivo sintético digitado com teclado virtual simulado.');
    await expect(page.getByTestId('checkbox-correction-confirm')).toBeChecked();
    await page.getByTestId('button-cancel-correction').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('button-open-export-correction')).toBeFocused();
  } finally {
    await assertSafe(0);
  }
});

test('actual Chromium 200% page scale keeps the correction inside the zoomed visual viewport', async ({ page, baseURL }, testInfo) => {
  const assertSafe = await isolateCorrection(page, baseURL!);
  await page.goto('tests/browser/export-correction.html');
  const cdp = await page.context().newCDPSession(page);
  try {
    await page.getByTestId('button-open-export-correction').click();
    await expect(page.getByTestId('group-correction-108')).toBeVisible();
    await page.getByTestId('select-correction-type').selectOption('32');
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBe(2);
    await noClipping(page);
    const dialog = page.getByRole('dialog');
    await readable(page, dialog.getByRole('heading'));
    await readable(page, dialog.locator('[id]').filter({ hasText: /^Escolha o prestador integrado/ }).first());
    for (let id = 101; id <= 108; id++) {
      await page.getByTestId(`select-correction-provider-${id}`).selectOption('201');
      await readable(page, page.getByTestId(`text-correction-provider-${id}`));
      const document = page.getByTestId(`input-correction-cnpj-${id}`);
      await document.fill('12345678000190');
      await insideVisibleArea(page, document);
    }
    const reason = page.getByTestId('input-correction-reason');
    await reason.fill('Conferência sintética em zoom de página a 200%.');
    await insideVisibleArea(page, reason);
    await readable(page, dialog.locator('label').filter({ has: page.getByTestId('checkbox-correction-confirm') }));
    await page.getByTestId('checkbox-correction-confirm').check();
    await readable(page, page.getByTestId('text-correction-summary'));
    await insideVisibleArea(page, page.getByTestId('button-save-correction'));
    await insideVisibleArea(page, page.getByTestId('button-cancel-correction'));
    await page.screenshot({ path: testInfo.outputPath('page-scale-200-actions.png') });
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBe(1);
    await noClipping(page);
    await expect(reason).toHaveValue('Conferência sintética em zoom de página a 200%.');
    await page.getByTestId('button-cancel-correction').click();
    await expect(dialog).toHaveCount(0);
  } finally {
    await cdp.detach();
    await assertSafe(0);
  }
});
