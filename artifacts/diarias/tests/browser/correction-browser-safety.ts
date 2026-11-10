import { expect, type Page } from '@playwright/test';

export async function isolateCorrection(page: Page, baseURL: string) {
  const violations: string[] = [];
  const origin = new URL(baseURL).origin;
  await page.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const staticPath = url.pathname === '/tests/browser/export-correction.html'
      || ['/tests/browser/', '/src/', '/@', '/node_modules/'].some(prefix => url.pathname.startsWith(prefix));
    const staticType = ['document', 'script', 'stylesheet', 'image', 'font'].includes(req.resourceType());
    if (url.origin !== origin || req.method() !== 'GET' || !staticPath || !staticType) {
      if (url.hostname === 'fonts.googleapis.com' && req.resourceType() === 'stylesheet') {
        await route.fulfill({ contentType: 'text/css', body: '' });
        return;
      }
      violations.push(`${req.method()} ${url.href}`);
      await route.abort();
      return;
    }
    await route.continue();
  });
  return async (saves: number, completed = saves) => {
    expect.soft(violations, 'Forbidden real network traffic, even if errors were caught').toEqual([]);
    const traffic = await page.evaluate(() => (window as any).correctionTestTraffic);
    expect.soft(traffic.violations, 'Forbidden synthetic HTTP calls').toEqual([]);
    expect.soft(traffic.requests.every((r: any) => r.method === 'POST'
      && ['/api/diarias/export/correction/preview', '/api/diarias/export/correction'].includes(r.path))).toBe(true);
    expect.soft(traffic.requests.filter((r: any) => r.path === '/api/diarias/export/correction')).toHaveLength(saves);
    expect.soft(traffic.completed).toBe(completed);
  };
}
