import { chromium, firefox, webkit } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runtimeRoot } from './correction-runtime.mjs';

const versions = {};
for (const engine of [chromium, firefox, webkit]) {
  const browser = await engine.launch(engine === firefox ? {
    env: { ...process.env, LD_LIBRARY_PATH: process.env.CORRECTION_BROWSER_RUNTIME_LIB },
  } : {});
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const forbidden = [];
    await context.route('**/*', route => {
      forbidden.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    await page.setContent('<p>correction-runtime</p>');
    if (await page.textContent('p') !== 'correction-runtime' || forbidden.length) {
      throw new Error(`${engine.name()}: isolated rendering failed.`);
    }
    versions[engine.name()] = browser.version();
    console.log(`${engine.name()} ${browser.version()}: isolated rendering OK`);
  } finally {
    await browser.close();
  }
}
await writeFile(path.join(runtimeRoot, 'versions.json'), JSON.stringify(versions, null, 2));
