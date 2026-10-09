import {readFileSync} from 'node:fs';
import {createHash, randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {privatePath, savePrivateArtifact, verifyParentEnvelope, configBindings} from './parent-readback.mjs';
import {verifyCalibratedInventory} from './account-lifecycle.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const purpose = 'exact-retired-worker45-current-absence';

export function pairTargets(input) {
  // Re-read the actual closed configs; target hashes supplied by a caller are
  // never sufficient. No owner baseline exception is allowed for either role.
  const {bindings, users} = configBindings(input.pair_configs, input.pair_issue_id, input.stand);
  if (bindings.some(binding => !input.configs.some(item => same(item, binding)))
    || new Set(input.configs.map(item => item.path)).size !== 7) throw Error('RETIRED_PAIR_CONFIG_CHANGED');
  for (const item of input.configs) {
    const info = privatePath(item.path);
    if (info.dev !== item.device || info.ino !== item.inode || hash(readFileSync(item.path)) !== item.sha256)
      throw Error('RETIRED_PAIR_CONFIG_CHANGED');
  }
  return ['worker', 'reviewer'].map((role, index) => ({role, user_hash: users[index + 1]}));
}

export function verifyEmptyPair(readback, targets, after) {
  verifyCalibratedInventory(readback, after);
  if (!Array.isArray(targets) || targets.length !== 2 || targets[0].role !== 'worker' || targets[1].role !== 'reviewer'
    || targets.some(target => !/^[a-f0-9]{64}$/.test(target.user_hash))
    || targets[0].user_hash === targets[1].user_hash) throw Error('RETIRED_PAIR_IDENTITY_UNKNOWN');
  if (targets.some(target => readback.rows.some(row => row.user_hash === target.user_hash)))
    throw Error('RETIRED_PAIR_BUCKET_PRESENT');
  return {current_proof: 'CURRENT_RETIRED_WORKER_PROOF_ONLY', ready: false, history_facts_modified: false};
}

export function retiredReadback(action, inputFile) {
  privatePath(inputFile);
  const input = JSON.parse(readFileSync(inputFile)), targets = pairTargets(input);
  if (action === 'request') {
    savePrivateArtifact(input.directory, 'parent-request.json', {
      schema: 'lab53-parent-readback-request-v1', issue_id: input.issue_id, operation_id: input.operation_id,
      source: input.source, stand: input.stand, expected_observer: input.expected_observer,
      phase: 'historical-reconciliation', purpose, nonce: randomBytes(32).toString('hex'), configs: input.configs,
      effects: [], pair_issue_id: input.pair_issue_id, pair_targets: targets, marker: input.marker,
      provenance: input.provenance, after: new Date().toISOString(), observer_access: 'existing-owner-Mac-Admin-native-CUA'});
  } else if (action === 'verify') {
    privatePath(input.requestFile); privatePath(input.responseFile);
    const request = JSON.parse(readFileSync(input.requestFile)), response = JSON.parse(readFileSync(input.responseFile));
    if (request.phase !== 'historical-reconciliation' || request.purpose !== purpose || request.effects.length !== 0
      || ['issue_id', 'operation_id', 'source', 'stand', 'expected_observer', 'configs', 'pair_issue_id', 'marker', 'provenance']
        .some(key => !same(request[key], input[key])) || !same(request.pair_targets, targets))
      throw Error('RETIRED_PAIR_REQUEST_CHANGED');
    const readback = verifyParentEnvelope(request, response);
    const result = verifyEmptyPair(readback, targets, request.after);
    savePrivateArtifact(input.directory, 'retired-consumed-' + request.nonce + '.json', {operation_id: request.operation_id,
      request_sha256: hash(readFileSync(input.requestFile)), response_sha256: hash(readFileSync(input.responseFile)),
      input_sha256: hash(readFileSync(inputFile)), targets, result, readback});
  } else throw Error('RETIRED_PAIR_ACTION_UNKNOWN');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {retiredReadback(...process.argv.slice(2));}
  catch (error) {console.error(JSON.stringify({status: 'UNKNOWN', code: error.code ?? error.message})); process.exitCode = 1;}
}
