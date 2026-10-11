// Read-only finite proof for the one pinned historical LAB47 observer marker.
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {privatePath,savePrivateArtifact,verifyParentEnvelope} from './parent-readback.mjs';
import {verifyFinalReadback} from './account-lifecycle.mjs';
import {boundFile,hash,equal} from './admin-bindings.mjs';
export const observer47={session_id:3119,create_time:'2026-10-08T23:54:12.928Z',
  guid_hash:'b898c6aee54ebfd9cf99762a978565508720322de8368e3fa3e551a7a28e99cc'};
export function verifyObserver47Absence(readback,effect,after){
  if(!equal(Object.fromEntries(Object.keys(observer47).map(k=>[k,effect[k]])),observer47)
    ||effect.user_hash!=='e4c32267fce53e0a49e11b22036babb513cba117b932756b87e9f6664cf3d675')throw Error('CARD47_EFFECT_UNBOUND');
  verifyFinalReadback(readback,[effect],after);
  if(readback.rows.some(row=>row.user_hash===effect.user_hash))throw Error('CARD47_BUCKET_PRESENT');
}
export function observerReadback(action,inputFile){
  privatePath(inputFile);const input=JSON.parse(readFileSync(inputFile));
  if(input.configs.length!==7||input.configs.some(x=>!equal(x,boundFile(x.path))))throw Error('CARD47_CONFIG_CHANGED');
  const operator=JSON.parse(readFileSync(input.card_operator.path));
  if(!equal(boundFile(input.card_operator.path),input.card_operator))throw Error('CARD47_CONFIG_CHANGED');
  const effect={...observer47,user_hash:hash(operator.admin_user),stand:operator.url};
  if(action==='request')savePrivateArtifact(input.directory,'parent-request.json',{
    schema:'lab53-parent-readback-request-v1',phase:'historical-reconciliation',purpose:'exact-card47-observer-current-absence',
    issue_id:input.issue_id,operation_id:input.operation_id,source:input.source,stand:input.stand,configs:input.configs,
    marker:input.marker,origins:input.origins,card_operator:input.card_operator,expected_observer:input.expected_observer,
    effects:[effect],nonce:randomBytes(32).toString('hex'),after:new Date().toISOString(),observer_access:'existing-owner-Mac-Admin-native-CUA'});
  else if(action==='verify'){
    for(const path of [input.requestFile,input.responseFile])privatePath(path);
    const request=JSON.parse(readFileSync(input.requestFile)),response=JSON.parse(readFileSync(input.responseFile));
    if(request.phase!=='historical-reconciliation'||request.purpose!=='exact-card47-observer-current-absence'
      ||['issue_id','operation_id','source','stand','configs','marker','origins','card_operator','expected_observer'].some(k=>!equal(request[k],input[k]))
      ||!equal(request.effects,[effect]))throw Error('CARD47_REQUEST_CHANGED');
    const readback=verifyParentEnvelope(request,response);verifyObserver47Absence(readback,effect,request.after);
    savePrivateArtifact(input.directory,'card47-consumed-'+request.nonce+'.json',{
      operation_id:input.operation_id,input_sha256:hash(readFileSync(inputFile)),request_sha256:hash(readFileSync(input.requestFile)),
      response_sha256:hash(readFileSync(input.responseFile)),readback,effect,current_proof:'CURRENT_CARD47_PROOF_ONLY',ready:false});
  }else throw Error('CARD47_ACTION_UNKNOWN');
}
if(process.argv[1]?.endsWith('/card-observer-readback.mjs')){
  try{observerReadback(...process.argv.slice(2));}catch(error){console.error(JSON.stringify({status:'UNKNOWN',code:error.code??error.message}));process.exitCode=1;}
}
