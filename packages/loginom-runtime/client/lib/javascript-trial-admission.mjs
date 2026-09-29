import {validateJavascriptParameters} from './javascript-parameters.mjs';

// B-only admission for a pinned existing Code-schema fixture. This validator
// runs in node.apply before workflow activation, target or editor access. It
// does not advertise a partial JavaScript handler in the candidate catalog.
export function createJavascriptTrialAdmission({node, expected_source_sha256, source_text}) {
  if (!node || !['document_id','workflow_id','node_id'].every(key =>
    typeof node[key] === 'string' && node[key].length > 0)
    || typeof expected_source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expected_source_sha256)
    || typeof source_text !== 'string') throw Error('Pinned JavaScript trial fixture required');
  const pinned = {node: structuredClone(node), expected_source_sha256, source_text};
  return (parameters, mode, request) => {
    validateJavascriptParameters(parameters, mode, request);
    if (request.target.kind !== 'existing' || request.target.type !== 'programming.javascript'
      || Object.keys(request.target).sort().join(',') !== 'kind,ref,type'
      || Object.keys(request.target.ref ?? {}).sort().join(',') !== 'document_id,node_id,workflow_id'
      || ['document_id','workflow_id','node_id'].some(key => request.target.ref[key] !== pinned.node[key])
      || request.finish !== 'done' || request.inputs.length !== 0 || request.mappings.length !== 0
      || request.read.ports.length !== 0 || request.read.coverage !== undefined
      || JSON.stringify(Object.keys(parameters).sort()) !== JSON.stringify(['expected_source_sha256','source_text'])
      || parameters.expected_source_sha256 !== pinned.expected_source_sha256
      || parameters.source_text !== pinned.source_text)
      throw Error('JavaScript trial accepts only the pinned existing Code-source Done request');
    return parameters;
  };
}
