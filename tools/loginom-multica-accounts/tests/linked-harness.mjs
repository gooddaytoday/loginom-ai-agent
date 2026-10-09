// Isolated offline fixture driver, never a production entrypoint or admission.
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {Diagnostics} from '../scripts/account-ui.mjs';
import {accountPolicy, verifyInheritedGuards, verifyRecordedEffects, runAccountLifecycle} from '../scripts/account-lifecycle.mjs';
import {makeAccountUIAdapter} from '../scripts/account-session-ui.mjs';
import {makePrivateCaptureHarness} from '../scripts/capture-harness.mjs';
import {savePrivateArtifact} from '../scripts/parent-readback.mjs';
const [operatorFile, operationFile, workerFile, reviewerFile, directory, mode = 'normal'] = process.argv.slice(2);
const operator = JSON.parse(readFileSync(operatorFile)), operation = JSON.parse(readFileSync(operationFile));
const configs = [workerFile, reviewerFile].map(path => JSON.parse(readFileSync(path)));
const dependencies = JSON.parse(readFileSync(process.env.LAB53_FIXTURE_DEPENDENCIES));
const {chromium} = await import(dependencies.playwright_module);
const browser = await chromium.launch({headless: true, chromiumSandbox: true, executablePath: dependencies.browser});
const observed = new Map(), requests = [];
async function processReceipt() {
  const session = await browser.newBrowserCDPSession();
  try {
    for (const {id} of (await session.send('SystemInfo.getProcessInfo')).processInfo) {
      try {const f = readFileSync(`/proc/${id}/stat`, 'utf8').split(')').at(-1).trim().split(/\s+/);
        observed.set(`${id}:${f[19]}`, {pid: id, start_ticks: f[19]});}
      catch (error) {if (error.code !== 'ENOENT') throw error;}
    }
  } finally {await session.detach();}
}
const diagnostics = new Diagnostics(directory, 12000);
const envelope = verifyInheritedGuards(process.env.LOGINOM_ACCOUNTS_GUARDS_FILE, configs, operator);
const captureHarness = makePrivateCaptureHarness({directory, operation, envelope,
  configs: [operatorFile, workerFile, reviewerFile], diagnostics});
const receipts = [], adapters = [];
try {
  for (const config of configs) {
    const adapter = makeAccountUIAdapter({config, operator, diagnostics, captureHarness,
      recordEffect: () => verifyRecordedEffects(envelope, configs, operator),
      openOwnPage: async () => {
        const context = await browser.newContext();
        await context.route('**/*', route => {requests.push(route.request().url()); return route.abort();});
        const page = await context.newPage();
        const html = readFileSync(new URL('../fixtures/navigation.html', import.meta.url), 'utf8')
          + readFileSync(new URL('../fixtures/accounts.html', import.meta.url), 'utf8');
        await page.setContent(html);
        await page.evaluate(options => {addTree({}); installAccounts(options);},
          {policy: accountPolicy, brokenDisconnect: mode === 'logout'});
        await page.evaluate(guid => window.accountGuid = guid, randomUUID());
        // Explicit synthetic socket lifecycle event, no frames/network. It does
        // not substitute for the native trace, which uses the actual adapter.
        if (mode === 'rights') await page.evaluate(() => {
          const initial = bg.app.ServerConnection.prototype.GetCurrentUser;
          bg.app.ServerConnection.prototype.GetCurrentUser = async function () {
            const user = await initial.call(this); user.get_IsViewer = async () => false; return user;
          };
        });
        setTimeout(() => page.emit('websocket', new EventEmitter()), 1);
        return page;
      }});
    adapters.push(adapter);
    await runAccountLifecycle({config, configs, operator, operatorFile, diagnostics, adapter});
    receipts.push(...adapter.receipts());
  }
} finally {
  for (const adapter of adapters) await adapter.close();
  await processReceipt(); await browser.close();
  if (requests.length) throw Error('OFFLINE_NETWORK_REQUEST');
  savePrivateArtifact(directory, 'fixture-browser.json', {sandbox: true, network_requests: requests.length,
    observed_processes: [...observed.values()], state: 'UNKNOWN', fixture: true});
}
savePrivateArtifact(directory, 'ui-completion.json', {schema: 'lab53-ui-completion-v1', source: operation.source,
  issue_id: operation.issue_id, operation_id: operation.operation_id, receipts, expected_observer: operation.expected_observer,
  role: 'offline-both', own_browser_closed: true, state: 'UNKNOWN', ready: false});
