import {readFileSync, fstatSync, statSync, lstatSync} from 'node:fs';
import {basename, dirname, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyPairBindings} from './qualify-accounts.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const isTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const fail = code => { throw Object.assign(Error(code), {code}); };

export const accountPolicy = Object.freeze({chkDesigner: true, chkViewer: true, chkRunner: false,
  chkAdmin: false, chkAllowPublish: false, chkAllowPasswordSave: false, chkGlobalFileStorage: false,
  chkSchedulerFullAccess: false, chkMustChangePassword: false, chkBlocked: false});

export function verifyInheritedGuards(path, configs, operator) {
  if (!isAbsolute(path)) fail('ACCOUNT_GUARDS_PERMISSIONS_INVALID');
  for (let current = path; current !== dirname(current); current = dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) fail('ACCOUNT_GUARDS_PERMISSIONS_INVALID');
  }
  const info = statSync(path);
  if (info.uid !== process.getuid() || (info.mode & 0o077)) fail('ACCOUNT_GUARDS_PERMISSIONS_INVALID');
  const envelope = JSON.parse(readFileSync(path, 'utf8'));
  const names = [operator.admin_user, ...configs.map(config => config.loginom.username)].map(name => name + '.lock');
  if (envelope.schema !== 'account-inherited-guards-v1' || envelope.guards?.length !== 4
    || new Set(envelope.guards.map(guard => guard.fd)).size !== 4
    || names.some(name => envelope.guards.filter(guard => basename(guard.path) === name).length !== 1)
    || envelope.guards.filter(guard => basename(guard.path) === '.accounts.lock').length !== 1) fail('ACCOUNT_GUARDS_BINDING_INVALID');
  for (const guard of envelope.guards) {
    const fd = fstatSync(guard.fd), current = statSync(guard.path);
    if (fd.dev !== guard.device || fd.ino !== guard.inode || current.dev !== fd.dev || current.ino !== fd.ino
      || fd.uid !== process.getuid() || (fd.mode & 0o077)) fail('ACCOUNT_GUARDS_BINDING_INVALID');
  }
  return envelope;
}

export function verifyRecordedEffects(envelope, configs, operator) {
  const attempts = new Set();
  const sources = new Set();
  for (const [role, username] of [['admin', operator.admin_user], ...configs.map(config => [config.role, config.loginom.username])]) {
    const guard = envelope.guards.find(item => basename(item.path) === username + '.lock');
    const marker = guard.path.slice(0, -5) + '.active.json';
    if (lstatSync(marker).isSymbolicLink()) fail('ACCOUNT_EFFECT_BINDING_INVALID');
    const info = statSync(marker);
    if (info.uid !== process.getuid() || (info.mode & 0o077)) fail('ACCOUNT_EFFECT_BINDING_INVALID');
    const effect = JSON.parse(readFileSync(marker, 'utf8'));
    if (effect.schema !== 'loginom-account-effect-v1' || effect.state !== 'UNKNOWN'
      || effect.issue_id !== configs[0].issue_id || effect.role !== role
      || !/^[a-f0-9]{40}$/.test(effect.source_sha) || !effect.attempt_id
      || effect.lock.device !== guard.device || effect.lock.inode !== guard.inode
      || !Number.isInteger(effect.writer?.pid) || !/^\d+$/.test(effect.writer?.start_ticks)
      || effect.configs?.length !== 3
      || JSON.stringify(effect.previous_processes_absent) !== JSON.stringify(guard.previous_processes_absent)) fail('ACCOUNT_EFFECT_BINDING_INVALID');
    attempts.add(effect.attempt_id);
    sources.add(effect.source_sha);
    const writer = readFileSync(`/proc/${effect.writer.pid}/stat`, 'utf8').split(')').at(-1).trim().split(/\s+/);
    if (writer[19] !== effect.writer.start_ticks || ['Z', 'X'].includes(writer[0])) fail('ACCOUNT_EFFECT_BINDING_INVALID');
    const bound = [];
    for (const config of effect.configs ?? []) {
      const current = statSync(config.path);
      if (lstatSync(config.path).isSymbolicLink() || current.dev !== config.device || current.ino !== config.inode
        || hash(readFileSync(config.path)) !== config.sha256) fail('ACCOUNT_EFFECT_BINDING_INVALID');
      bound.push(JSON.stringify(JSON.parse(readFileSync(config.path, 'utf8'))));
    }
    if ([operator, ...configs].some(value => !bound.includes(JSON.stringify(value)))) fail('ACCOUNT_EFFECT_BINDING_INVALID');
  }
  if (attempts.size !== 1 || sources.size !== 1) fail('ACCOUNT_EFFECT_BINDING_INVALID');
  return {state: 'UNKNOWN', issue_id: configs[0].issue_id};
}

function verifyIdentity(identity, config) {
  if (identity?.username !== config.loginom.username || identity.connected !== true
    || identity.stand !== config.loginom.url
    || identity.mst_self_count !== 1 || !isHash(identity.guid_hash)
    || identity.user_hash !== hash(config.loginom.username)
    || !Number.isSafeInteger(identity.session_id) || identity.session_id <= 0 || !isTime(identity.create_time)) fail('ACCOUNT_IDENTITY_UNCONFIRMED');
}

function verifyRights(rights) {
  if (rights?.effective !== true || Object.entries(accountPolicy).some(([key, expected]) => rights[key] !== expected)) fail('ACCOUNT_RIGHTS_UNCONFIRMED');
}

export async function runAccountLifecycle({config, configs, operator, operatorFile, diagnostics, adapter}) {
  verifyPairBindings(configs, operator, operatorFile);
  if (!configs.includes(config)) fail('PAIR_BINDING_MISMATCH');
  let identity;
  let loggedIn = false;
  let failure;
  try {
    const effect = await diagnostics.run('lifecycle', 'record-effect', null, () => adapter.recordEffect(config));
    if (effect?.state !== 'UNKNOWN' || effect.issue_id !== config.issue_id) fail('ACCOUNT_EFFECT_UNRECORDED');
    await diagnostics.run('lifecycle', 'provision', null, () => adapter.provision(config));
    // Treat even a failed/ambiguous login as a possible server effect.
    loggedIn = true;
    await diagnostics.run('lifecycle', 'login', null, () => adapter.login(config));
    identity = await diagnostics.run('lifecycle', 'identity', null, async () => {
      const result = await adapter.identity(config); verifyIdentity(result, config); return result;
    });
    await diagnostics.run('lifecycle', 'effective-rights', null, async () => verifyRights(await adapter.rights(config)));
  } catch (error) { failure = error; }
  if (loggedIn) {
    try {
      // Cleanup uses the original deadline, including after failed rights or
      // identity. An expired deadline leaves UNKNOWN; it cannot authorize a UI gesture.
      await diagnostics.run('lifecycle', 'logout-disconnect', null, async () => {
        const result = await adapter.logout(config, identity);
        if (result?.ui_logout_invoked !== true || result.transport_disconnected !== true
          || !identity || result.guid_hash !== identity.guid_hash) fail('ACCOUNT_LOGOUT_UNCONFIRMED');
      });
    } catch (error) {
      if (failure) failure.cleanup_error = {message: error.message, code: error.code};
      else failure = error;
    }
  }
  if (failure) { diagnostics.recordError('lifecycle', 'failure', null, failure); throw failure; }
  diagnostics.save();
  // Child process/FD cleanup and the independent observer happen afterwards.
  // This result never sets account_state=ready or reconciles an active marker.
  return {status: 'UI_QUALIFIED_CLEANUP_PENDING', ready: false, state: 'UNKNOWN', identity,
    diagnostics_sha256: diagnostics.sha256};
}

export function verifyFinalReadback(readback, effects, after) {
  const observer = readback?.observer;
  const rows = readback?.rows;
  if (!Array.isArray(effects) || !effects.length || !isTime(after)
    || !readback || readback.source !== 'existing-authorized-admin' || readback.loaded !== true
    || readback.refresh_complete !== true || readback.packages_complete !== true || !isTime(readback.refreshed_at)
    || Date.parse(readback.refreshed_at) < Date.parse(after) || !Array.isArray(rows)
    || readback.manager_count !== rows.length || readback.store_count !== rows.length
    || observer?.connected !== true || observer.mst_self_count !== 1 || !isHash(observer.guid_hash)
    || !isHash(observer.user_hash) || !Number.isSafeInteger(observer.session_id) || !isTime(observer.create_time)
    || readback.calibration?.observer_guid_hash !== observer.guid_hash
    || !readback.stand || readback.calibration?.stand !== readback.stand
    || new Set(rows.map(row => row.session_id)).size !== rows.length
    || rows.some(row => !Number.isSafeInteger(row.session_id) || row.session_id <= 0 || !isTime(row.create_time)
      || !isHash(row.user_hash) || (row.guid_hash !== null && !isHash(row.guid_hash))
      || typeof row.type !== 'string' || !Array.isArray(row.packages))) fail('FINAL_SERVER_READBACK_INCOMPLETE');
  const self = rows.filter(row => row.type === 'mstSelf');
  if (self.length !== 1 || self[0].guid_hash !== observer.guid_hash || self[0].session_id !== observer.session_id
    || self[0].create_time !== observer.create_time || self[0].user_hash !== observer.user_hash) fail('FINAL_SERVER_CALIBRATION_UNCONFIRMED');
  for (const effect of effects) {
    if (!isHash(effect.guid_hash) || !isHash(effect.user_hash) || !Number.isSafeInteger(effect.session_id) || effect.session_id <= 0
      || !isTime(effect.create_time) || effect.stand !== readback.stand || effect.guid_hash === observer.guid_hash) fail('FINAL_SERVER_EFFECT_UNBOUND');
    if (rows.some(row => row.guid_hash === effect.guid_hash
      || (row.session_id === effect.session_id && row.create_time === effect.create_time))) fail('OWN_SERVER_EFFECT_PRESENT');
  }
  return {status: 'SERVER_COMPONENT_CHECKED', ready: false};
}

export async function readFinalServerInventory() {
  // Parent is calibrating the already connected Mac Admin tab. This accounts
  // source has no admitted transport, receipt importer or observer login.
  fail('FINAL_SERVER_READBACK_NOT_IMPLEMENTED');
}

export function sourceOnlyUIAdapter(recordEffect) {
  const unavailable = () => fail('UI_LIFECYCLE_ADAPTER_NOT_QUALIFIED');
  return {recordEffect, provision: unavailable, login: unavailable, identity: unavailable,
    rights: unavailable, logout: unavailable};
}
