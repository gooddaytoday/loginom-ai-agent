import assert from 'node:assert/strict';
import {test, before, after} from 'node:test';
import {readFileSync, mkdtempSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir, tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Diagnostics, navigate, refresh, errorDetails} from '../scripts/account-ui.mjs';
import {requireFiniteCleanup, verifyPairBindings} from '../scripts/qualify-accounts.mjs';

const operator = JSON.parse(readFileSync(join(homedir(), '.config/loginom-multica/operator.json'), 'utf8'));
const {chromium} = await import(operator.playwright_module);
const fixture = readFileSync(new URL('../fixtures/navigation.html', import.meta.url), 'utf8');
const temporary = mkdtempSync(join(tmpdir(), 'lab53-offline-'));
let browser;
const requests = [];
const ownedProcesses = new Map();
async function recordProcesses() {
  const session = await browser.newBrowserCDPSession();
  try {
    for (const {id, type} of (await session.send('SystemInfo.getProcessInfo')).processInfo) {
      try {
        const raw = readFileSync(`/proc/${id}/stat`, 'utf8');
        const fields = raw.slice(raw.lastIndexOf(')') + 1).trim().split(/\s+/);
        ownedProcesses.set(`${id}:${fields[19]}`, {pid: id, start_ticks: fields[19], type});
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  } finally { await session.detach(); }
}
before(async () => {
  browser = await chromium.launch({headless: true, chromiumSandbox: true, executablePath: operator.browser});
  await recordProcesses();
});
after(async () => {
  if (browser) await recordProcesses();
  await browser?.close();
  assert.deepEqual(requests, [], 'offline tests must not contact Loginom or other services');
  const proofs = [...ownedProcesses.values()].map(record => {
    try {
      const raw = readFileSync(`/proc/${record.pid}/stat`, 'utf8');
      const fields = raw.slice(raw.lastIndexOf(')') + 1).trim().split(/\s+/);
      return {...record, absent: fields[0] === 'Z' || fields[19] !== record.start_ticks};
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return {...record, absent: true};
    }
  });
  assert.ok(proofs.every(record => record.absent), 'own offline Chromium processes must be gone');
  if (process.env.LAB53_OFFLINE_RECEIPT) writeFileSync(process.env.LAB53_OFFLINE_RECEIPT,
    JSON.stringify({schema: 'lab53-offline-browser-v1', chromium_sandbox: true, network_requests: requests.length,
      loginom_logins: 0, observed_processes: proofs, process_cleanup: 'PASS', server_absence: 'NOT_APPLICABLE_NO_LOGIN'}, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  rmSync(temporary, {recursive: true, force: true});
});

async function withPage(trees, operation, timeout = 8000) {
  const context = await browser.newContext();
  await context.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  const diagnostics = new Diagnostics(mkdtempSync(join(temporary, 'evidence-')), timeout);
  try {
    await page.setContent(fixture);
    await page.evaluate(trees => trees.forEach(tree => window.addTree(tree)), trees);
    await operation(page, diagnostics);
  } finally { await recordProcesses(); await context.close(); }
}

test('exact main tree', () => withPage([{}], async (page, diagnostics) => {
  await navigate(page, 'Пользователи', diagnostics);
  assert.deepEqual(await page.evaluate(() => window.clicks),
    ['MF;MapTreeForm;colNavigation_Сервер>Администрирование>Пользователи;TreeText']);
}));

test('exact AdminStart tree and Dispatcher refresh share navigation', () => withPage([
  {prefix: 'MF;TF;AdminStartForm;', target: 'Диспетчер'},
], async (page, diagnostics) => {
  await navigate(page, 'Диспетчер', diagnostics);
  await refresh(page, diagnostics);
  assert.deepEqual(await page.evaluate(() => window.clicks),
    ['MF;TF;AdminStartForm;MapTreeForm;colNavigation_Сервер>Администрирование>Диспетчер;TreeText', 'refresh']);
}));

test('two visible ready trees reject ambiguity before a click', () => withPage([
  {}, {prefix: 'MF;TF;AdminStartForm;'},
], async (page, diagnostics) => {
  await assert.rejects(navigate(page, 'Пользователи', diagnostics), {code: 'NAVIGATION_AMBIGUOUS'});
  assert.deepEqual(await page.evaluate(() => window.clicks), []);
  const failure = JSON.parse(readFileSync(diagnostics.path)).events.at(-1);
  assert.equal(failure.action, 'click-target');
  assert.equal(failure.candidates.filter(value => value.kind === 'target').length, 2);
}));

test('readiness selects one tree regardless of DOM order', async () => {
  for (const trees of [
    [{ready: false}, {prefix: 'MF;TF;AdminStartForm;'}],
    [{prefix: 'MF;TF;AdminStartForm;'}, {ready: false}],
  ]) await withPage(trees, async (page, diagnostics) => {
    await navigate(page, 'Пользователи', diagnostics);
    assert.deepEqual(await page.evaluate(() => window.clicks),
      ['MF;TF;AdminStartForm;MapTreeForm;colNavigation_Сервер>Администрирование>Пользователи;TreeText']);
  });
});

test('collapsed navigator and collapsed Admin folder', () => withPage([
  {prefix: 'MF;TF;AdminStartForm;', expanded: false, collapsed: true},
], async (page, diagnostics) => {
  await navigate(page, 'Пользователи', diagnostics);
  assert.deepEqual(await page.evaluate(() => window.clicks), ['navigator', 'expand:MF;TF;AdminStartForm;',
    'MF;TF;AdminStartForm;MapTreeForm;colNavigation_Сервер>Администрирование>Пользователи;TreeText']);
}));

test('unqualified suffix rejects selection', () => withPage([
  {prefix: 'Unexpected;'},
], async (page, diagnostics) => {
  await assert.rejects(navigate(page, 'Пользователи', diagnostics), {code: 'NAVIGATION_UNQUALIFIED'});
  assert.deepEqual(await page.evaluate(() => window.clicks), []);
}));

test('duplicate exact target rejects selection', () => withPage([
  {}, {},
], async (page, diagnostics) => {
  await assert.rejects(navigate(page, 'Пользователи', diagnostics), {code: 'NAVIGATION_AMBIGUOUS'});
  assert.deepEqual(await page.evaluate(() => window.clicks), []);
}));

test('missing target preserves original phase, action, message and stack', () => withPage([
  {expanded: false, missing: true},
], async (page, diagnostics) => {
  await assert.rejects(navigate(page, 'Пользователи', diagnostics), error => {
    const failure = JSON.parse(readFileSync(diagnostics.path)).events.at(-1);
    assert.equal(failure.phase, 'navigation');
    assert.equal(failure.action, 'wait-target');
    assert.equal(failure.error.name, 'TimeoutError');
    assert.ok(failure.error.message.includes('Timeout'));
    assert.ok(failure.error.stack);
    assert.ok(failure.deadline_at);
    assert.equal(failure.candidates.length, 1);
    assert.deepEqual(Object.keys(diagnostics.publicReceipt(error)).sort(),
      ['code', 'diagnostics_sha256', 'schema', 'status']);
    return true;
  });
  assert.deepEqual(await page.evaluate(() => window.clicks), ['expand:MF;']);
}, 1200));

test('native EBG error details are captured before the Playwright boundary', () => withPage([{}], async (page, diagnostics) => {
  await page.evaluate(() => {
    window.Ext.getCmp = () => { throw Object.assign(new Error('SYNTHETIC_PRIVATE_MESSAGE'), {
      get_message: () => 'SYNTHETIC_NATIVE_MESSAGE', get_stack: () => 'SYNTHETIC_NATIVE_STACK',
    }); };
  });
  await assert.rejects(navigate(page, 'Пользователи', diagnostics), error => {
    const failure = JSON.parse(readFileSync(diagnostics.path)).events.at(-1);
    assert.equal(failure.error.browser_error.get_message, 'SYNTHETIC_NATIVE_MESSAGE');
    assert.equal(failure.error.browser_error.get_stack, 'SYNTHETIC_NATIVE_STACK');
    assert.ok(!JSON.stringify(diagnostics.publicReceipt(error)).includes('SYNTHETIC'));
    return true;
  });
}));

test('private diagnostics retain cause chain, public receipt allowlists fields', async () => {
  const diagnostics = new Diagnostics(mkdtempSync(join(temporary, 'evidence-')));
  const native = Object.assign(new Error('SYNTHETIC_PASSWORD'), {
    get_message: () => 'SYNTHETIC_RPC_MESSAGE', get_stack: () => 'SYNTHETIC_RPC_STACK',
  });
  const error = Object.assign(new Error('SYNTHETIC_SECRET', {cause: native}), {code: 'SYNTHETIC_PASSWORD'});
  await assert.rejects(diagnostics.run('qualification', 'read-rights', 'private-selector', async () => { throw error; }));
  assert.equal(errorDetails(error).cause.get_stack, 'SYNTHETIC_RPC_STACK');
  assert.equal(statSync(diagnostics.path).mode & 0o777, 0o600);
  assert.equal(statSync(diagnostics.directory).mode & 0o777, 0o700);
  assert.equal(diagnostics.publicReceipt(error).code, 'UI_ERROR');
  assert.ok(!JSON.stringify(diagnostics.publicReceipt(error)).includes('SYNTHETIC'));
});

test('finite method cannot be enabled with receipt/config booleans', () => {
  assert.throws(() => requireFiniteCleanup({server_absence: true, allow_live: true}), {code: 'BLOCKED_FINITE_SERVER_CLEANUP'});
});

test('direct provision-account invocation blocks before credential read or browser import', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/provision-account.mjs', import.meta.url)),
    '--config', '/missing/private-config.json', '--operator', '/missing/private-operator.json'], {encoding: 'utf8'});
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).code, 'BLOCKED_FINITE_SERVER_CLEANUP');
  assert.ok(!result.stderr.includes('ENOENT'));
});

test('pair binding rejects same identity, different stand and provider auth', () => {
  const configs = ['worker', 'reviewer'].map(role => ({role, stage: 'stage0', agent_id: role, workspace_id: 'workspace',
    issue_id: 'issue', loginom: {username: role, url: 'https://fixture.invalid'}}));
  const operator = {agents: {worker: 'worker', reviewer: 'reviewer'}, workspace_id: 'workspace', url: 'https://fixture.invalid'};
  assert.equal(verifyPairBindings(configs, operator).distinct_identities, true);
  const sameIdentity = structuredClone(configs);
  sameIdentity[1].loginom.username = sameIdentity[0].loginom.username;
  assert.throws(() => verifyPairBindings(sameIdentity, operator), {code: 'PAIR_BINDING_MISMATCH'});
  const wrongStand = structuredClone(configs);
  wrongStand[1].loginom.url = 'https://other.invalid';
  assert.throws(() => verifyPairBindings(wrongStand, operator), {code: 'PAIR_BINDING_MISMATCH'});
  const provider = structuredClone(configs);
  provider[0].provider_auth_files = [];
  assert.throws(() => verifyPairBindings(provider, operator), {code: 'PAIR_BINDING_MISMATCH'});
});
