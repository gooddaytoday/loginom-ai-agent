import {readFileSync} from 'node:fs';
import {createHash, randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {privatePath, savePrivateArtifact, verifyParentEnvelope} from './parent-readback.mjs';
import {verifyHistoricalAccountBucket} from './account-lifecycle.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const [action, inputFile] = process.argv.slice(2);
try {
  privatePath(inputFile); const input = JSON.parse(readFileSync(inputFile));
  if (action === 'request') {
    const request = {schema: 'lab53-parent-readback-request-v1', issue_id: input.issue_id,
      operation_id: input.operation_id, source: input.source, stand: input.stand, expected_observer: input.expected_observer,
      phase: 'historical-reconciliation', nonce: randomBytes(32).toString('hex'), configs: input.configs,
      effects: [], historical: input.historical, after: new Date().toISOString(), observer_access: 'existing-owner-Mac-Admin-native-CUA'};
    savePrivateArtifact(input.directory, 'parent-request.json', request);
  } else if (action === 'verify') {
    for (const path of [input.requestFile, input.responseFile]) privatePath(path);
    const request = JSON.parse(readFileSync(input.requestFile)), response = JSON.parse(readFileSync(input.responseFile));
    if (request.phase !== 'historical-reconciliation' || JSON.stringify(request.historical) !== JSON.stringify(input.historical)
      || request.issue_id !== input.issue_id || request.operation_id !== input.operation_id
      || JSON.stringify(request.source) !== JSON.stringify(input.source)
      || JSON.stringify(request.expected_observer) !== JSON.stringify(input.expected_observer)
      || JSON.stringify(request.configs) !== JSON.stringify(input.configs)) throw Error('HISTORICAL_BINDING_UNKNOWN');
    const readback = verifyParentEnvelope(request, response);
    for (const old of input.historical) verifyHistoricalAccountBucket(readback, old, request.after);
    savePrivateArtifact(input.directory, 'historical-consumed-' + request.nonce + '.json', {operation_id: request.operation_id,
      request_sha256: hash(readFileSync(input.requestFile)), response_sha256: hash(readFileSync(input.responseFile)),
      input_sha256: hash(readFileSync(inputFile)), historical: input.historical, readback});
  } else throw Error('HISTORICAL_ACTION_UNKNOWN');
} catch (error) {console.error(JSON.stringify({status: 'UNKNOWN', code: error.code ?? error.message})); process.exitCode = 1;}
