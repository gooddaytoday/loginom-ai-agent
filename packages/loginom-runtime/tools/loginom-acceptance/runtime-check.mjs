// Read-only dependencies/browser preflight: never launches a browser or model.
import { readFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
const root = resolve(process.argv[2]);
const require = createRequire(join(root, 'client/package.json'));
const json = async path => JSON.parse(await readFile(path, 'utf8'));
try {
  const own = await json(join(root, 'client/package.json'));
  const lock = await json(join(root, 'client/package-lock.json'));
  const expectedNode = (await readFile(join(root, 'client/.node-version'), 'utf8')).trim();
  const coreRoot = dirname(require.resolve('playwright-core/package.json'));
  const core = await json(join(coreRoot, 'package.json'));
  const mcp = await json(require.resolve('@playwright/mcp/package.json'));
  const sdk = await json(join(dirname(require.resolve('@modelcontextprotocol/sdk/package.json')), '../../package.json'));
  if (process.versions.node !== expectedNode || mcp.version !== own.dependencies['@playwright/mcp']
      || sdk.version !== own.dependencies['@modelcontextprotocol/sdk']
      || core.version !== lock.packages['node_modules/playwright-core'].version) throw new Error('pin mismatch');
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(process.argv[3]);
  const { chromium } = require('playwright-core');
  await access(chromium.executablePath());
  const browser = (await json(join(coreRoot, 'browsers.json'))).browsers.find(item => item.name === 'chromium');
  process.stdout.write(JSON.stringify({ node: process.versions.node, playwright: core.version, sdk: sdk.version,
    playwright_mcp: mcp.version, chromium_revision: browser.revision, chromium_version: browser.browserVersion }) + '\n');
} catch {
  process.stderr.write('Pinned Node, dependencies or browser runtime are unavailable.\n');
  process.exitCode = 1;
}
