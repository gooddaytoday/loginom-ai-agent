import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {createParentRequest, privatePath, savePrivateArtifact} from './parent-readback.mjs';
import {readFinalServerInventory} from './account-lifecycle.mjs';

// Read-only proof collector: no browser, Loginom, configs/markers or guards.
// The coordinator runs it synchronously with close_fds after UI descendants exit.
const [action, inputFile] = process.argv.slice(2);
privatePath(inputFile);
const input = JSON.parse(readFileSync(inputFile));
try {
  if (action === 'request') createParentRequest(input);
  else if (action === 'verify') {
    const result = await readFinalServerInventory(input);
    savePrivateArtifact(dirname(inputFile), 'final-proof.json', {schema: 'lab53-final-proof-v1',
      operation_id: input.expected.operation_id, source_sha: input.expected.source_sha,
      state: 'UNKNOWN', ready: false, readback: result.readback, expected: input.expected,
      request_sha256: createHash('sha256').update(readFileSync(input.requestFile)).digest('hex'),
      response_sha256: createHash('sha256').update(readFileSync(input.responseFile)).digest('hex'),
      input_sha256: createHash('sha256').update(readFileSync(inputFile)).digest('hex')});
  } else throw Error('FINAL_PROOF_ACTION_UNKNOWN');
} catch (error) {
  console.error(JSON.stringify({status: 'UNKNOWN', code: error.code ?? error.message})); process.exitCode = 1;
}
