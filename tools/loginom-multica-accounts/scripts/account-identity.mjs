import {createHash} from 'node:crypto';
import {readFileSync, fstatSync, lstatSync} from 'node:fs';
import {basename} from 'node:path';
import {verifyCalibratedInventory} from './account-lifecycle.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
const isUUID = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const fail = code => {throw Object.assign(Error(code), {code});};

export function verifyHeldAccountGuard(guard, username) {
  if (!Number.isSafeInteger(guard?.fd) || basename(guard.path ?? '') !== username + '.lock') fail('CAUSAL_ACCOUNT_FLOCK_UNCONFIRMED');
  const fd = fstatSync(guard.fd), path = lstatSync(guard.path);
  const info = readFileSync(`/proc/self/fdinfo/${guard.fd}`, 'utf8');
  if (path.isSymbolicLink() || fd.dev !== guard.device || fd.ino !== guard.inode || path.dev !== fd.dev
    || path.ino !== fd.ino || fd.uid !== process.getuid() || (fd.mode & 0o077)
    || !info.split('\n').some(line => /^lock:\s+\d+:\s+FLOCK\s+ADVISORY\s+WRITE\s/.test(line)
      && line.includes(':' + fd.ino + ' '))) fail('CAUSAL_ACCOUNT_FLOCK_UNCONFIRMED');
  return {device: fd.dev, inode: fd.ino};
}

// Source-only causal-capture component for the owner-proposed route. It does
// not attach to a browser, wait for a parent, start an effect, fill mstSelf for
// a nonadmin, or admit the production adapter. The caller must qualify actual
// continuous flock/connection observation and native parent handoff separately.
export function verifyCausalCapture({binding, before, during, childBefore, childAfter}) {
  if (binding?.schema !== 'lab53-causal-binding-v1' || !isUUID(binding.issue_id) || !isUUID(binding.operation_id)
    || !/^[a-f0-9]{40}$/.test(binding.source_sha) || !isHash(binding.nonce)
    || !isHash(binding.config_sha256) || !isHash(binding.user_hash)
    || !['worker', 'reviewer', 'admin'].includes(binding.role) || !binding.stand
    || !Number.isFinite(time(binding.after))
    || !Number.isSafeInteger(binding.account_lock?.device) || !Number.isSafeInteger(binding.account_lock.inode))
    fail('CAUSAL_IDENTITY_BINDING_UNCONFIRMED');
  const sameBinding = envelope => envelope?.issue_id === binding.issue_id
    && envelope.operation_id === binding.operation_id && envelope.source_sha === binding.source_sha
    && envelope.nonce === binding.nonce && envelope.config_sha256 === binding.config_sha256
    && envelope.user_hash === binding.user_hash && envelope.role === binding.role;
  for (const [envelope, phase] of [[before, 'before-operation'], [during, 'while-connected']]) {
    if (!sameBinding(envelope) || envelope.phase !== phase) fail('CAUSAL_IDENTITY_BINDING_UNCONFIRMED');
    verifyCalibratedInventory(envelope.readback, binding.after);
    if (envelope.readback.stand !== binding.stand) fail('CAUSAL_IDENTITY_BINDING_UNCONFIRMED');
  }
  if (before.readback.rows.some(row => row.user_hash === binding.user_hash)) fail('CAUSAL_BEFORE_BUCKET_NOT_EMPTY');
  const observerBefore = before.readback.observer, observerDuring = during.readback.observer;
  if (['guid_hash', 'user_hash', 'session_id', 'create_time'].some(key => observerBefore[key] !== observerDuring[key])
    || observerBefore.user_hash === binding.user_hash) fail('CAUSAL_OBSERVER_CHANGED');
  for (const child of [childBefore, childAfter]) {
    if (!sameBinding(child) || child.connected !== true || child.stand !== binding.stand
      || !isHash(child.guid_hash) || !isHash(child.connection_receipt_sha256)
      || !Number.isFinite(time(child.observed_at))) fail('CAUSAL_CHILD_UNCONFIRMED');
  }
  if (childBefore.guid_hash !== childAfter.guid_hash || childBefore.guid_hash === observerDuring.guid_hash
    || childBefore.connection_receipt_sha256 !== childAfter.connection_receipt_sha256)
    fail('CAUSAL_CHILD_CHANGED');
  const trace = childAfter.continuity;
  if (!isHash(trace?.receipt_sha256) || trace.transport_count !== 1 || trace.disconnects !== 0 || trace.reconnects !== 0
    || trace.account_lock?.device !== binding.account_lock.device || trace.account_lock.inode !== binding.account_lock.inode
    || trace.guard_release_count !== 0 || trace.config_sha256 !== binding.config_sha256)
    fail('CAUSAL_CONTINUITY_UNCONFIRMED');
  if (!(time(before.readback.refreshed_at) < time(childBefore.observed_at)
    && time(childBefore.observed_at) <= time(during.readback.refreshed_at)
    && time(during.readback.refreshed_at) < time(childAfter.observed_at))) fail('CAUSAL_ORDER_UNCONFIRMED');
  const bucket = during.readback.rows.filter(row => row.user_hash === binding.user_hash);
  if (bucket.length !== 1 || bucket[0].type !== 'mstClient' || bucket[0].pending_disconnect !== false
    || bucket[0].packages.length !== 0 || (bucket[0].guid_hash !== null && bucket[0].guid_hash !== childBefore.guid_hash))
    fail('CAUSAL_CONNECTED_BUCKET_UNKNOWN');
  const row = bucket[0];
  return {status: 'CAUSAL_IDENTITY_COMPONENT_CHECKED', ready: false,
    effect: {user_hash: binding.user_hash, guid_hash: childBefore.guid_hash, session_id: row.session_id,
      create_time: row.create_time, stand: binding.stand},
    proof_sha256: hash(JSON.stringify({binding, before, during, childBefore, childAfter})),
    own_session_positive: {connected: true, guid_hash: childBefore.guid_hash, user_hash: binding.user_hash,
      stand: binding.stand, role: binding.role},
    observer_positive: {...observerDuring}, own_session_count: 1,
    parent_is_child: false, runtime_qualified: false};
}
