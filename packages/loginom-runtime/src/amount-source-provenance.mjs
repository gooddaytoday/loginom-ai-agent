import {createHash} from 'node:crypto';
import {assertAmountManagedStartup} from './fp-managed-startup.mjs';
import {assertCaptureOwner, captureData} from './retained-capture.mjs';
import {requireStorageDestination} from '../client/lib/storage-policy.mjs';

// Private Amount component over the existing admitted artifact and delivery
// protocols. It adds neither an uploader nor a model-facing registration.
const attempts = new Map();
export function retainAmountSource(retained, source, {guard, signal, runtime, record}) {
  const original = assertAmountManagedStartup(retained.state.controlledStartup, retained.state);
  const session = retained.session, store = session.artifactStore;
  const fail = () => { throw Error('LOGINOM_AMOUNT_SOURCE_UNAVAILABLE'); };
  if (!source || typeof source !== 'object' || Array.isArray(source)) fail();
  captureData(source);
  if (!store || typeof runtime?.deliverArtifact !== 'function' || signal !== original.signal
      || Object.keys(source).sort().join(',') !== 'artifact_id,bytes,name,sha256,upload'
      || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\.csv$/.test(source.name)
      || !Number.isSafeInteger(source.bytes) || source.bytes < 0 || source.bytes > 262144
      || !/^[a-f0-9]{64}$/.test(source.sha256)
      || !source.upload || Object.keys(source.upload).sort().join(',') !== 'destination,directory,grant_id,overwrite'
      || source.upload.overwrite !== 'reject'
      || source.upload.destination !== source.upload.directory + '/' + source.name) fail();
  requireStorageDestination(source.upload.destination, session.metadata.storageDirectories, 'inputs');
  const bytes = JSON.stringify(source), method = runtime.deliverArtifact;
  const directories = session.metadata.storageDirectories, directoryBytes = JSON.stringify(directories);
  const key = JSON.stringify([original.operation, original.request]);
  const fixed = {binding:retained.binding, owner:retained.owner, page:retained.page, context:retained.context,
    session, state:retained.state, startup:retained.state.controlledStartup};
  let attempted = false, pending = false, uncertain = false, result;
  const current = () => {
    guard(); assertCaptureOwner(retained);
    const control = assertAmountManagedStartup(fixed.startup, fixed.state);
    signal.throwIfAborted();
    if (control.signal !== signal || control.deadline !== original.deadline || control.operation !== original.operation
        || control.request !== original.request || Date.now() >= original.deadline
        || Object.keys(fixed).some(k => k !== 'startup' && retained[k] !== fixed[k])
        || session.artifactStore !== store || runtime.deliverArtifact !== method || JSON.stringify(source) !== bytes
        || session.metadata.storageDirectories !== directories || JSON.stringify(directories) !== directoryBytes
        || JSON.stringify(store.getUploadGrant(source.artifact_id, source.upload.grant_id)) !== bytes) fail();
    requireStorageDestination(source.upload.destination, session.metadata.storageDirectories, 'inputs');
  };
  current();
  const owned = async work => {
    current(); pending = true;
    let value;
    try { value = await work(); }
    catch (reason) {
      uncertain = true; pending = false;
      // A control refusal is primary; this owned await rejection remains a
      // genuine event even when its boxed value equals the original reason.
      try { current(); } catch (primary) { fixed.startup.propagate(primary); }
      throw fixed.startup.reject(reason);
    }
    pending = false; current(); return value;
  };
  return Object.freeze({
    unsettled: () => pending || uncertain,
    assert(value) { current(); if (!result || value !== result || pending || uncertain) fail(); return true; },
    async deliver() {
      current();
      // The original pair is consumed before any read or dispatch, including
      // copied/reconstructed descriptor carriers and lost delivery replies.
      if (attempted || attempts.has(key)) throw Error('LOGINOM_AMOUNT_SOURCE_CONSUMED');
      attempted = true; attempts.set(key, fixed);
      const local = await owned(() => store.resolve(source.artifact_id));
      if (JSON.stringify(local.descriptor) !== bytes || local.buffer.length !== source.bytes
          || createHash('sha256').update(local.buffer).digest('hex') !== source.sha256) fail();
      const budget = Math.min(original.deadline, retained.binding.expires) - Date.now();
      if (budget < 1000) fail();
      // Existing delivery receives only remaining original budget. Its child
      // timeout is not the caller's deadline or a new cancellation authority.
      uncertain = true;
      const delivered = await owned(() => method.call(runtime, {
        artifact_id:source.artifact_id, upload_grant_id:source.upload.grant_id,
        operation_id:'amount-source:' + retained.binding.admission, budget_ms:budget,
      }, {signal}));
      const proof = delivered?.outcome;
      if (delivered?.state !== 'settled' || delivered.phase !== 'completed' || proof?.status !== 'SUCCEEDED'
          || proof.destination !== source.upload.destination || proof.bytes !== source.bytes || proof.sha256 !== source.sha256
          || proof.upload_completion_verified !== true || proof.cleanup_complete !== true
          || typeof proof.verification_id !== 'string' || !proof.verification_id
          || proof.upload_operation_id !== 'amount-source:' + retained.binding.admission + ':upload') fail();
      // Keep custody until the original evidence callback settles as well.
      const receipt = Object.freeze({version:1, kind:'amount_original_csv_source', owner_id:retained.owner.id,
        sdk_session_id:retained.sessionId, operation:original.operation, request:original.request,
        run:retained.binding.run, generation:retained.binding.generation, chat:retained.binding.chat,
        artifact_id:source.artifact_id, path:proof.destination, bytes:source.bytes, sha256:source.sha256,
        upload_operation_id:proof.upload_operation_id, verification_id:proof.verification_id,
        original_deadline:original.deadline, cleanup_complete:true, native_node_verified:false});
      const acknowledgement = await owned(() => record({event:'amount_original_csv_source', receipt}));
      if (acknowledgement === false || acknowledgement === undefined) throw fixed.startup.reject(acknowledgement);
      if (acknowledgement?.event !== 'amount_original_csv_source'
          || JSON.stringify(acknowledgement.receipt) !== JSON.stringify(receipt)) fail();
      uncertain = false; result = receipt; return result;
    },
  });
}
