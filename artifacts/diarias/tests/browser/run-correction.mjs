import { spawnSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  assertVersion, browserEnv, configurationHash, packageRoot, playwrightCLI, playwrightVersion, runtimeRoot,
} from './correction-runtime.mjs';

assertVersion();
const ready = JSON.parse(await readFile(path.join(runtimeRoot, 'ready.json'), 'utf8').catch(() => {
  throw new Error('Run pnpm --filter @workspace/diarias test:correction:setup first.');
}));
if (ready.playwrightVersion !== playwrightVersion || ready.configurationHash !== await configurationHash()
  || ready.runtime !== await realpath(path.join(runtimeRoot, 'nix'))) {
  throw new Error('Browser runtime changed. Run test:correction:setup again.');
}
const env = browserEnv(ready.runtime);
env.CORRECTION_TEST_BASE_URL ??= 'http://localhost:80/';
const result = spawnSync(process.execPath, [
  playwrightCLI, 'test', '--config', 'playwright.correction.config.ts', ...process.argv.slice(2),
], { cwd: packageRoot, env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
