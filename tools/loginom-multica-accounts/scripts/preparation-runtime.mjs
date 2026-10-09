import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {Diagnostics} from './account-ui.mjs';
import {verifyPairBindings} from './qualify-accounts.mjs';
import {verifyInheritedGuards, verifyRecordedEffects, runAccountLifecycle} from './account-lifecycle.mjs';
import {makeAccountUIAdapter} from './account-session-ui.mjs';
import {makePrivateCaptureHarness} from './capture-harness.mjs';
import {privatePath, savePrivateArtifact} from './parent-readback.mjs';
import {trackVendorSources} from './vendor-provenance.mjs';

// Internal production implementation, called only after the unconditional
// public gate. Fixtures exercise the same adapters on isolated offline pages.
export async function runUIPreparation({configFile, operatorFile, configsFiles, evidenceDir, operationFile}) {
  for (const path of [configFile, operatorFile, operationFile, ...configsFiles]) privatePath(path);
  const operator = JSON.parse(readFileSync(operatorFile));
  const configs = configsFiles.map(path => JSON.parse(readFileSync(path)));
  verifyPairBindings(configs, operator, operatorFile);
  const config = configs.find(value => JSON.stringify(value) === JSON.stringify(JSON.parse(readFileSync(configFile))));
  if (!config) throw Error('PAIR_BINDING_MISMATCH');
  const operation = JSON.parse(readFileSync(operationFile));
  const diagnostics = new Diagnostics(evidenceDir, 300000);
  const envelope = verifyInheritedGuards(process.env.LOGINOM_ACCOUNTS_GUARDS_FILE, configs, operator);
  const effect = verifyRecordedEffects(envelope, configs, operator);
  if (operation.issue_id !== effect.issue_id || operation.operation_id !== effect.attempt_id
    || operation.source.sha !== effect.source_sha || operation.stand !== config.loginom.url) throw Error('CAPTURE_OPERATION_UNKNOWN');
  const captureHarness = makePrivateCaptureHarness({directory: evidenceDir, operation, envelope,
    configs: [operatorFile, ...configsFiles], diagnostics});
  let browser, adapter, receipts;
  try {
    adapter = makeAccountUIAdapter({config, operator, diagnostics, configFile, guardsEnvelope: envelope, captureHarness,
      recordEffect: () => verifyRecordedEffects(envelope, configs, operator),
      openOwnPage: async url => {
        if (!browser) {
          const playwright = (await import(operator.playwright_module)).default;
          browser = await playwright.chromium.launch({headless: true, chromiumSandbox: true, executablePath: operator.browser,
            ...(operator.proxy?.server ? {proxy: {server: operator.proxy.server}} : {})});
        }
        const context = await browser.newContext({viewport: {width: 1400, height: 900}});
        const page = await context.newPage();
        const verifyVendor = trackVendorSources(page);
        const login = new URL(url); login.searchParams.set('testable', 'true');
        await page.goto(login.href, {waitUntil: 'domcontentloaded', timeout: diagnostics.remaining()});
        await page.waitForFunction(() => globalThis.bg?.app?.Application?.FInstance?.FServerConnection === null
          && typeof globalThis.bg?.app?.ServerConnection?.prototype?.DoConnect === 'function', null,
          {timeout: diagnostics.remaining()});
        const vendor = await verifyVendor(); diagnostics.remaining();
        diagnostics.events.push({phase: 'pre-login', action: 'loaded-vendor', state: 'UNKNOWN', vendor});
        diagnostics.save();
        return page;
      }});
    await runAccountLifecycle({config, configs, operator, operatorFile, diagnostics, adapter});
    receipts = adapter.receipts();
  } catch (error) {
    diagnostics.recordError('preparation', 'failure', null, error); throw error;
  } finally {
    try {await adapter?.close();} finally {await browser?.close();}
  }
  // Immutable per-child completion includes every admin and role effect. The
  // coordinator cannot aggregate until this child/supervisor/descendants exit.
  savePrivateArtifact(evidenceDir, 'ui-completion.json', {schema: 'lab53-ui-completion-v1',
    issue_id: operation.issue_id, operation_id: operation.operation_id, source: operation.source,
    role: config.role, state: 'UNKNOWN', ready: false, receipts, expected_observer: operation.expected_observer,
    own_browser_closed: true, diagnostics_sha256: diagnostics.sha256});
  return {state: 'UNKNOWN', ready: false, receipts};
}
