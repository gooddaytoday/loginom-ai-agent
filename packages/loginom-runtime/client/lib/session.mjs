import {createRuntimeSourcePin} from './runtime-pin.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { executableExists, privateDirectory } from './platform.mjs';
import {createArtifactStore} from './artifacts.mjs';
import {browserDownloadScript} from './browser-downloads.mjs';

const require = createRequire(import.meta.url);
const packagePath = (name) => require.resolve(`${name}/package.json`);
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));

export async function createSession(config, { headless = false, managed = null } = {}) {
  const expectedNode = (await readFile(new URL('../.node-version', import.meta.url), 'utf8')).trim();
  if (process.versions.node !== expectedNode) throw new Error(`Dock requires Node.js ${expectedNode}`);
  if (!['darwin', 'linux', 'win32'].includes(process.platform)) throw new Error('Dock supports macOS, Linux and Windows');
  if (!headless && process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error('A visible Dock browser requires a graphical session');
  }
  const id = randomUUID();
  const directory = managed?.directory ?? join(config.stateDir, 'sessions', id);
  const profile = join(directory, 'browser-profile');
  const artifacts = join(directory, 'artifacts');
  await privateDirectory(config.stateDir);
  for (const path of [directory, profile, artifacts]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
  }
  const browserRoot = managed?.browserRoot ?? join(config.stateDir, 'runtime', 'browsers');
  if (!managed) process.env.PLAYWRIGHT_BROWSERS_PATH = browserRoot;
  const { chromium } = await import('playwright-core');
  const executablePath = managed?.browserPath ?? chromium.executablePath();
  await executableExists(executablePath);
  const mcp = await json(packagePath('@playwright/mcp'));
  // SDK's wildcard export resolves package.json inside dist/cjs, without version.
  const sdk = await json(join(dirname(packagePath('@modelcontextprotocol/sdk')), '..', '..', 'package.json'));
  const core = await json(packagePath('playwright-core'));
  const own = await json(new URL('../package.json', import.meta.url));
  const lock = await json(new URL('../package-lock.json', import.meta.url));
  if (mcp.version !== own.dependencies['@playwright/mcp']
      || sdk.version !== own.dependencies['@modelcontextprotocol/sdk']
      || core.version !== lock.packages['node_modules/playwright-core'].version) {
    throw new Error('Installed MCP dependencies do not match the Dock runtime pin');
  }
  const browsers = await json(join(dirname(packagePath('playwright-core')), 'browsers.json'));
  const chromiumRevision = browsers.browsers.find(item => item.name === 'chromium');
  const sourcePin=managed ? await createRuntimeSourcePin(import.meta.url, ['../.node-version', '../package.json', '../package-lock.json']) : await createRuntimeSourcePin(import.meta.url,['../.node-version', '../package.json', '../package-lock.json',
    '../bin/loginom-dock.mjs', '../bin/hermes-mcp.mjs', '../bin/host-session.mjs', './config.mjs', './session.mjs', './catalog.mjs', './action-catalog.mjs', './capability-registry.mjs', './effect-contracts.mjs', './outcome-verification.mjs', './executor.mjs',
    './bridge.mjs', './managed-shutdown.mjs', './workspace.mjs', './workspace-ui.mjs', './node-procedure.mjs', './node-wizard-close.mjs', './node-wizard-open.mjs', './node-apply.mjs', './node-context.mjs', './node-output-context.mjs', './node-table-context.mjs', './node-output-procedure.mjs', './table-format-pages.mjs', './table-output-pages.mjs', './table-output-values.mjs', './node-execution-evidence.mjs', './node-process-context.mjs', './node-execution-procedure.mjs', './text-import-node.mjs', './text-import-limits.mjs', './text-import-limits.json', './text-import-encoding.mjs', './import-definition-pages.mjs', './node-contracts.mjs', './node-target.mjs', './node-target-browser.mjs', './node-contracts.d.ts', './text-import-procedure.mjs', './observation-pages.mjs', './artifacts.mjs', './execution-journal.mjs', './recovery-context.mjs', './platform.mjs', './native.mjs', './clipboard.mjs', './skill.mjs', './hooks.mjs', './history.mjs', './archive.mjs', './redact.mjs',
    '../bin/hook.mjs', '../bin/diagnostic.mjs', '../bin/dispatch.mjs', './hook-runtime.mjs', './install.mjs', './diagnostics.mjs', '../../examples/memory-plugin-shared/lib/mcp-proxy-config.mjs',
    '../../examples/memory-plugin-shared/lib/batch-send.mjs', '../../examples/memory-plugin-shared/lib/capture-utils.mjs',
    '../../examples/memory-plugin-shared/lib/pending-queue.mjs', '../../examples/memory-plugin-shared/lib/retryable.mjs',
    '../../plugins/loginom-dock/.codex-plugin/plugin.json', '../../plugins/loginom-dock/.mcp.json',
    '../../plugins/loginom-dock/hooks/hooks.json', '../../plugins/loginom-dock/scripts/launch.sh',
    '../../plugins/loginom-dock/scripts/launch.cmd', '../../plugins/loginom-dock/skills/loginom/SKILL.md',
    '../../plugins/loginom-dock-hermes/plugin.yaml', '../../plugins/loginom-dock-hermes/__init__.py',
    '../../plugins/loginom-dock-hermes/skills/loginom/SKILL.md']);
  const browserConfig = join(directory, 'playwright.json');
  const downloadScript = join(directory, 'browser-downloads.js');
  await writeFile(downloadScript, browserDownloadScript(config.loginomUrl), { mode: 0o600 });
  // Let visible Loginom use the actual maximized window. A fixed emulated
  // viewport stays small even when the native window is enlarged. Headless
  // checks retain a deterministic size; live geometry guards still apply.
  const browserViewport = headless ? { width: 1280, height: 800 } : null;
  const browserWindowMode = headless ? 'headless' : 'maximized';
  // Executor actions own explicit readiness and pre-gesture guards. MCP's
  // default settle adds 500 ms even to every read-only internal observation.
  const executorMode = ['executor-preview', 'executor-replay'].includes(config.mode);
  await writeFile(browserConfig, JSON.stringify({
    browser: { browserName: 'chromium', userDataDir: profile, initScript: [downloadScript],
      launchOptions: { executablePath, headless, ...(managed ? { chromiumSandbox: true } : {}),
        args: ['--no-proxy-server', ...(!headless ? ['--start-maximized'] : [])] }, contextOptions: { viewport: browserViewport } },
    capabilities: ['core', 'vision'], outputDir: artifacts,
    saveSession: false, timeouts: { action: 15000, navigation: 120000, ...(executorMode ? { settle: 0 } : {}) },
  }), { mode: 0o600 });
  const releaseRoot = fileURLToPath(new URL('../../', import.meta.url));
  const releaseName = relative(join(config.stateDir, 'releases'), releaseRoot);
  const runtimeRelease = /^[0-9A-Za-z.+-]+-[a-f0-9]{12}$/.test(releaseName) ? releaseName : null;
  const metadata = {
    sessionId: id, agent: config.agent, adapterRevision: config.adapterRevision, mode: config.mode,
    resultProfile: config.resultProfile ?? 'diagnostic', loginomUrl: config.loginomUrl ?? null,
    node: process.versions.node, client: own.version, playwrightMcp: mcp.version,
    clientRevision: sourcePin.revision, clientSourceManifest: sourcePin.manifest,
    runtimeRelease,
    playwright: core.version, sdk: sdk.version,
    chromiumRevision: chromiumRevision.revision, chromiumVersion: chromiumRevision.browserVersion, browserViewport, browserWindowMode,
    profile, artifacts, archiveActive: false, skillRevision: null, workspaceReady: false, targetIdentity: null,
  };
  return {
    directory, metadata, browserRoot, browserConfig,
    artifactStore:await createArtifactStore({directory:join(artifacts,'input'),sessionId:id,storageDirectories:config.storageDirectories}),
    browserCli: join(dirname(packagePath('@playwright/mcp')), 'cli.js'),
    async save(catalog) {
      await writeFile(join(directory, 'session.json'), JSON.stringify({
        ...metadata, toolCatalogSha256: catalog.sha256,
      }, null, 2) + '\n', { mode: 0o600 });
      await writeFile(join(directory, 'tools.json'), JSON.stringify(catalog.tools, null, 2) + '\n', { mode: 0o600 });
    },
  };
}
