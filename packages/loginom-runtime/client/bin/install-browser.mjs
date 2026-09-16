#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

process.umask(0o077);
const { values } = parseArgs({ options: { 'state-dir': { type: 'string' } } });
if (!values['state-dir']) throw new Error('An explicit Dock state directory is required');
const expectedNode = (await readFile(new URL('../.node-version', import.meta.url), 'utf8')).trim();
if (process.versions.node !== expectedNode) throw new Error(`Dock requires Node.js ${expectedNode}`);
const browserRoot = join(resolve(values['state-dir']), 'runtime', 'browsers');
await mkdir(browserRoot, { recursive: true, mode: 0o700 });
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('playwright-core/package.json')), 'cli.js');
const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserRoot }, stdio: 'inherit',
});
if (result.status !== 0) process.exitCode = result.status ?? 1;
else {
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserRoot;
  try {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    console.log('Браузер Dock загружен и проверен запуском.');
  } catch {
    console.error(process.platform === 'linux'
      ? 'Браузер загружен, но не запускается. Проверьте системные библиотеки Chromium: используйте install-deps chromium у Playwright из этого комплекта.'
      : 'Браузер Dock загружен, но не запускается. Проверьте защиту приложений и доступ к графической сессии.');
    process.exitCode = 1;
  }
}
