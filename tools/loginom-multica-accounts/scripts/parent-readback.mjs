import {readFileSync, lstatSync, openSync, writeFileSync, fsyncSync, closeSync} from 'node:fs';
import {dirname, join, isAbsolute} from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {verifyPairBindings} from './qualify-accounts.mjs';
import {requireSameObserver} from './account-identity.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isSHA = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const isUUID = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
const fail = code => { throw Object.assign(Error(code), {code}); };

export function privatePath(path, directory = false) {
  if (!isAbsolute(path)) fail('PARENT_READBACK_PRIVATE_PATH_INVALID');
  for (let current = path; current !== dirname(current); current = dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) fail('PARENT_READBACK_PRIVATE_PATH_INVALID');
  }
  const info = lstatSync(path);
  if (info.uid !== process.getuid() || info.mode & 0o077 || (directory ? !info.isDirectory() : !info.isFile()))
    fail('PARENT_READBACK_PRIVATE_PATH_INVALID');
  return info;
}

export function savePrivateArtifact(directory, name, value) {
  privatePath(directory, true);
  const fd = openSync(join(directory, name), 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
  const parent = openSync(directory, 'r');
  try { fsyncSync(parent); } finally { closeSync(parent); }
}

function processesAbsent(records) {
  for (const record of records) {
    if (!Number.isSafeInteger(record.pid) || record.pid <= 0 || typeof record.start_ticks !== 'string'
      || !/^\d+$/.test(record.start_ticks)) fail('PARENT_READBACK_OPERATION_INCOMPLETE');
    try {
      const fields = readFileSync(`/proc/${record.pid}/stat`, 'utf8').split(')').at(-1).trim().split(/\s+/);
      if (fields[19] === record.start_ticks && !['Z', 'X'].includes(fields[0])) fail('PARENT_READBACK_PROCESS_PRESENT');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export function configBindings(paths, issueId, stand) {
  if (!Array.isArray(paths) || paths.length !== 3 || new Set(paths).size !== 3) fail('PAIR_BINDING_MISMATCH');
  const bindings = paths.map(path => {
    const info = privatePath(path);
    return {path, device: info.dev, inode: info.ino, sha256: hash(readFileSync(path))};
  });
  const [operator, ...roles] = paths.map(path => JSON.parse(readFileSync(path)));
  verifyPairBindings(roles, operator, paths[0]);
  if (roles[0].issue_id !== issueId || operator.url !== stand || typeof operator.admin_user !== 'string') fail('PAIR_BINDING_MISMATCH');
  return {bindings, users: [operator.admin_user, ...roles.map(role => role.loginom.username)].map(hash)};
}

export function createParentRequest({directory, issueId, operationId, source, stand, configs, effects, cleanupFile, logoutFile, expectedObserver}) {
  privatePath(cleanupFile); privatePath(logoutFile);
  const cleanup = JSON.parse(readFileSync(cleanupFile));
  const logout = JSON.parse(readFileSync(logoutFile));
  if (!isUUID(issueId) || !isUUID(operationId) || !isSHA(source?.sha) || !isSHA(source.tree)
    || !isHash(source.manifest_sha256) || !stand || configs?.length !== 3 || !effects?.length
    || cleanup.phase !== 'process-cleanup' || cleanup.process_cleanup !== 'PASS' || cleanup.failure !== null
    || cleanup.issue_id !== issueId || cleanup.operation_id !== operationId || cleanup.source_sha !== source.sha
    || cleanup.returncode !== 0 || !Array.isArray(cleanup.processes) || !cleanup.processes.length
    || logout.issue_id !== issueId || logout.operation_id !== operationId || logout.source_sha !== source.sha
    || JSON.stringify(logout.effects) !== JSON.stringify(effects)
    || logout.all_ui_logout_invoked !== true || logout.all_transports_disconnected !== true)
    fail('PARENT_READBACK_OPERATION_INCOMPLETE');
  for (const effect of effects) {
    if (!isHash(effect.guid_hash) || !isHash(effect.user_hash) || !Number.isSafeInteger(effect.session_id)
      || effect.session_id <= 0 || !Number.isFinite(time(effect.create_time)) || effect.stand !== stand)
      fail('FINAL_SERVER_EFFECT_UNBOUND');
  }
  if (new Set(effects.map(effect => effect.guid_hash)).size !== effects.length
    || new Set(effects.map(effect => effect.session_id)).size !== effects.length) fail('FINAL_SERVER_EFFECT_UNBOUND');
  if (!Array.isArray(logout.receipts) || logout.receipts.length !== effects.length
    || logout.receipts.some((receipt, index) => JSON.stringify(receipt.effect) !== JSON.stringify(effects[index])
      || receipt.logout?.guid_hash !== effects[index].guid_hash || receipt.logout.ui_logout_invoked !== true
      || receipt.logout.transport_disconnected !== true)) fail('PARENT_READBACK_OPERATION_INCOMPLETE');
  for (const receipt of logout.receipts) {
    if (!isHash(receipt.causal_proof_sha256)) fail('PARENT_READBACK_OPERATION_INCOMPLETE');
    requireSameObserver(expectedObserver, receipt.observer, stand);
  }
  processesAbsent(cleanup.processes);
  const {bindings, users} = configBindings(configs, issueId, stand);
  if (users.some(user => !effects.some(effect => effect.user_hash === user))
    || effects.some(effect => !users.includes(effect.user_hash))) fail('FINAL_SERVER_EFFECT_UNBOUND');
  const request = {schema: 'lab53-parent-readback-request-v1', issue_id: issueId, operation_id: operationId,
    nonce: randomBytes(32).toString('hex'), phase: 'post-cleanup', source, stand, configs: bindings, effects,
    cleanup_sha256: hash(readFileSync(cleanupFile)), logout_sha256: hash(readFileSync(logoutFile)),
    cleanup_file: cleanupFile, logout_file: logoutFile,
    expected_observer: expectedObserver,
    after: new Date().toISOString(), observer_access: 'existing-owner-Mac-Admin-native-CUA'};
  requireSameObserver(expectedObserver, {...expectedObserver, connected: true, mst_self_count: 1}, stand);
  savePrivateArtifact(directory, 'parent-request.json', request);
  return request;
}

export function verifyParentEnvelope(request, response) {
  const capture = ['before-operation', 'while-connected'].includes(request?.phase);
  if (request?.schema !== 'lab53-parent-readback-request-v1' || (!capture && request.phase !== 'post-cleanup')
    || !isUUID(request.issue_id) || !isUUID(request.operation_id) || !isHash(request.nonce)
    || !Number.isFinite(time(request.after)) || !isSHA(request.source?.sha) || !isSHA(request.source.tree)
    || !isHash(request.source.manifest_sha256)
    || (!capture && (!isHash(request.cleanup_sha256) || !isHash(request.logout_sha256) || !request.effects?.length))
    || request.configs?.length !== 3 || !Array.isArray(request.effects)
    || response?.schema !== 'lab53-parent-readback-response-v1'
    || response.issue_id !== request.issue_id || response.operation_id !== request.operation_id
    || response.nonce !== request.nonce || response.request_sha256 !== hash(JSON.stringify(request))
    || JSON.stringify(response.source) !== JSON.stringify(request.source)
    || response.configs_sha256 !== hash(JSON.stringify(request.configs))
    || response.effects_sha256 !== hash(JSON.stringify(request.effects))
    || response.cleanup_sha256 !== request.cleanup_sha256 || response.logout_sha256 !== request.logout_sha256
    || response.access !== request.observer_access || response.owner_session_preserved !== true
    || response.new_browser_or_login !== false || response.close_actions !== 0
    || response.readback?.stand !== request.stand || !Number.isFinite(time(response.readback.refreshed_at))
    || time(response.readback.refreshed_at) < time(request.after)
    || response.refresh?.action !== 'native-Refresh' || !isHash(response.refresh.receipt_sha256)
    || !Number.isFinite(time(response.refresh.started_at)) || !Number.isFinite(time(response.refresh.completed_at))
    || time(response.refresh.started_at) < time(request.after)
    || time(response.refresh.completed_at) < time(response.refresh.started_at)
    || time(response.readback.refreshed_at) < time(response.refresh.completed_at))
    fail('PARENT_READBACK_BINDING_UNCONFIRMED');
  requireSameObserver(request.expected_observer, response.readback.observer, request.stand);
  return response.readback;
}

export function consumeParentResponse({directory, requestFile, responseFile, expected}) {
  privatePath(requestFile); privatePath(responseFile);
  const request = JSON.parse(readFileSync(requestFile));
  if (request.issue_id !== expected.issue_id || request.operation_id !== expected.operation_id
    || request.source?.sha !== expected.source_sha || request.source?.tree !== expected.source_tree
    || request.source?.manifest_sha256 !== expected.manifest_sha256
    || JSON.stringify(request.configs?.map(config => config.path)) !== JSON.stringify(expected.config_paths)
    || request.cleanup_file !== expected.cleanup_file || request.logout_file !== expected.logout_file
    || JSON.stringify(request.expected_observer) !== JSON.stringify(expected.expected_observer))
    fail('PARENT_READBACK_BINDING_UNCONFIRMED');
  for (const config of request.configs ?? []) {
    const info = privatePath(config.path);
    if (info.dev !== config.device || info.ino !== config.inode || hash(readFileSync(config.path)) !== config.sha256)
      fail('PARENT_READBACK_CONFIG_CHANGED');
  }
  configBindings(expected.config_paths, expected.issue_id, request.stand);
  privatePath(request.cleanup_file); privatePath(request.logout_file);
  if (hash(readFileSync(request.cleanup_file)) !== request.cleanup_sha256
    || hash(readFileSync(request.logout_file)) !== request.logout_sha256) fail('PARENT_READBACK_CLEANUP_CHANGED');
  processesAbsent(JSON.parse(readFileSync(request.cleanup_file)).processes);
  const response = JSON.parse(readFileSync(responseFile));
  const readback = verifyParentEnvelope(request, response);
  // The caller must validate complete calibrated inventory/effect absence
  // before consuming; this callback is the existing accounts validator, not a
  // ready flag or a transport capable of opening another Loginom session.
  expected.verify(readback, request.effects, request.after);
  savePrivateArtifact(directory, 'parent-consumed-' + request.nonce + '.json', {schema: 'lab53-parent-readback-consumed-v1',
    state: 'UNKNOWN', ready: false, operation_id: request.operation_id, request_sha256: hash(JSON.stringify(request)),
    response_sha256: hash(readFileSync(responseFile))});
  return {readback, status: 'PARENT_SERVER_COMPONENT_CHECKED', ready: false};
}

// Execute only in the existing owner's loaded Admin tab after its standard
// Refresh. Native CUA can use this read-only function; no mas/CDP endpoint or
// application/session factory is assumed. Raw return data stays private.
export async function collectLoadedDispatcher() {
  const visible = element => element.getBoundingClientRect().width && element.getBoundingClientRect().height;
  const masks = [...document.querySelectorAll('.bg-mask-message')].filter(visible);
  const formClass = globalThis.bg?.admin?.SessionsManagerForm;
  if (typeof formClass !== 'function' || masks.length || !globalThis.Ext?.ComponentManager?.getAll)
    throw Error('PARENT_DISPATCHER_NOT_READY');
  // Existing owner tabs lack testable data-tid. MainForm retains actual tab
  // Controllers; SessionsManagerForm owns Items.trpSessions/FSessionsStore.
  // Enumerate loaded Ext components, then require one exact visible instance.
  const views = globalThis.Ext.ComponentManager.getAll().filter(view =>
    view.$className === 'bg.admin.view.SessionsManagerForm' && view.isVisible?.(true)
      && view.Controller instanceof formClass);
  if (views.length !== 1) throw Error('PARENT_DISPATCHER_NOT_READY');
  const controller = views[0].Controller;
  const tree = controller.Items.trpSessions;
  const store = controller.FSessionsStore;
  // Retained SessionsManagerForm.AfterLoad sets Items.trpSessions to its
  // FSessionsStore. Qualify these exact objects; a synthetic alternate view
  // or an unrelated form/controller must not stand in for the loaded tree.
  if (!tree?.isVisible?.(true) || tree.getStore?.() !== store)
    throw Error('PARENT_VENDOR_SHAPE_UNCONFIRMED');
  const manager = controller.FSessionManager;
  const root = store?.getRoot?.();
  const enumeration = globalThis.bg?.TBGManagedSessionType;
  const names = ['mstClient', 'mstSelf', 'mstShared', 'mstPool', 'mstBackup'];
  const enumShape = holder => holder && names.every((name, i) => holder[name] === i);
  const staticShape = enumShape(enumeration), prototypeShape = enumShape(enumeration?.prototype);
  if (!staticShape && !prototypeShape
    || names.some((name, i) => [enumeration?.[name], enumeration?.prototype?.[name]]
      .some(value => value !== undefined && value !== i))) throw Error('PARENT_VENDOR_ENUM_UNCONFIRMED');
  const types = staticShape ? enumeration : enumeration.prototype;
  const app = globalThis.bg?.app?.Application?.FInstance;
  const connection = app?.FServerConnection;
  const remote = connection?.FRemoteSession;
  if (!root?.isLoaded?.() || !manager || !connection?.Connected || !remote
    || globalThis.bg?.app?.CurrentUser?.Get()?.IsAdmin !== true) throw Error('PARENT_CALIBRATION_UNCONFIRMED');
  const currentUser = await connection.GetCurrentUser();
  if (await currentUser.get_Name() !== connection.UserName || await currentUser.get_IsAdmin() !== true)
    throw Error('PARENT_CALIBRATION_UNCONFIRMED');
  const children = [...root.childNodes];
  const fingerprint = () => JSON.stringify(children.map(node => ({text: node.data.text, type: node.data.SessionType,
    created: node.data.CreateTime, pending: node.data.PendingDisconnect, packages: node.childNodes.map(pkg =>
      ({text: pkg.data.text, path: pkg.data.Path, created: pkg.data.CreateTime, modified: pkg.data.ModifyTime,
        version: pkg.data.Version, readonly: pkg.data.ReadOnly, references: pkg.data.ReferenceCount}))})));
  const before = fingerprint();
  const count = await manager.get_Count();
  if (!Number.isSafeInteger(count) || count !== children.length) throw Error('PARENT_INVENTORY_INCOMPLETE');
  const rows = [];
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    const info = await manager.SessionInfo(i);
    const node = children.find(node => node.data.Info === info);
    if (!node || seen.has(info)) throw Error('PARENT_INVENTORY_INCOMPLETE');
    seen.add(info);
    const name = await info.get_Name(), created = await info.get_CreateTime(), type = await info.get_SessionType();
    const pending = await info.get_PendingDisconnect();
    const packages = await info.get_Count();
    const virtual = type === types.mstShared || type === types.mstPool;
    const sameDate = created instanceof Date && Number.isFinite(created.getTime())
      && created.getTime() === node.data.CreateTime?.getTime();
    if (name !== node.data.text || type !== node.data.SessionType || pending !== node.data.PendingDisconnect
      || typeof pending !== 'boolean' || !(sameDate || (virtual && created === null && node.data.CreateTime === null))
      || !Number.isSafeInteger(packages) || packages < 0 || packages !== node.childNodes.length)
      throw Error('PARENT_INVENTORY_INCOMPLETE');
    const normalized = [];
    const seenPackages = new Set();
    for (let j = 0; j < packages; j++) {
      const pkg = await info.PackageInfo(j), record = node.childNodes.find(child => child.data.Info === pkg);
      if (!record || seenPackages.has(pkg)) throw Error('PARENT_INVENTORY_INCOMPLETE');
      seenPackages.add(pkg);
      const values = {};
      for (const key of ['Name', 'Path', 'CreateTime', 'ModifyTime', 'Version', 'ReadOnly', 'ReferenceCount'])
        values[key] = await pkg['get_' + key]();
      if (values.Name !== record.data.text || values.Path !== record.data.Path
        || values.CreateTime?.getTime() !== record.data.CreateTime?.getTime()
        || values.ModifyTime?.getTime() !== record.data.ModifyTime?.getTime()
        || values.Version !== record.data.Version || values.ReadOnly !== record.data.ReadOnly
        || values.ReferenceCount !== record.data.ReferenceCount) throw Error('PARENT_INVENTORY_INCOMPLETE');
      normalized.push(values);
    }
    rows.push({name, create_time: created === null ? null : created.toISOString(), type, pending_disconnect: pending, packages: normalized,
      same_client_session: info.$S === remote.$S});
  }
  const after = await manager.get_Count();
  const currentViews = globalThis.Ext.ComponentManager.getAll().filter(view =>
    view.$className === 'bg.admin.view.SessionsManagerForm' && view.isVisible?.(true)
      && view.Controller instanceof formClass);
  if (count !== after || before !== fingerprint() || root.childNodes.length !== children.length
    || children.some((node, i) => root.childNodes[i] !== node) || app.FServerConnection !== connection
    || connection.FRemoteSession !== remote || !connection.Connected || currentViews.length !== 1
    || currentViews[0] !== views[0] || views[0].Controller !== controller || controller.FSessionManager !== manager
    || controller.FSessionsStore !== store || controller.Items.trpSessions !== tree || tree.getStore() !== store
    || store.getRoot() !== root || !root.isLoaded() || !tree.isVisible(true)
    || [...document.querySelectorAll('.bg-mask-message')].some(visible)) throw Error('PARENT_INVENTORY_CHANGED');
  const self = rows.filter(row => row.type === types.mstSelf);
  if (self.length !== 1 || !self[0].same_client_session || !self[0].name.startsWith(connection.UserName + ':'))
    throw Error('PARENT_CALIBRATION_UNCONFIRMED');
  const guid = String(await remote.get_Guid());
  if (app.FServerConnection !== connection || connection.FRemoteSession !== remote || !connection.Connected
    || before !== fingerprint()) throw Error('PARENT_INVENTORY_CHANGED');
  return {stand: location.href, manager_count: count, store_count: children.length, rows, connected: true,
    observer_guid: guid, observer_username: connection.UserName,
    observed_at: new Date().toISOString(), loaded: true, visible_masks: 0};
}

// The parent writes this response through the existing supplement/handoff,
// keeping its raw getter result and Refresh action receipt private. This
// envelope is a helper artifact, not a new Host/Agent transport or readiness API.
export function buildParentResponse(request, raw, refresh, tabBindingSHA256) {
  const stand = new URL(raw.stand); stand.searchParams.delete('testable');
  if (stand.href !== request.stand || raw.loaded !== true || raw.connected !== true || raw.visible_masks !== 0
    || raw.manager_count !== raw.rows?.length || raw.store_count !== raw.rows?.length
    || typeof raw.observer_guid !== 'string' || !raw.observer_guid) fail('PARENT_INVENTORY_INCOMPLETE');
  const types = ['mstClient', 'mstSelf', 'mstShared', 'mstPool', 'mstBackup'];
  const rows = raw.rows.map((row, rowIndex) => {
    const virtual = [2, 3].includes(row.type);
    const match = row.name?.match(/^(.*):([1-9]\d*)$/);
    if (row.type === 4) fail('PARENT_BACKUP_SEMANTICS_UNQUALIFIED');
    if ((!virtual && (!match || !Number.isSafeInteger(Number(match[2])))) || !types[row.type]
      || typeof row.name !== 'string' || !row.name || (!Number.isFinite(time(row.create_time)) && !(virtual && row.create_time === null))
      || !Array.isArray(row.packages)) fail('PARENT_INVENTORY_INCOMPLETE');
    return {kind: virtual ? 'virtual' : 'client', row_index: rowIndex, name_hash: hash(row.name),
      user_hash: virtual ? null : hash(match[1]), session_id: virtual ? null : Number(match[2]), create_time: row.create_time,
      type: types[row.type], pending_disconnect: row.pending_disconnect,
      guid_hash: row.type === 1 ? hash(raw.observer_guid) : null,
      packages: row.packages.map(pkg => ({name_hash: hash(pkg.Name), path_hash: pkg.Path == null ? null : hash(pkg.Path),
        create_time: pkg.CreateTime == null ? null : new Date(pkg.CreateTime).toISOString(),
        modify_time: pkg.ModifyTime == null ? null : new Date(pkg.ModifyTime).toISOString(),
        version: pkg.Version, read_only: pkg.ReadOnly, reference_count: pkg.ReferenceCount}))};
  });
  const rawSelf = raw.rows.filter(row => row.type === 1);
  const self = rows.filter(row => row.type === 'mstSelf');
  if (self.length !== 1 || !rawSelf[0].same_client_session || self[0].user_hash !== hash(raw.observer_username))
    fail('PARENT_CALIBRATION_UNCONFIRMED');
  const readback = {source: 'existing-authorized-admin', stand: request.stand, loaded: true,
    refresh_complete: true, packages_complete: true, refreshed_at: raw.observed_at,
    manager_count: raw.manager_count, store_count: raw.store_count, rows,
    observer: {...self[0], connected: true, mst_self_count: 1, tab_binding_sha256: tabBindingSHA256},
    calibration: {observer_guid_hash: self[0].guid_hash, stand: request.stand,
      tab_binding_sha256: tabBindingSHA256}, inventory_sha256: hash(JSON.stringify(rows))};
  const response = {schema: 'lab53-parent-readback-response-v1', issue_id: request.issue_id,
    operation_id: request.operation_id, nonce: request.nonce, source: request.source,
    request_sha256: hash(JSON.stringify(request)), configs_sha256: hash(JSON.stringify(request.configs)),
    effects_sha256: hash(JSON.stringify(request.effects)), cleanup_sha256: request.cleanup_sha256,
    logout_sha256: request.logout_sha256, access: request.observer_access, refresh,
    owner_session_preserved: true, new_browser_or_login: false, close_actions: 0, readback};
  verifyParentEnvelope(request, response);
  return response;
}
