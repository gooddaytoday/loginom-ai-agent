import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {privatePath,savePrivateArtifact,verifyParentEnvelope,configBindings} from './parent-readback.mjs';
import {verifyCalibratedInventory,verifyFinalReadback} from './account-lifecycle.mjs';
import {requireSameObserver} from './account-identity.mjs';
import {hash,equal,boundFile,verifyBootstrapLogouts,requireExactProcessAbsence} from './admin-bindings.mjs';

export function checkBootstrapReceipt(receiptFile,target,source,issue) {
  privatePath(receiptFile);const receipt=JSON.parse(readFileSync(receiptFile));
  if(receipt.schema!=='lab53-card-admin-qualified-v1'||receipt.issue_id!==issue||!equal(receipt.source,source)
    ||!equal(receipt.target_operator,target)||receipt.effective_admin!==true)throw Error('MIGRATION_NEW_ADMIN_UNQUALIFIED');
  for(const key of ['server_proof','server_request','server_response','server_input','fd_proof','fd_request','completion','cleanup','authorization'])
    if(!equal(boundFile(receipt[key].path),receipt[key]))throw Error('MIGRATION_BOOTSTRAP_BYTES_CHANGED');
  const owner=JSON.parse(readFileSync(receipt.authorization.path));
  if(owner.schema!=='lab53-admin-bootstrap-owner-binding-v1'||owner.issue_id!==issue||owner.card_issue_id!==issue
    ||owner.operation_id!==receipt.operation_id||!equal(owner.source,source)||!equal(owner.configs,receipt.configs)
    ||!equal(receipt.configs?.[1],target))throw Error('MIGRATION_BOOTSTRAP_BYTES_CHANGED');
  if(receipt.configs.some(x=>!equal(x,boundFile(x.path))))throw Error('MIGRATION_BOOTSTRAP_BYTES_CHANGED');
  const operation={issue_id:issue,operation_id:receipt.operation_id,source,stand:owner.expected_observer.stand,
    expected_observer:owner.expected_observer,configs:receipt.configs};
  const completion=JSON.parse(readFileSync(receipt.completion.path)),receipts=verifyBootstrapLogouts(completion,operation);
  const proof=JSON.parse(readFileSync(receipt.server_proof.path));
  if(proof.operation_id!==receipt.operation_id||!equal(proof.effects,receipts.map(x=>x.effect)))throw Error('MIGRATION_BOOTSTRAP_BYTES_CHANGED');
  const operators=receipt.configs.slice(0,2).map(x=>JSON.parse(readFileSync(x.path)));
  if(receipts.some((item,i)=>item.effect.user_hash!==hash(operators[i].admin_user)))throw Error('MIGRATION_BOOTSTRAP_BYTES_CHANGED');
  requireSameObserver(owner.expected_observer,proof.readback.observer,operation.stand);
  const request=JSON.parse(readFileSync(receipt.server_request.path)),response=JSON.parse(readFileSync(receipt.server_response.path));
  if(request.purpose!=='bounded-card-admin-bootstrap'||request.phase!=='post-cleanup'||request.issue_id!==issue
    ||request.operation_id!==receipt.operation_id||!equal(request.source,source)||!equal(request.configs,receipt.configs)
    ||!equal(request.expected_observer,owner.expected_observer)||!equal(request.effects,proof.effects)
    ||request.cleanup_sha256!==receipt.cleanup.sha256||request.logout_sha256!==receipt.completion.sha256
    ||proof.request_sha256!==receipt.server_request.sha256||proof.response_sha256!==receipt.server_response.sha256
    ||proof.input_sha256!==receipt.server_input.sha256||!equal(verifyParentEnvelope(request,response),proof.readback))
    throw Error('MIGRATION_BOOTSTRAP_BYTES_CHANGED');
  verifyFinalReadback(proof.readback,proof.effects,proof.readback.refreshed_at);
  const fdRequest=JSON.parse(readFileSync(receipt.fd_request.path)),fdProof=JSON.parse(readFileSync(receipt.fd_proof.path));
  if(fdRequest.operation_id!==receipt.operation_id||!equal(fdRequest.source,source)||fdProof.operation_id!==receipt.operation_id
    ||fdProof.nonce!==fdRequest.nonce||fdProof.request_sha256!==hash(JSON.stringify(fdRequest))
    ||fdProof.source_sha256!==hash(readFileSync(new URL('./own-fd-inventory.py',import.meta.url)))
    ||fdProof.privileged_census?.wrapper_sha256!==hash(readFileSync(new URL('./held-fd-inventory.py',import.meta.url)))
    ||fdProof.privileged_census.uid!==0||fdProof.privileged_census.euid!==0
    ||fdProof.before.errors.length||fdProof.after.errors.length||fdProof.before.control_observed!==true||fdProof.after.control_observed!==true)
    throw Error('MIGRATION_BOOTSTRAP_FD_UNBOUND');
  const cleanup=JSON.parse(readFileSync(receipt.cleanup.path));
  if(cleanup.issue_id!==issue||cleanup.operation_id!==receipt.operation_id||cleanup.source_sha!==source.sha
    ||cleanup.process_cleanup!=='PASS'||cleanup.failure!==null||cleanup.returncode!==0||!cleanup.processes?.length)
    throw Error('MIGRATION_BOOTSTRAP_BYTES_CHANGED');
  requireExactProcessAbsence(cleanup.processes);
  // The old bootstrap result is provenance for this exact operator, not the
  // current pair-absence proof or permission to reuse a global-bound ready flag.
  return receipt;
}

export function migrationReadback(action,inputFile) {
  privatePath(inputFile);const input=JSON.parse(readFileSync(inputFile));
  const {bindings,users}=configBindings(input.configs.map(x=>x.path),input.issue_id,input.stand);
  if(!equal(bindings,input.configs)||!equal(boundFile(input.target_operator.path),input.target_operator))throw Error('MIGRATION_CONFIG_CHANGED');
  checkBootstrapReceipt(input.bootstrap_receipt.path,input.target_operator,input.source,input.issue_id);
  if(!equal(boundFile(input.bootstrap_receipt.path),input.bootstrap_receipt))throw Error('MIGRATION_BOOTSTRAP_BYTES_CHANGED');
  const target=JSON.parse(readFileSync(input.target_operator.path)),targetHash=hash(target.admin_user);
  if(users.includes(targetHash))throw Error('MIGRATION_TARGET_IDENTITY_UNKNOWN');
  if(action==='request')savePrivateArtifact(input.directory,'parent-request.json',{
    schema:'lab53-parent-readback-request-v1',phase:'before-operation',purpose:'operator-file-only-migration',
    issue_id:input.issue_id,operation_id:input.operation_id,source:input.source,stand:input.stand,configs:bindings,effects:[],
    target_operator:input.target_operator,bootstrap_receipt:input.bootstrap_receipt,expected_observer:input.expected_observer,
    nonce:randomBytes(32).toString('hex'),after:new Date().toISOString(),observer_access:'existing-owner-Mac-Admin-native-CUA'});
  else if(action==='verify'){
    for(const p of [input.requestFile,input.responseFile])privatePath(p);
    const request=JSON.parse(readFileSync(input.requestFile)),response=JSON.parse(readFileSync(input.responseFile));
    if(request.purpose!=='operator-file-only-migration'||request.phase!=='before-operation'
      ||['issue_id','operation_id','source','stand','configs','target_operator','bootstrap_receipt','expected_observer'].some(k=>!equal(request[k],input[k])))throw Error('MIGRATION_REQUEST_CHANGED');
    const readback=verifyParentEnvelope(request,response);verifyCalibratedInventory(readback,request.after);
    if(readback.rows.some(row=>[users[1],users[2],targetHash].includes(row.user_hash)))throw Error('MIGRATION_TARGET_BUCKET_PRESENT');
    savePrivateArtifact(input.directory,'migration-consumed-'+request.nonce+'.json',{operation_id:input.operation_id,readback,
      request_sha256:hash(readFileSync(input.requestFile)),response_sha256:hash(readFileSync(input.responseFile)),input_sha256:hash(readFileSync(inputFile))});
  }else throw Error('MIGRATION_ACTION_UNKNOWN');
}
if(process.argv[1]?.endsWith('/migration-readback.mjs')){
  try{migrationReadback(...process.argv.slice(2));}catch(error){console.error(JSON.stringify({status:'UNKNOWN',code:error.code??error.message}));process.exitCode=1;}
}
