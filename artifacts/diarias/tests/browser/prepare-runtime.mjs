import { spawnSync } from 'node:child_process';
import { mkdir, readdir, readFile, open, writeFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import {
  assertVersion, browserEnv, browsersPath, configurationHash, packageRoot,
  playwrightCLI, playwrightVersion, runtimeEnv, runtimeRoot,
} from './correction-runtime.mjs';

assertVersion();
const osRelease = await readFile('/etc/os-release', 'utf8');
if (!/^ID=ubuntu$/m.test(osRelease) || !/^VERSION_ID="24\.04"$/m.test(osRelease)) {
  throw new Error('The downloaded browser builds were verified only on the Ubuntu 24.04 host with Nix.');
}
const env = runtimeEnv();
const nixFile = path.join(packageRoot, 'tests/browser/runtime.nix');
await mkdir(runtimeRoot, { recursive: true });
await rm(path.join(runtimeRoot, 'ready.json'), { force: true });

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: packageRoot, env, encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
  return result.stdout?.trim();
}

// Keep a GC root, and pin both the nixpkgs revision and its content hash.
const runtime = run('nix-build', [nixFile, '--out-link', path.join(runtimeRoot, 'nix')], true);
const patchelf = path.join(runtime, 'bin/patchelf');
const downloads = path.join(runtimeRoot, 'downloads');
const install = spawnSync(process.execPath, [playwrightCLI, 'install', 'chromium', 'firefox', 'webkit'], {
  // Libraries are patched and checked by launching every engine below.
  cwd: packageRoot, env: {
    ...env, PLAYWRIGHT_BROWSERS_PATH: downloads, PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS: '1',
  }, stdio: 'inherit',
});
if (install.error) throw install.error;
if (install.status !== 0) throw new Error('Playwright browser download failed.');
await rm(browsersPath, { recursive: true, force: true });
await cp(downloads, browsersPath, { recursive: true });

// Patch only our private, ignored browser cache. Never mutate shared downloads
// or /nix/store. Include shared objects as well as executable subprocesses.
async function patchTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await patchTree(file); continue; }
    if (!entry.isFile()) continue;
    const handle = await open(file, 'r');
    const magic = Buffer.alloc(4);
    try { await handle.read(magic, 0, 4, 0); } finally { await handle.close(); }
    if (!magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) continue;
    const interpreter = spawnSync(patchelf, ['--print-interpreter', file], { env, encoding: 'utf8' });
    // Firefox's custom library loader needs its bundled shared objects intact.
    if (file.includes('/firefox-') && interpreter.status !== 0) continue;
    const probe = spawnSync(patchelf, ['--print-rpath', file], { env, encoding: 'utf8' });
    // The bundled ffmpeg is static and has neither an interpreter nor RPATH.
    if (probe.status !== 0 && probe.stderr?.includes("cannot find section '.dynamic'")) continue;
    if (probe.error) throw probe.error;
    if (probe.status !== 0) throw new Error(`Cannot inspect ${file}: ${probe.stderr}`);
    const oldRpath = probe.stdout.trim();
    const originalPaths = oldRpath.split(':').filter(p => p && !p.endsWith('-correction-browser-runtime/lib'));
    const rpath = [...new Set(['$ORIGIN', ...originalPaths, `${runtime}/lib`])].join(':');
    // RPATH (rather than RUNPATH) also covers indirect dependencies of the
    // downloaded libraries and libraries opened dynamically by the engines.
    run(patchelf, ['--force-rpath', '--set-rpath', rpath, file], true);
    if (interpreter.status === 0) {
      run(patchelf, ['--set-interpreter', `${runtime}/lib/ld-linux-x86-64.so.2`, file], true);
    }
  }
}
await patchTree(browsersPath);
const verify = spawnSync(process.execPath, [path.join(packageRoot, 'tests/browser/verify-runtime.mjs')], {
  cwd: packageRoot, env: browserEnv(runtime), stdio: 'inherit',
});
if (verify.error) throw verify.error;
if (verify.status !== 0) throw new Error('Browser runtime verification failed; runtime was not marked ready.');
await writeFile(path.join(runtimeRoot, 'ready.json'), JSON.stringify({
  playwrightVersion, runtime,
  configurationHash: await configurationHash(),
}, null, 2));
console.log(`Prepared Playwright ${playwrightVersion}: ${runtime}`);
