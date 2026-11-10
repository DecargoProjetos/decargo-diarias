import { defineConfig } from '@playwright/test';

const baseURL = process.env.CORRECTION_TEST_BASE_URL;
if (!baseURL) throw new Error('Set CORRECTION_TEST_BASE_URL to the running development preview (never production).');
const url = new URL(baseURL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) && !url.hostname.endsWith('.replit.dev')) {
  throw new Error('Only localhost or a .replit.dev development preview is allowed.');
}
const executablePath = process.env.CORRECTION_CHROMIUM_EXECUTABLE_PATH;
const runtimeLib = process.env.CORRECTION_BROWSER_RUNTIME_LIB;
export default defineConfig({
  testDir: './tests/browser',
  testMatch: /export-correction(?:-viewport)?\.spec\.ts/,
  outputDir: '../../generated-artifacts/correction-browser',
  reporter: 'list',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: (['chromium', 'webkit', 'firefox'] as const).flatMap(browserName =>
    [
      { name: 'mobile-320', viewport: { width: 320, height: 568 }, narrow: true },
      { name: 'mobile-390', viewport: { width: 390, height: 844 }, narrow: true },
      { name: 'desktop-keyboard', viewport: { width: 1280, height: 800 }, narrow: false },
    ].map(({ name, viewport, narrow }) => ({
      name: `${browserName}-${name}`,
      // Preserve the separately delivered Chromium viewport/CDP checks.
      // This task's native-keyboard/focus suite runs on every engine.
      testMatch: browserName === 'chromium'
        ? /export-correction(?:-viewport)?\.spec\.ts/
        : 'export-correction.spec.ts',
      use: {
        browserName,
        viewport,
        // Firefox does not support Playwright's isMobile emulation. Narrow
        // viewports still exercise its responsive layout and keyboard scrolling.
        isMobile: narrow && browserName !== 'firefox',
        hasTouch: narrow,
        // Never launch Firefox/WebKit with the optional Chromium executable.
        ...(browserName === 'chromium' && executablePath
          ? { launchOptions: { executablePath } } : {}),
        // Firefox's bundled shared objects must remain unmodified: its custom
        // loader does not tolerate ELF layout changes. Apply the pinned library
        // environment only to the browser, never to Node or other workflows.
        ...(browserName === 'firefox' && runtimeLib
          ? { launchOptions: { env: { ...process.env, LD_LIBRARY_PATH: runtimeLib } } } : {}),
      },
    })),
  ),
});
