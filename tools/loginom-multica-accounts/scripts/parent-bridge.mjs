import {readFileSync} from 'node:fs';
import {dirname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {privatePath, savePrivateArtifact, buildParentResponse, verifyParentEnvelope} from './parent-readback.mjs';

// File normalization for the existing authorized parent handoff. No browser,
// endpoint, refresh gesture, login, account FD, config or marker mutation.
export function writeBoundParentResponse({requestFile, rawFile, refreshFile, authorizationFile, outputFile}) {
  const read = path => {privatePath(path); return JSON.parse(readFileSync(path));};
  const request = read(requestFile), authorization = read(authorizationFile);
  if (authorization.issue_id !== request.issue_id || authorization.operation_id !== request.operation_id
    || JSON.stringify(authorization.source) !== JSON.stringify(request.source)
    || JSON.stringify(authorization.expected_observer) !== JSON.stringify(request.expected_observer))
    throw Error('PARENT_AUTHORIZATION_CHANGED');
  const response = buildParentResponse(request, read(rawFile), read(refreshFile), authorization.expected_observer.tab_binding_sha256);
  verifyParentEnvelope(request, response);
  savePrivateArtifact(dirname(outputFile), basename(outputFile), response);
  return response;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [requestFile, rawFile, refreshFile, authorizationFile, outputFile] = process.argv.slice(2);
  try {
    writeBoundParentResponse({requestFile, rawFile, refreshFile, authorizationFile, outputFile});
    console.log(JSON.stringify({status: 'BOUND_PRIVATE_RESPONSE_WRITTEN', ready: false}));
  } catch (error) {console.error(JSON.stringify({status: 'UNKNOWN', code: error.code ?? error.message})); process.exitCode = 1;}
}
