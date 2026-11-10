import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
export const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
export const runtimeRoot = path.resolve(packageRoot, '../../generated-artifacts/correction-runtime');
export const browsersPath = path.join(runtimeRoot, 'browsers');
export const playwrightCLI = require.resolve('@playwright/test/cli');
export const playwrightVersion = require('@playwright/test/package.json').version;
export const supportedVersion = '1.64.0';

export function runtimeEnv() {
  // Remove the injected loader and inherited library overrides only in this
  // child process. Each patched ELF has its own matching loader and RPATH.
  const env = { ...process.env };
  for (const key of ['LD_AUDIT', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'NIX_LD', 'NIX_LD_LIBRARY_PATH',
    'CORRECTION_CHROMIUM_EXECUTABLE_PATH', 'PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS']) delete env[key];
  env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  return env;
}

export function assertVersion() {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('This correction runtime is verified only on Linux x86_64.');
  }
  if (playwrightVersion !== supportedVersion) {
    throw new Error(`Runtime verified with Playwright ${supportedVersion}, found ${playwrightVersion}. Revalidate the runtime before updating it.`);
  }
}

export async function configurationHash() {
  const hash = createHash('sha256');
  for (const name of ['runtime.nix', 'prepare-runtime.mjs', 'correction-runtime.mjs', 'verify-runtime.mjs']) {
    hash.update(await readFile(new URL(name, import.meta.url)));
  }
  return hash.digest('hex');
}

export function browserEnv(runtime) {
  const env = runtimeEnv();
  // The Debian-oriented check cannot discover Nix RPATHs. Missing/incompatible
  // libraries still fail real launch, both in setup and in the test runner.
  env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
  env.CORRECTION_BROWSER_RUNTIME_LIB = path.join(runtime, 'lib');
  env.__EGL_VENDOR_LIBRARY_FILENAMES = path.join(runtime, 'share/glvnd/egl_vendor.d/50_mesa.json');
  env.LIBGL_DRIVERS_PATH = path.join(runtime, 'lib/dri');
  env.LIBGL_ALWAYS_SOFTWARE = '1';
  env.GALLIUM_DRIVER = 'llvmpipe';
  return env;
}
