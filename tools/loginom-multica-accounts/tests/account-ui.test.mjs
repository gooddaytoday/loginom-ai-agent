import assert from 'node:assert/strict';
import {test, before, after} from 'node:test';
import {readFileSync, mkdtempSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {homedir, tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Diagnostics, navigate, refresh, errorDetails} from '../scripts/account-ui.mjs';
import {requireFiniteCleanup, verifyPairBindings} from '../scripts/qualify-accounts.mjs';
import {runAccountLifecycle, verifyFinalReadback, verifyHistoricalAccountBucket, readFinalServerInventory, accountPolicy} from '../scripts/account-lifecycle.mjs';
import {loginOwnPage, logoutOwnPage, readOwnClient, makeAccountUIAdapter} from '../scripts/account-session-ui.mjs';
import {createParentRequest, buildParentResponse, consumeParentResponse, collectLoadedDispatcher} from '../scripts/parent-readback.mjs';
import {verifyCausalCapture} from '../scripts/account-identity.mjs';

const operator = JSON.parse(readFileSync(join(homedir(), '.config/loginom-multica/operator.json'), 'utf8'));
const {chromium} = await import(operator.playwright_module);
const fixture = readFileSync(new URL('../fixtures/navigation.html', import.meta.url), 'utf8');
const lifecycleFixture = readFileSync(new URL('../fixtures/lifecycle.html', import.meta.url), 'utf8');
const accountsFixture = readFileSync(new URL('../fixtures/accounts.html', import.meta.url), 'utf8');
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

for (const scope of ['MF;', 'MF;TF;AdminStartForm;']) {
  for (const reversed of [false, true]) {
    test(`ready collapsed scope ${scope}, reversed DOM ${reversed}`, () => withPage(
      (reversed ? [false, true] : [true, false]).map(ready => ({
        prefix: ready ? scope : scope === 'MF;' ? 'MF;TF;AdminStartForm;' : 'MF;',
        ready, expanded: !ready,
      })), async (page, diagnostics) => {
        await navigate(page, 'Пользователи', diagnostics);
        assert.deepEqual(await page.evaluate(() => window.clicks), [`expand:${scope}`,
          `${scope}MapTreeForm;colNavigation_Сервер>Администрирование>Пользователи;TreeText`]);
      }));
  }
}

test('ready collapsed scope waits for its delayed target despite stale visible target', () => withPage([
  {ready: false}, {prefix: 'MF;TF;AdminStartForm;', expanded: false},
], async (page, diagnostics) => {
  await page.evaluate(() => {
    const tree = document.querySelectorAll('.x-tree-view')[1];
    const expander = tree.querySelector('.x-tree-expander');
    const original = expander.onclick;
    expander.onclick = () => {
      original();
      tree.querySelectorAll('tr')[1].hidden = true;
      setTimeout(() => { tree.querySelectorAll('tr')[1].hidden = false; }, 100);
    };
  });
  await navigate(page, 'Пользователи', diagnostics);
  assert.deepEqual(await page.evaluate(() => window.clicks), ['expand:MF;TF;AdminStartForm;',
    'MF;TF;AdminStartForm;MapTreeForm;colNavigation_Сервер>Администрирование>Пользователи;TreeText']);
}));

test('ready collapsed scopes reject ambiguity before expansion', () => withPage([
  {expanded: false}, {prefix: 'MF;TF;AdminStartForm;', expanded: false},
], async (page, diagnostics) => {
  await assert.rejects(navigate(page, 'Пользователи', diagnostics), {code: 'NAVIGATION_AMBIGUOUS'});
  assert.deepEqual(await page.evaluate(() => window.clicks), []);
}));

test('ready collapsed scope beside unknown visible target blocks before expansion', () => withPage([
  {expanded: false}, {prefix: 'Unexpected;', ready: false},
], async (page, diagnostics) => {
  // Leave only the unknown target: folder-only selection must not hide it.
  await page.evaluate(() => document.querySelectorAll('.x-tree-view')[1].querySelector('tr').hidden = true);
  await assert.rejects(navigate(page, 'Пользователи', diagnostics), {code: 'NAVIGATION_UNQUALIFIED'});
  assert.deepEqual(await page.evaluate(() => window.clicks), []);
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

test('expired deadline preserves original provision error without authorizing a gesture', async () => {
  const diagnostics = new Diagnostics(mkdtempSync(join(temporary, 'evidence-')), -1);
  const deadline = diagnostics.deadline;
  const native = Object.assign(new Error('SYNTHETIC_NATIVE_PASSWORD'), {
    get_message: () => 'SYNTHETIC_NATIVE_MESSAGE', get_stack: () => 'SYNTHETIC_NATIVE_STACK',
  });
  const original = Object.assign(new Error('SYNTHETIC_ORIGINAL_PASSWORD', {cause: native}), {
    code: 'SYNTHETIC_PRIVATE_CODE', get_message: () => 'SYNTHETIC_RPC_MESSAGE', get_stack: () => 'SYNTHETIC_RPC_STACK',
    browser_error: {name: 'EBGException', message: 'SYNTHETIC_BROWSER_MESSAGE', get_stack: 'SYNTHETIC_BROWSER_STACK'},
  });
  const receipt = diagnostics.recordError('provision', 'failure', 'private-selector', original);
  const snapshot = diagnostics.path;
  const raw = readFileSync(snapshot, 'utf8');
  const failure = JSON.parse(raw).events.at(-1);
  assert.equal(failure.phase, 'provision');
  assert.equal(failure.action, 'failure');
  assert.equal(failure.error.message, original.message);
  assert.equal(failure.error.stack, original.stack);
  assert.equal(failure.error.code, original.code);
  assert.equal(failure.error.get_message, 'SYNTHETIC_RPC_MESSAGE');
  assert.equal(failure.error.get_stack, 'SYNTHETIC_RPC_STACK');
  assert.equal(failure.error.cause.get_message, 'SYNTHETIC_NATIVE_MESSAGE');
  assert.equal(failure.error.cause.get_stack, 'SYNTHETIC_NATIVE_STACK');
  assert.deepEqual(failure.error.browser_error, original.browser_error);
  assert.equal(diagnostics.deadline, deadline);
  assert.equal(failure.deadline_at, new Date(deadline).toISOString());
  assert.equal(statSync(snapshot).mode & 0o777, 0o600);
  assert.equal(receipt.code, 'UI_ERROR');
  assert.deepEqual(Object.keys(receipt).sort(), ['code', 'diagnostics_sha256', 'schema', 'status']);
  assert.ok(!JSON.stringify(receipt).includes('SYNTHETIC'));
  let gestures = 0;
  await assert.rejects(diagnostics.run('navigation', 'blocked-after-deadline', null, async () => gestures++),
    {code: 'NAVIGATION_DEADLINE'});
  assert.equal(gestures, 0);
  assert.equal(readFileSync(snapshot, 'utf8'), raw);
  assert.equal(diagnostics.deadline, deadline);
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

const syntheticHash = value => createHash('sha256').update(value).digest('hex');
async function lifecycleCase(page, diagnostics, changes = {}) {
  const operatorFile = '/private/synthetic-operator.json';
  const operator = {admin_user: 'synthetic-admin', url: 'https://fixture.invalid', agents: {worker: 'w', reviewer: 'r'}, workspace_id: 'fixture'};
  const configs = ['worker', 'reviewer'].map(role => ({role, stage: 'stage0', agent_id: operator.agents[role],
    workspace_id: operator.workspace_id, issue_id: 'synthetic-issue', operator_file: operatorFile,
    loginom: {url: operator.url, username: 'synthetic-' + role}}));
  const identity = {username: configs[0].loginom.username, user_hash: syntheticHash(configs[0].loginom.username),
    guid_hash: syntheticHash('synthetic-owned-guid'), session_id: 41, create_time: '2026-10-09T00:00:00Z',
    stand: operator.url, connected: true, ...changes.identity};
  identity.own_session_positive = {connected: true, guid_hash: identity.guid_hash, user_hash: identity.user_hash,
    role: configs[0].role, stand: operator.url, ...changes.ownSession};
  identity.own_session_count = changes.identity?.own_session_count ?? 1;
  identity.causal_proof_sha256 = syntheticHash('synthetic-causal-proof');
  identity.observer_positive = {connected: true, mst_self_count: 1, guid_hash: syntheticHash('synthetic-parent'),
    session_id: 99, create_time: '2026-10-09T00:00:00Z', ...changes.observer};
  await page.evaluate(({html, identity, rights}) => {
    document.body.insertAdjacentHTML('beforeend', html);
    document.querySelector('#synthetic-identity').textContent = JSON.stringify(identity);
    document.querySelector('#synthetic-rights').textContent = JSON.stringify(rights);
  }, {html: lifecycleFixture, identity, rights: {...accountPolicy, effective: true, ...changes.rights}});
  const actions = [];
  const adapter = {
    recordEffect: async config => {
      actions.push('record-effect');
      await page.locator('#synthetic-effect').evaluate(element => element.textContent = 'UNKNOWN');
      return {state: changes.effect ?? 'UNKNOWN', issue_id: config.issue_id};
    },
    provision: async () => {
      actions.push('provision');
      assert.equal(await page.locator('#synthetic-effect').textContent(), 'UNKNOWN');
      await navigate(page, 'Пользователи', diagnostics);
    },
    login: async () => { actions.push('login'); await page.locator('#synthetic-login').click(); },
    identity: async () => { actions.push('identity'); return JSON.parse(await page.locator('#synthetic-identity').textContent()); },
    rights: async () => { actions.push('rights'); return JSON.parse(await page.locator('#synthetic-rights').textContent()); },
    logout: async () => {
      actions.push('logout');
      await page.locator('#synthetic-logout').click();
      return {ui_logout_invoked: true, transport_disconnected: changes.logout ??
        ((await page.locator('#synthetic-connected').textContent()) === 'false'), guid_hash: identity.guid_hash};
    },
  };
  return {options: {config: configs[0], configs, operator, operatorFile, diagnostics, adapter}, actions};
}

test('connected offline lifecycle records effect, verifies pair/identity/rights and logs out before pending cleanup', () => withPage([{}], async (page, diagnostics) => {
  const fixture = await lifecycleCase(page, diagnostics);
  const result = await runAccountLifecycle(fixture.options);
  assert.deepEqual(fixture.actions, ['record-effect', 'provision', 'login', 'identity', 'rights', 'logout']);
  assert.equal(result.status, 'UI_QUALIFIED_CLEANUP_PENDING');
  assert.equal(result.state, 'UNKNOWN');
  assert.equal(result.ready, false);
  assert.equal(await page.locator('#synthetic-connected').textContent(), 'false');
  await assert.rejects(readFinalServerInventory(), {code: 'FINAL_SERVER_READBACK_NOT_IMPLEMENTED'});
}));

for (const [label, rights] of [['admin', {chkAdmin: true}], ['viewer', {chkViewer: false}],
  ['missing effective policy', {chkSchedulerFullAccess: undefined}], ['unconfirmed', {effective: false}]]) {
  test(`lifecycle rejects incomplete rights ${label} and still attempts own logout`, () => withPage([{}], async (page, diagnostics) => {
    const fixture = await lifecycleCase(page, diagnostics, {rights});
    await assert.rejects(runAccountLifecycle(fixture.options), {code: 'ACCOUNT_RIGHTS_UNCONFIRMED'});
    assert.equal(fixture.actions.at(-1), 'logout');
    assert.equal(await page.locator('#synthetic-connected').textContent(), 'false');
    const snapshot = JSON.parse(readFileSync(diagnostics.path));
    assert.equal(snapshot.events.at(-1).error.code, 'ACCOUNT_RIGHTS_UNCONFIRMED');
  }));
}
for (const [label, identity] of [['wrong account', {username: 'foreign'}], ['nonunique own session', {own_session_count: 2}],
  ['missing GUID', {guid_hash: null}], ['wrong stand', {stand: 'https://foreign.invalid'}]]) {
  test(`lifecycle rejects incomplete identity ${label}`, () => withPage([{}], async (page, diagnostics) => {
    const fixture = await lifecycleCase(page, diagnostics, {identity});
    await assert.rejects(runAccountLifecycle(fixture.options), {code: 'ACCOUNT_IDENTITY_UNCONFIRMED'});
    assert.ok(!fixture.actions.includes('rights'));
    assert.equal(fixture.actions.at(-1), 'logout');
  }));
}
test('lifecycle rejects incomplete logout and does not declare ready', () => withPage([{}], async (page, diagnostics) => {
  const fixture = await lifecycleCase(page, diagnostics, {logout: false});
  await assert.rejects(runAccountLifecycle(fixture.options), {code: 'ACCOUNT_LOGOUT_UNCONFIRMED'});
}));
test('unrecorded effect blocks every potentially Loginom action', () => withPage([{}], async (page, diagnostics) => {
  const fixture = await lifecycleCase(page, diagnostics, {effect: 'claimed-clean'});
  await assert.rejects(runAccountLifecycle(fixture.options), {code: 'ACCOUNT_EFFECT_UNRECORDED'});
  assert.deepEqual(fixture.actions, ['record-effect']);
  assert.deepEqual(await page.evaluate(() => window.clicks), []);
}));
test('operator/pair mismatch blocks before even recording an effect', () => withPage([{}], async (page, diagnostics) => {
  const fixture = await lifecycleCase(page, diagnostics);
  fixture.options.configs[1].operator_file = '/foreign/operator.json';
  await assert.rejects(runAccountLifecycle(fixture.options), {code: 'PAIR_BINDING_MISMATCH'});
  assert.deepEqual(fixture.actions, []);
}));

function syntheticReadback() {
  const observer = {connected: true, mst_self_count: 1, guid_hash: syntheticHash('observer'), user_hash: syntheticHash('admin'),
    session_id: 9, create_time: '2026-10-09T00:00:00Z'};
  const effect = {guid_hash: syntheticHash('owned'), user_hash: syntheticHash('worker'), session_id: 10,
    create_time: '2026-10-09T00:00:00Z', stand: 'https://fixture.invalid'};
  return {effect, readback: {source: 'existing-authorized-admin', stand: effect.stand,
    loaded: true, refresh_complete: true, packages_complete: true, refreshed_at: '2026-10-09T00:01:00Z',
    manager_count: 1, store_count: 1, observer, calibration: {observer_guid_hash: observer.guid_hash, stand: effect.stand},
    rows: [{...observer, type: 'mstSelf', packages: []}]}};
}
test('complete calibrated server component remains insufficient for ready', () => {
  const {readback, effect} = syntheticReadback();
  assert.deepEqual(verifyFinalReadback(readback, [effect], '2026-10-09T00:00:30Z'), {status: 'SERVER_COMPONENT_CHECKED', ready: false});
});
for (const field of ['loaded', 'refresh_complete', 'packages_complete', 'manager_count', 'store_count']) {
  test(`incomplete final readback ${field} is rejected`, () => {
    const {readback, effect} = syntheticReadback();
    readback[field] = typeof readback[field] === 'boolean' ? false : 2;
    assert.throws(() => verifyFinalReadback(readback, [effect], '2026-10-09T00:00:30Z'), {code: 'FINAL_SERVER_READBACK_INCOMPLETE'});
  });
}
test('stale final inventory cannot authorize the next operation', () => {
  const {readback, effect} = syntheticReadback();
  assert.throws(() => verifyFinalReadback(readback, [effect], '2026-10-09T00:02:00Z'), {code: 'FINAL_SERVER_READBACK_INCOMPLETE'});
});
test('present exact owned server effect blocks; no foreign session is closed', () => {
  const {readback, effect} = syntheticReadback();
  readback.rows.push({...effect, type: 'mstDisconnected', packages: []});
  readback.manager_count = readback.store_count = 2;
  const before = JSON.stringify(readback);
  assert.throws(() => verifyFinalReadback(readback, [effect], '2026-10-09T00:00:30Z'), {code: 'OWN_SERVER_EFFECT_PRESENT'});
  assert.equal(JSON.stringify(readback), before);
});
test('uncalibrated observer and unbound effects block final server proof', () => {
  const {readback, effect} = syntheticReadback();
  readback.rows[0].guid_hash = syntheticHash('foreign');
  assert.throws(() => verifyFinalReadback(readback, [effect], '2026-10-09T00:00:30Z'), {code: 'FINAL_SERVER_CALIBRATION_UNCONFIRMED'});
  readback.rows[0].guid_hash = readback.observer.guid_hash;
  assert.throws(() => verifyFinalReadback(readback, [{...effect, guid_hash: null}], '2026-10-09T00:00:30Z'), {code: 'FINAL_SERVER_EFFECT_UNBOUND'});
});

const ownConfig = {issue_id: '01a11e17-b869-7550-8450-35e5e17119d4', role: 'worker', account_state: 'planned',
  marker: 'fixture-owned-marker', loginom: {url: 'about:blank', username: 'worker', password: 'synthetic-password'}};
async function installAccounts(page, options = {}) {
  await page.setContent(fixture + accountsFixture);
  await page.evaluate(options => {addTree({}); installAccounts(options);}, {policy: accountPolicy, ...options});
}

test('native UI adapter verifies fresh client getters and original transport disposal', () => withPage([], async (page, diagnostics) => {
  await installAccounts(page);
  const client = await loginOwnPage(page, ownConfig, diagnostics);
  assert.equal(client.guid_hash, syntheticHash('ABCDEF00-1234-1234-1234-123456789ABC'), 'GUID hashing preserves exact case');
  assert.equal(client.rights.chkAdmin, false);
  const result = await logoutOwnPage(page, ownConfig, client, diagnostics);
  assert.equal(result.transport_disconnected, true);
  assert.equal(result.server_absence, 'NOT_PROVED');
  assert.deepEqual(await page.evaluate(() => actions), ['login', 'avatar', 'logout']);
}));
test('login screen without original connector disposal leaves logout unconfirmed', () => withPage([], async (page, diagnostics) => {
  await installAccounts(page, {brokenDisconnect: true});
  const client = await loginOwnPage(page, ownConfig, diagnostics);
  diagnostics.deadline = Date.now() + 800;
  await assert.rejects(logoutOwnPage(page, ownConfig, client, diagnostics), /Timeout/);
  assert.equal(await page.locator('[data-tid="LoginForm;Login;edtUsername"]').isVisible(), true);
}));
for (const [option, code] of [['wrongUser', 'ACCOUNT_CLIENT_IDENTITY_UNCONFIRMED'], ['reject', 'ACCOUNT_LOGIN_REJECTED']]) {
  test(`native login rejects ${option} without retry`, () => withPage([], async (page, diagnostics) => {
    await installAccounts(page, {[option]: true});
    await assert.rejects(loginOwnPage(page, ownConfig, diagnostics), {code});
    assert.deepEqual(await page.evaluate(() => actions), ['login']);
  }));
}
test('changed own GUID blocks logout before any gesture', () => withPage([], async (page, diagnostics) => {
  await installAccounts(page);
  const client = await loginOwnPage(page, ownConfig, diagnostics);
  await page.evaluate(() => window.accountGuid = '00000000-1234-1234-1234-123456789abc');
  await assert.rejects(logoutOwnPage(page, ownConfig, client, diagnostics), {code: 'ACCOUNT_LOGOUT_IDENTITY_CHANGED'});
  assert.deepEqual(await page.evaluate(() => actions), ['login']);
}));
test('expired native login deadline and missing fresh rights both fail closed', () => withPage([], async (page, diagnostics) => {
  await installAccounts(page);
  diagnostics.deadline = Date.now() - 1;
  await assert.rejects(loginOwnPage(page, ownConfig, diagnostics), {code: 'NAVIGATION_DEADLINE'});
  assert.deepEqual(await page.evaluate(() => actions), []);
  const fresh = new Diagnostics(mkdtempSync(join(temporary, 'fresh-')));
  await loginOwnPage(page, ownConfig, fresh);
  await page.evaluate(async () => {const user = await bg.app.Application.FInstance.FServerConnection.GetCurrentUser(); user.get_IsViewer = async () => undefined;});
  await assert.rejects(readOwnClient(page, ownConfig), {code: 'ACCOUNT_CLIENT_IDENTITY_UNCONFIRMED'});
}));
test('native client getter error preserves private native details', () => withPage([], async (page, diagnostics) => {
  await installAccounts(page); await loginOwnPage(page, ownConfig, diagnostics);
  await page.evaluate(() => bg.app.Application.FInstance.FServerConnection.GetCurrentUser = async () => {
    throw Object.assign(Error('private-native-error'), {get_message: () => 'native-message', get_stack: () => 'native-stack'});
  });
  await assert.rejects(readOwnClient(page, ownConfig), error => error.code === 'ACCOUNT_CLIENT_READ_FAILED'
    && error.browser_error.get_message === 'native-message' && error.browser_error.get_stack === 'native-stack');
}));
for (const existing of [false, true]) {
  test(`production provision adapter reopens exact policy; existing=${existing}`, () => withPage([], async (page, diagnostics) => {
    await installAccounts(page, {existing});
    const adapter = makeAccountUIAdapter({config: ownConfig, operator: {admin_user: 'admin', admin_password: 'synthetic'},
      diagnostics, recordEffect: async () => ({state: 'UNKNOWN', issue_id: ownConfig.issue_id}),
      openOwnPage: async () => page});
    await assert.rejects(adapter.provision(), {code: 'ACCOUNT_EFFECT_UNRECORDED'});
    await adapter.recordEffect(ownConfig);
    await adapter.provision();
    const actions = await page.evaluate(() => window.actions);
    assert.equal(actions.includes('apply'), !existing);
    assert.ok(actions.indexOf('reopen') < actions.indexOf('logout'));
    const facts = JSON.parse(readFileSync(diagnostics.path)).events;
    assert.ok(facts.some(event => event.action === 'connection-receipt' && event.value.guid_hash));
    assert.ok(facts.some(event => event.action === 'reopened-policy' && event.value.policy.chkRunner === false));
  }));
}
test('nonadmin numeric identity gap cannot become ready; source adapter still logs out its owned client', () => withPage([], async (page, diagnostics) => {
  await installAccounts(page);
  const adapter = makeAccountUIAdapter({config: ownConfig, operator: {}, diagnostics,
    recordEffect: async () => ({state: 'UNKNOWN', issue_id: ownConfig.issue_id}), openOwnPage: async () => page});
  await adapter.recordEffect(ownConfig); await adapter.login();
  await assert.rejects(adapter.identity(), {code: 'ACCOUNT_NUMERIC_IDENTITY_NOT_EXPOSED'});
  assert.equal((await adapter.logout()).transport_disconnected, true);
}));
test('linked production UI lifecycle remains UNKNOWN without qualified parent capture and disposes both own transports', () => withPage([], async (page, diagnostics) => {
  const operatorFile = '/private/offline-operator.json';
  const op = {admin_user: 'admin', admin_password: 'synthetic', url: 'about:blank', agents: {worker: 'w', reviewer: 'r'}, workspace_id: 'fixture'};
  const configs = ['worker', 'reviewer'].map(role => ({...ownConfig, role, stage: 'stage0', agent_id: op.agents[role],
    workspace_id: 'fixture', operator_file: operatorFile, loginom: {...ownConfig.loginom, username: role}}));
  const pages = [];
  const adapter = makeAccountUIAdapter({config: configs[0], operator: op, diagnostics,
    recordEffect: async () => ({state: 'UNKNOWN', issue_id: ownConfig.issue_id}),
    openOwnPage: async () => {const owned = await page.context().newPage(); pages.push(owned); await installAccounts(owned); return owned;}});
  await assert.rejects(runAccountLifecycle({config: configs[0], configs, operator: op, operatorFile, diagnostics, adapter}),
    {code: 'ACCOUNT_NUMERIC_IDENTITY_NOT_EXPOSED'});
  assert.equal(pages.length, 2);
  for (const owned of pages) assert.ok((await owned.evaluate(() => actions)).includes('logout'));
  await adapter.close();
}));
test('lifecycle keeps own-session positive separate from observer mstSelf', () => withPage([{}], async (page, diagnostics) => {
  const fixture = await lifecycleCase(page, diagnostics, {observer: {mst_self_count: 2}});
  await assert.rejects(runAccountLifecycle(fixture.options), {code: 'ACCOUNT_IDENTITY_UNCONFIRMED'});
  assert.equal(fixture.actions.at(-1), 'logout');
}));

function parentOperation() {
  const directory = mkdtempSync(join(temporary, 'parent-'));
  const operatorFile = join(directory, 'operator.json');
  const operator = {admin_user: 'admin', url: 'about:blank', agents: {worker: 'w', reviewer: 'r'}, workspace_id: 'fixture'};
  const roles = ['worker', 'reviewer'].map(role => ({role, issue_id: ownConfig.issue_id, stage: 'stage0',
    agent_id: operator.agents[role], workspace_id: 'fixture', operator_file: operatorFile,
    loginom: {url: operator.url, username: role}}));
  const configs = [operatorFile, join(directory, 'worker.json'), join(directory, 'reviewer.json')];
  [operator, ...roles].forEach((value, i) => writeFileSync(configs[i], JSON.stringify(value), {mode: 0o600}));
  const source = {sha: 'a'.repeat(40), tree: 'b'.repeat(40), manifest_sha256: syntheticHash('manifest')};
  const operationId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const effects = ['admin', 'worker', 'reviewer'].map((user, i) => ({user_hash: syntheticHash(user), guid_hash: syntheticHash('owned-' + user),
    session_id: 101 + i, create_time: '2026-10-09T00:00:00Z', stand: 'about:blank'}));
  // An actual, completed child supplies exact PID/start_ticks provenance.
  const child = spawnSync('python3', ['-c', "import os,json;f=open('/proc/self/stat').read().rsplit(')',1)[1].split();print(json.dumps({'pid':os.getpid(),'start_ticks':f[19]}))"], {encoding: 'utf8'});
  assert.equal(child.status, 0);
  const cleanupFile = join(directory, 'cleanup.json'), logoutFile = join(directory, 'logout.json');
  const bound = {issue_id: ownConfig.issue_id, operation_id: operationId, source_sha: source.sha};
  writeFileSync(cleanupFile, JSON.stringify({...bound, phase: 'process-cleanup', process_cleanup: 'PASS', failure: null,
    returncode: 0, processes: [JSON.parse(child.stdout)]}), {mode: 0o600});
  writeFileSync(logoutFile, JSON.stringify({...bound, effects, all_ui_logout_invoked: true, all_transports_disconnected: true}), {mode: 0o600});
  const inputs = {directory, issueId: ownConfig.issue_id, operationId, source, stand: 'about:blank', configs, effects, cleanupFile, logoutFile};
  const request = createParentRequest(inputs);
  const expected = {...bound, source_tree: source.tree, manifest_sha256: source.manifest_sha256,
    config_paths: configs, cleanup_file: cleanupFile, logout_file: logoutFile};
  return {directory, request, inputs, expected};
}
async function parentResponse(page, operation) {
  await installAccounts(page);
  await loginOwnPage(page, {...ownConfig, loginom: {...ownConfig.loginom, username: 'admin'}}, new Diagnostics(mkdtempSync(join(temporary, 'collector-'))));
  await page.evaluate(() => installDispatcher());
  const refresh = {action: 'native-Refresh', started_at: new Date().toISOString(), completed_at: new Date().toISOString(), receipt_sha256: syntheticHash('fixture-refresh')};
  const raw = await page.evaluate(collectLoadedDispatcher);
  const response = buildParentResponse(operation.request, raw, refresh);
  const responseFile = join(operation.directory, 'response.json');
  writeFileSync(responseFile, JSON.stringify(response), {mode: 0o600});
  return {response, responseFile};
}
test('full getter/store/package readback binds operation and consumes nonce once without ready', () => withPage([], async page => {
  const operation = parentOperation(), {responseFile, response} = await parentResponse(page, operation);
  assert.equal(response.readback.rows.length, 2); assert.equal(response.readback.rows[0].packages.length, 1);
  assert.ok(!JSON.stringify(response).includes('ABCDEF00'));
  const options = {...operation, requestFile: join(operation.directory, 'parent-request.json'), responseFile};
  const result = await readFinalServerInventory(options);
  assert.equal(result.ready, false);
  await assert.rejects(readFinalServerInventory(options), {code: 'EEXIST'});
}));
for (const [label, mutate] of [
  ['old nonce', x => x.nonce = '0'.repeat(64)],
  ['old SHA', x => x.source.sha = 'c'.repeat(40)],
  ['invalid time', x => x.readback.refreshed_at = 'invalid'],
  ['stale snapshot', x => x.readback.refreshed_at = '2026-01-01T00:00:00Z'],
  ['incomplete packages', x => x.readback.packages_complete = false],
  ['missing full store', x => x.readback.store_count = 1],
  ['wrong target', x => x.effects_sha256 = '0'.repeat(64)],
  ['new observer login', x => x.new_browser_or_login = true],
]) {
  test(`parent response rejects ${label}`, () => withPage([], async page => {
    const operation = parentOperation(), {response, responseFile} = await parentResponse(page, operation);
    mutate(response); writeFileSync(responseFile, JSON.stringify(response));
    await assert.rejects(readFinalServerInventory({...operation, requestFile: join(operation.directory, 'parent-request.json'), responseFile}));
    assert.equal(statSync(responseFile).mode & 0o777, 0o600);
  }));
}
test('changed config and live exact process independently prevent parent consumption/request', () => withPage([], async page => {
  const operation = parentOperation(), {responseFile} = await parentResponse(page, operation);
  writeFileSync(operation.inputs.configs[1], '{}');
  await assert.rejects(readFinalServerInventory({...operation, requestFile: join(operation.directory, 'parent-request.json'), responseFile}), {code: 'PARENT_READBACK_CONFIG_CHANGED'});
  const second = parentOperation();
  const fields = readFileSync('/proc/self/stat', 'utf8').split(')').at(-1).trim().split(/\s+/);
  const cleanup = JSON.parse(readFileSync(second.inputs.cleanupFile));
  cleanup.processes = [{pid: process.pid, start_ticks: fields[19]}];
  writeFileSync(second.inputs.cleanupFile, JSON.stringify(cleanup));
  assert.throws(() => createParentRequest(second.inputs), {code: 'PARENT_READBACK_PROCESS_PRESENT'});
}));
for (const option of ['duplicate', 'changing']) {
  test(`loaded collector rejects ${option} remote inventory`, () => withPage([], async (page, diagnostics) => {
    await installAccounts(page); await loginOwnPage(page, ownConfig, diagnostics);
    await page.evaluate(option => installDispatcher({[option]: true}), option);
    await assert.rejects(page.evaluate(collectLoadedDispatcher), /PARENT_INVENTORY_(INCOMPLETE|CHANGED)/);
  }));
}

test('historical owner-self bucket component preserves old gaps and never replaces new effect identity', () => {
  const {readback, effect} = syntheticReadback();
  const old = {user_hash: readback.observer.user_hash, guid_hash: syntheticHash('old-admin-guid'),
    guid_algorithm: 'sha256-utf8-exact-guid-string', collector_sha256: syntheticHash('collector'),
    algorithm_receipt_sha256: syntheticHash('independent-algorithm-proof')};
  const result = verifyHistoricalAccountBucket(readback, old, '2026-10-09T00:00:30Z');
  assert.equal(result.history_reconciled, false); assert.equal(result.ready, false);
  assert.throws(() => verifyHistoricalAccountBucket(readback, {...old, guid_algorithm: 'NOT_ESTABLISHED'}, '2026-10-09T00:00:30Z'),
    {code: 'HISTORICAL_GUID_ALGORITHM_NOT_ESTABLISHED'});
  assert.throws(() => verifyFinalReadback(readback, [{...effect, session_id: undefined}], '2026-10-09T00:00:30Z'),
    {code: 'FINAL_SERVER_EFFECT_UNBOUND'});
  readback.rows.push({...readback.rows[0], session_id: 22, type: 'mstClient', guid_hash: null});
  readback.manager_count = readback.store_count = 2;
  assert.throws(() => verifyHistoricalAccountBucket(readback, old, '2026-10-09T00:00:30Z'), {code: 'HISTORICAL_ACCOUNT_BUCKET_UNKNOWN'});
});

function causalCase() {
  const {readback} = syntheticReadback();
  const binding = {schema: 'lab53-causal-binding-v1', issue_id: ownConfig.issue_id,
    operation_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', nonce: syntheticHash('causal-nonce'), source_sha: 'a'.repeat(40),
    config_sha256: syntheticHash('config'), user_hash: syntheticHash('worker'), role: 'worker', stand: readback.stand,
    after: '2026-10-09T00:00:30Z', account_lock: {device: 1, inode: 2}};
  const common = {issue_id: binding.issue_id, operation_id: binding.operation_id, source_sha: binding.source_sha,
    nonce: binding.nonce, config_sha256: binding.config_sha256, user_hash: binding.user_hash, role: binding.role};
  const before = {...common, phase: 'before-operation', readback};
  const during = {...common, phase: 'while-connected', readback: structuredClone(readback)};
  during.readback.refreshed_at = '2026-10-09T00:03:00Z';
  during.readback.rows.push({user_hash: binding.user_hash, session_id: 42, create_time: '2026-10-09T00:02:00Z',
    guid_hash: null, type: 'mstClient', packages: [], pending_disconnect: false});
  during.readback.manager_count = during.readback.store_count = 2;
  const childBefore = {...common, connected: true, stand: binding.stand, guid_hash: syntheticHash('own-child'),
    observed_at: '2026-10-09T00:02:00Z', connection_receipt_sha256: syntheticHash('own-connection')};
  const childAfter = {...childBefore, observed_at: '2026-10-09T00:04:00Z', continuity: {
    receipt_sha256: syntheticHash('synthetic-continuity-fixture'), transport_count: 1, disconnects: 0, reconnects: 0,
    guard_release_count: 0, account_lock: binding.account_lock, config_sha256: binding.config_sha256}};
  return {binding, before, during, childBefore, childAfter};
}
test('causal component returns exact child effect without borrowing parent mstSelf or live qualification', () => {
  const options = causalCase(), result = verifyCausalCapture(options);
  assert.equal(result.effect.session_id, 42);
  assert.equal(result.effect.guid_hash, options.childBefore.guid_hash);
  assert.notEqual(result.effect.guid_hash, options.during.readback.observer.guid_hash);
  assert.equal(result.parent_is_child, false); assert.equal(result.ready, false); assert.equal(result.runtime_qualified, false);
});
for (const [label, change] of [
  ['duplicate target', x => {x.during.readback.rows.push({...x.during.readback.rows[1], session_id: 43}); x.during.readback.manager_count++; x.during.readback.store_count++;}],
  ['old bucket', x => {x.before.readback.rows.push(x.during.readback.rows[1]); x.before.readback.manager_count++; x.before.readback.store_count++;}],
  ['reconnect', x => x.childAfter.continuity.reconnects++],
  ['missing continuity', x => delete x.childAfter.continuity],
  ['guard release', x => x.childAfter.continuity.guard_release_count++],
  ['changed child GUID', x => x.childAfter.guid_hash = syntheticHash('replaced-child')],
  ['wrong role', x => x.childAfter.role = 'reviewer'],
  ['wrong operation', x => x.during.operation_id = 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee'],
  ['partial inventory', x => x.during.readback.loaded = false],
  ['recoverable target', x => x.during.readback.rows[1].pending_disconnect = true],
  ['changed observer', x => x.during.readback.observer.guid_hash = syntheticHash('new-parent')],
]) test(`causal component rejects ${label}`, () => {
  const options = causalCase(); change(options); assert.throws(() => verifyCausalCapture(options));
});
