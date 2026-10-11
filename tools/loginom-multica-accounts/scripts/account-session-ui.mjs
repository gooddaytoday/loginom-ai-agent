import {createHash} from 'node:crypto';
import {accountPolicy} from './account-lifecycle.mjs';
import {tid, suffix, uniqueVisible, ready, navigate} from './account-ui.mjs';
import {verifyCausalCapture, verifyHeldAccountGuard} from './account-identity.mjs';
import {readFileSync} from 'node:fs';
import {requireFixedHarness} from './capture-harness.mjs';
import {installNativeLifetime, nativePositive, nativeSnapshot} from './native-lifetime.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw Object.assign(Error(code), {code}); };
const form = 'UserListForm;UserForm;';
const stand = value => { const url = new URL(value); url.searchParams.delete('testable'); return url.href; };

// These are getters in the retained model source, not cached app.CurrentUser
// flags. Runner is verified separately in the re-opened Users form; no unknown
// application-mode enum is invented here.
const rightsGetters = {chkDesigner: 'IsDesigner', chkViewer: 'IsViewer', chkAdmin: 'IsAdmin',
  chkAllowPublish: 'AllowPublish', chkAllowPasswordSave: 'AllowPasswordSave',
  chkGlobalFileStorage: 'UseGlobalFileStorage', chkSchedulerFullAccess: 'SchedulerFullAccess',
  chkMustChangePassword: 'MustChangePassword', chkBlocked: 'Blocked'};

export async function readOwnClient(page, config) {
  if (stand(page.url()) !== stand(config.loginom.url)) fail('ACCOUNT_STAND_CHANGED');
  const result = await page.evaluate(async getters => {
    try {
      const app = globalThis.bg?.app?.Application?.FInstance;
      const connection = app?.FServerConnection;
      const remote = connection?.RemoteSession;
      if (!connection?.Connected || !remote) return {code: 'ACCOUNT_CONNECTION_UNCONFIRMED'};
      const user = await connection.GetCurrentUser();
      const username = await user.get_Name();
      const guid = String(await remote.get_Guid());
      const rights = {};
      for (const [key, name] of Object.entries(getters)) rights[key] = await user['get_' + name]();
      if (app.FServerConnection !== connection || connection.RemoteSession !== remote || !connection.Connected
        || connection.UserName !== username) return {code: 'ACCOUNT_CONNECTION_CHANGED'};
      return {username, guid, rights, packages: app.FMainForm?.FMapTree?.PackageNodes?.Count};
    } catch (error) {
      const details = {name: error.name, message: error.message, stack: error.stack};
      for (const key of ['get_message', 'get_stack']) {
        if (typeof error[key] === 'function') {
          try { details[key] = error[key](); } catch (failure) { details[key] = {capture_error: String(failure)}; }
        }
      }
      return {code: 'ACCOUNT_CLIENT_READ_FAILED', browser_error: details};
    }
  }, rightsGetters);
  if (result.code) throw Object.assign(Error(result.code), result);
  if (result.username !== config.loginom.username || !/^[a-f0-9-]{36}$/i.test(result.guid)
    || Object.values(result.rights).some(value => typeof value !== 'boolean')) fail('ACCOUNT_CLIENT_IDENTITY_UNCONFIRMED');
  return {username: result.username, user_hash: hash(result.username), guid_hash: hash(result.guid),
    connected: true, stand: config.loginom.url, rights: result.rights, packages: result.packages};
}

export async function loginOwnPage(page, config, diagnostics) {
  if (stand(page.url()) !== stand(config.loginom.url)) fail('ACCOUNT_STAND_CHANGED');
  const connected = await page.evaluate(() => globalThis.bg?.app?.Application?.FInstance?.FServerConnection?.Connected === true);
  if (connected) fail('ACCOUNT_PAGE_ALREADY_CONNECTED');
  for (const [field, value] of [['edtUsername', config.loginom.username], ['edtPassword', config.loginom.password]]) {
    await diagnostics.run('login', 'fill-' + field, 'LoginForm;Login;' + field, async () => {
      const input = (await uniqueVisible(page, tid('LoginForm;Login;' + field) + ':visible')).locator('input');
      if (await input.count() !== 1) fail('UI_TARGET_AMBIGUOUS');
      await input.click({timeout: diagnostics.remaining()});
      await input.fill(value, {timeout: diagnostics.remaining()});
    });
  }
  await diagnostics.run('login', 'submit', 'LoginForm;Login;btnLogin', async () =>
    (await uniqueVisible(page, tid('LoginForm;Login;btnLogin') + ':visible')).click({timeout: diagnostics.remaining()}));
  await diagnostics.run('login', 'wait-result', null, () => page.waitForFunction(() => {
    const visible = element => element.getBoundingClientRect().width && element.getBoundingClientRect().height;
    return [...document.querySelectorAll('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"],.x-form-error-wrap')]
      .some(element => visible(element) && (element.dataset.tid || element.textContent.trim()));
  }, null, {timeout: diagnostics.remaining()}));
  if (!await page.locator(tid('MF;cntMain;tlbMainToolbar;btnAvatar')).isVisible()) fail('ACCOUNT_LOGIN_REJECTED');
  await ready(page, diagnostics);
  const client = await readOwnClient(page, config);
  if (client.packages !== 0) fail('ACCOUNT_PACKAGE_INVENTORY_UNCONFIRMED');
  return client;
}

export async function logoutOwnPage(page, config, client, diagnostics) {
  const current = await readOwnClient(page, config);
  if (!client || current.guid_hash !== client.guid_hash || current.user_hash !== client.user_hash
    || current.packages !== 0) fail('ACCOUNT_LOGOUT_IDENTITY_CHANGED');
  // Keep references to the exact original connection/connector. Reading only
  // the new login screen cannot prove its original transport was disposed.
  const original = await page.evaluateHandle(() => {
    const connection = globalThis.bg.app.Application.FInstance.FServerConnection;
    return {connection, remote: connection.RemoteSession, connector: connection.ServerContainer?.FServerConnector};
  });
  try {
    await diagnostics.run('logout', 'open-avatar', 'MF;cntMain;tlbMainToolbar;btnAvatar', async () =>
      (await uniqueVisible(page, tid('MF;cntMain;tlbMainToolbar;btnAvatar') + ':visible')).click({timeout: diagnostics.remaining()}));
    const title = await uniqueVisible(page, tid('MF;AppMenuForm;p.h;p.t') + ':visible');
    if ((await title.innerText()).trim() !== config.loginom.username) fail('ACCOUNT_LOGOUT_IDENTITY_CHANGED');
    const fresh = await readOwnClient(page, config);
    if (fresh.guid_hash !== client.guid_hash || fresh.packages !== 0) fail('ACCOUNT_LOGOUT_IDENTITY_CHANGED');
    await diagnostics.run('logout', 'native-logout', 'MF;AppMenuForm;btnLogOut', async () =>
      (await uniqueVisible(page, tid('MF;AppMenuForm;btnLogOut') + ':visible')).click({timeout: diagnostics.remaining()}));
    await diagnostics.run('logout', 'wait-original-disconnect', null, () => page.waitForFunction(original => {
      const app = globalThis.bg?.app?.Application?.FInstance;
      const input = document.querySelector('[data-tid="LoginForm;Login;edtUsername"]');
      const avatar = document.querySelector('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]');
      return input?.getBoundingClientRect().width && !avatar?.getBoundingClientRect().width
        && app?.FServerConnection === null && app.FMainForm === null
        && original.connection.RemoteSession === null && original.connection.Session === null
        && original.connection.ServerContainer === null
        && original.connector?.$D === true && typeof original.connector.$GT === 'function'
        && original.connector.$GT() === null;
    }, original, {timeout: diagnostics.remaining()}));
    return {ui_logout_invoked: true, transport_disconnected: true, guid_hash: client.guid_hash,
      server_absence: 'NOT_PROVED'};
  } finally { await original.dispose(); }
}

async function field(page, name) {
  const control = await uniqueVisible(page, suffix(form + name));
  const input = control.locator('input');
  if (await input.count() !== 1) fail('UI_TARGET_AMBIGUOUS');
  return input;
}

async function readPolicy(page, config) {
  if (await (await field(page, 'edtLogin')).inputValue() !== config.loginom.username
    || await (await field(page, 'edtFullName')).inputValue() !== config.marker
    || await (await field(page, 'cbxAuthMode')).inputValue() !== 'Локальная') fail('ACCOUNT_POLICY_TARGET_MISMATCH');
  const policy = {};
  for (const name of Object.keys(accountPolicy)) {
    policy[name] = await (await uniqueVisible(page, suffix(form + name))).evaluate(element =>
      element.classList.contains('x-form-cb-checked'));
  }
  if (Object.entries(accountPolicy).some(([name, expected]) => policy[name] !== expected)) fail('ACCOUNT_RIGHTS_UNCONFIRMED');
  return policy;
}

export function makeAccountUIAdapter({openOwnPage, recordEffect, config, operator, diagnostics,
  captureHarness, configFile, guardsEnvelope}) {
  const adminConfig = {loginom: {url: config.loginom.url, username: operator.admin_user, password: operator.admin_password}};
  const actors = [];
  let policy;
  let roleActor;
  let recorded = false;
  let effectReceipt;
  const fact = (action, value) => {
    diagnostics.events.push({phase: 'own-session', action, state: 'UNKNOWN', value});
    diagnostics.save();
  };
  const gesture = (action, selector, operation) => diagnostics.run('provision', action, selector, operation);
  const capture = async actor => {
    actor.client = await readOwnClient(actor.page, actor.config);
    // Persist the exact captured hash before the next potentially mutating UI
    // action. This is private provenance, not a final server absence receipt.
    fact('connection-receipt', actor.client);
    return actor.client;
  };
  const open = async actorConfig => {
    if (!recorded) fail('ACCOUNT_EFFECT_UNRECORDED');
    requireFixedHarness(captureHarness);
    const role = actorConfig === adminConfig ? 'admin' : config.role;
    const token = await captureHarness.before(actorConfig, role);
    const actor = {config: actorConfig, role, token, page: await openOwnPage(actorConfig.loginom.url), client: null, sockets: []};
    // Observe only lifecycle events, never frames/credentials. Attach before
    // Login; any extra transport or error/close invalidates causal capture.
    actor.page.on('websocket', socket => {
      const record = {closed: false, errors: 0}; actor.sockets.push(record);
      socket.on('close', () => record.closed = true);
      socket.on('socketerror', () => record.errors++);
    });
    await actor.page.evaluate(installNativeLifetime);
    actors.push(actor);
    return actor;
  };
  const logout = async actor => {
    if (!actor?.client) fail('ACCOUNT_LOGOUT_IDENTITY_UNCONFIRMED');
    await actor.page.evaluate(() => globalThis.__lab53NativeLifetime.beginLogout());
    const result = await logoutOwnPage(actor.page, actor.config, actor.client, diagnostics);
    actor.logoutReceipt = result;
    actor.loggedOut = true;
    fact('logout-disconnect-receipt', {...result, user_hash: actor.client.user_hash, role: actor.role, effect: actor.identity?.effect});
    return result;
  };
  const identify = async actor => {
    await nativePositive(actor.page);
    const childBefore = await capture(actor);
    const beforeTime = new Date().toISOString();
    fact('causal-connection-start', {client: childBefore, operation_id: effectReceipt.attempt_id, source_sha: effectReceipt.source_sha});
    const connectionReceipt = diagnostics.sha256;
    const envelope = await captureHarness.during(actor.token);
    diagnostics.remaining();
    const childAfter = await capture(actor);
    const native = await nativeSnapshot(actor.page);
    const binding = envelope.binding;
    if (binding.issue_id !== config.issue_id || binding.role !== actor.role
      || binding.operation_id !== effectReceipt.attempt_id || binding.source_sha !== effectReceipt.source_sha
      || binding.user_hash !== childAfter.user_hash || binding.stand !== config.loginom.url)
      fail('CAUSAL_IDENTITY_BINDING_UNCONFIRMED');
    const common = Object.fromEntries(['issue_id', 'operation_id', 'source_sha', 'nonce', 'config_sha256', 'role', 'user_hash']
      .map(key => [key, binding[key]]));
    const continuity = {transport_count: actor.sockets.length,
      disconnects: actor.sockets.filter(socket => socket.closed || socket.errors).length,
      reconnects: native.reconnect_count, native_lifetime: native, guard_audit: envelope.guard_audit,
      account_lock: binding.account_lock, config_sha256: binding.config_sha256};
    fact('causal-continuity', continuity); continuity.receipt_sha256 = diagnostics.sha256;
    const proof = verifyCausalCapture({...envelope,
      childBefore: {...common, ...childBefore, role: actor.role, observed_at: beforeTime, connection_receipt_sha256: connectionReceipt},
      childAfter: {...common, ...childAfter, role: actor.role, observed_at: new Date().toISOString(), connection_receipt_sha256: connectionReceipt, continuity}});
    fact('causal-identity', proof); actor.identity = proof;
    return {...childAfter, session_id: proof.effect.session_id, create_time: proof.effect.create_time,
      own_session_positive: proof.own_session_positive, observer_positive: proof.observer_positive,
      own_session_count: proof.own_session_count, causal_proof_sha256: proof.proof_sha256};
  };
  return {
    recordEffect: async selected => {
      if (selected !== config) fail('PAIR_BINDING_MISMATCH');
      const result = await recordEffect(selected);
      effectReceipt = result;
      recorded = result?.state === 'UNKNOWN' && result.issue_id === config.issue_id;
      return result;
    },
    provision: async () => {
      let actor;
      let failure;
      try {
        actor = await open(adminConfig);
        await loginOwnPage(actor.page, adminConfig, diagnostics);
        await capture(actor);
        if (actor.client.rights.chkAdmin !== true) fail('PROVISION_ADMIN_IDENTITY_UNCONFIRMED');
        await identify(actor); // Numeric/causal own admin proof BEFORE Users/provisioning.
        await navigate(actor.page, 'Пользователи', diagnostics);
        const rowSelector = suffix('UserListForm;cntTile;ListView;headercontainer;title_' + config.loginom.username);
        const rows = actor.page.locator(rowSelector);
        if (await rows.count() > 1) fail('UI_TARGET_AMBIGUOUS');
        if (await rows.count() === 0) {
          if (config.account_state !== 'planned') fail('ACCOUNT_CREATION_UNCERTAIN');
          fact('creation-intent', {issue_id: config.issue_id, role: config.role, user_hash: hash(config.loginom.username)});
          await gesture('add', suffix('UserListForm;btnAdd'), async () =>
            (await uniqueVisible(actor.page, suffix('UserListForm;btnAdd'))).click({timeout: diagnostics.remaining()}));
          await ready(actor.page, diagnostics);
          for (const [name, value] of [['edtLogin', config.loginom.username], ['edtFullName', config.marker], ['edtPassword', config.loginom.password]]) {
            await gesture('fill-' + name, suffix(form + name), async () => {
              const input = await field(actor.page, name);
              await input.click({timeout: diagnostics.remaining()}); await input.fill(value, {timeout: diagnostics.remaining()});
            });
          }
          if (await (await field(actor.page, 'cbxAuthMode')).inputValue() !== 'Локальная') fail('UNEXPECTED_AUTH_MODE');
          for (const [name, desired] of Object.entries(accountPolicy)) {
            const control = await uniqueVisible(actor.page, suffix(form + name));
            if (await control.evaluate(element => element.classList.contains('x-form-cb-checked')) !== desired)
              await gesture('set-' + name, suffix(form + name + ';DisplayEl'), async () =>
                (await uniqueVisible(actor.page, suffix(form + name + ';DisplayEl'))).click({timeout: diagnostics.remaining()}));
          }
          await readPolicy(actor.page, config);
          // Recheck the exact owning admin immediately before account mutation.
          const current = await readOwnClient(actor.page, adminConfig);
          if (current.guid_hash !== actor.client.guid_hash || current.rights.chkAdmin !== true) fail('PROVISION_ADMIN_IDENTITY_UNCONFIRMED');
          await gesture('apply', suffix(form + 'btnApply'), async () =>
            (await uniqueVisible(actor.page, suffix(form + 'btnApply'))).click({timeout: diagnostics.remaining()}));
          await gesture('wait-applied', suffix(form + 'edtLogin'), () =>
            actor.page.locator(suffix(form + 'edtLogin')).waitFor({state: 'hidden', timeout: diagnostics.remaining()}));
          await ready(actor.page, diagnostics);
        }
        await gesture('reopen-own-row', rowSelector, async () =>
          (await uniqueVisible(actor.page, rowSelector)).dblclick({timeout: diagnostics.remaining()}));
        await ready(actor.page, diagnostics);
        policy = await readPolicy(actor.page, config);
        fact('reopened-policy', {user_hash: hash(config.loginom.username), policy});
        await gesture('cancel-own-form', suffix(form + 'btnCancel'), async () =>
          (await uniqueVisible(actor.page, suffix(form + 'btnCancel'))).click({timeout: diagnostics.remaining()}));
        await gesture('wait-cancelled', suffix(form + 'edtLogin'), () =>
          actor.page.locator(suffix(form + 'edtLogin')).waitFor({state: 'hidden', timeout: diagnostics.remaining()}));
      } catch (error) { failure = error; }
      try { await logout(actor); }
      catch (error) { if (failure) failure.cleanup_error = {code: error.code, message: error.message}; else failure = error; }
      if (failure) throw failure;
    },
    login: async () => {
      roleActor = await open(config);
      await loginOwnPage(roleActor.page, config, diagnostics);
      await capture(roleActor);
    },
    identity: async () => identify(roleActor),
    rights: async () => {
      const current = await capture(roleActor);
      if (!policy || Object.entries(current.rights).some(([name, value]) => policy[name] !== value)) fail('ACCOUNT_RIGHTS_UNCONFIRMED');
      return {...policy, effective: true};
    },
    logout: async () => logout(roleActor),
    receipts: () => {
      if (actors.length !== 2 || actors.some(actor => !actor.identity || !actor.loggedOut
        || actor.logoutReceipt?.ui_logout_invoked !== true || actor.logoutReceipt.transport_disconnected !== true))
        fail('ALL_EFFECTS_LOGOUT_UNCONFIRMED');
      return actors.map(actor => ({role: actor.role, effect: actor.identity.effect,
        observer: actor.identity.observer_positive, causal_proof_sha256: actor.identity.proof_sha256,
        logout: actor.logoutReceipt}));
    },
    close: async () => {
      for (const actor of actors) await actor.page.close();
      // Closing an owned page never claims logout or independent server absence.
    },
  };
}
