import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {privatePath,savePrivateArtifact,verifyParentEnvelope} from './parent-readback.mjs';
import {verifyFinalReadback} from './account-lifecycle.mjs';
import {requireSameObserver} from './account-identity.mjs';
import {bootstrapBindings,verifyBootstrapLogouts,equal,requireExactProcessAbsence} from './admin-bindings.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export function bootstrapReadback(action,inputFile) {
  privatePath(inputFile);const input=JSON.parse(readFileSync(inputFile)),operation=input.operation;
  const {bindings,users}=bootstrapBindings(operation.configs.map(x=>x.path),operation.issue_id,operation.stand);
  if(!equal(bindings,operation.configs))throw Error('BOOTSTRAP_CONFIG_CHANGED');
  for(const file of [input.completionFile,input.cleanupFile])privatePath(file);
  const completion=JSON.parse(readFileSync(input.completionFile)),cleanup=JSON.parse(readFileSync(input.cleanupFile));
  const receipts=verifyBootstrapLogouts(completion,operation),effects=receipts.map(x=>x.effect);
  if(effects.some((effect,index)=>effect.user_hash!==users[index])||cleanup.phase!=='process-cleanup'
    ||cleanup.process_cleanup!=='PASS'||cleanup.failure!==null||cleanup.returncode!==0
    ||cleanup.issue_id!==operation.issue_id||cleanup.operation_id!==operation.operation_id||cleanup.source_sha!==operation.source.sha
    ||!cleanup.processes?.length)throw Error('BOOTSTRAP_CLEANUP_UNKNOWN');
  requireExactProcessAbsence(cleanup.processes);
  for(const receipt of receipts)requireSameObserver(operation.expected_observer,receipt.observer,operation.stand);
  if(action==='request')savePrivateArtifact(input.directory,'parent-request.json',{
    schema:'lab53-parent-readback-request-v1',purpose:'bounded-card-admin-bootstrap',phase:'post-cleanup',
    issue_id:operation.issue_id,operation_id:operation.operation_id,source:operation.source,stand:operation.stand,
    expected_observer:operation.expected_observer,nonce:randomBytes(32).toString('hex'),configs:bindings,effects,
    cleanup_sha256:hash(readFileSync(input.cleanupFile)),logout_sha256:hash(readFileSync(input.completionFile)),
    cleanup_file:input.cleanupFile,logout_file:input.completionFile,after:new Date().toISOString(),
    observer_access:'existing-owner-Mac-Admin-native-CUA'});
  else if(action==='verify'){
    privatePath(input.requestFile);privatePath(input.responseFile);
    const request=JSON.parse(readFileSync(input.requestFile)),response=JSON.parse(readFileSync(input.responseFile));
    if(request.purpose!=='bounded-card-admin-bootstrap'||request.phase!=='post-cleanup'
      ||['issue_id','operation_id','source','stand','expected_observer','configs'].some(k=>!equal(request[k],operation[k]))
      ||!equal(request.effects,effects)||request.cleanup_sha256!==hash(readFileSync(input.cleanupFile))
      ||request.logout_sha256!==hash(readFileSync(input.completionFile)))throw Error('BOOTSTRAP_FINAL_BINDING_UNKNOWN');
    const readback=verifyParentEnvelope(request,response);verifyFinalReadback(readback,effects,request.after);
    savePrivateArtifact(input.directory,'bootstrap-consumed-'+request.nonce+'.json',{operation_id:operation.operation_id,
      request_sha256:hash(readFileSync(input.requestFile)),response_sha256:hash(readFileSync(input.responseFile)),
      input_sha256:hash(readFileSync(inputFile)),readback,effects});
  }else throw Error('BOOTSTRAP_ACTION_UNKNOWN');
}
if(process.argv[1]?.endsWith('/bootstrap-readback.mjs')){
  try {bootstrapReadback(...process.argv.slice(2));}
  catch(error){console.error(JSON.stringify({status:'UNKNOWN',code:error.code??error.message}));process.exitCode=1;}
}
