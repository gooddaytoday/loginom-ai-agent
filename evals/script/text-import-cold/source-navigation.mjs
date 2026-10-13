import {createHash} from 'node:crypto';
const need=(value,message)=>{if(!value)throw Error('COLD_SOURCE:'+message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function rebindStorageNavigation(original,fresh,element,verb){
 need(original.authenticated===true&&fresh.authenticated===true
  &&typeof original.origin==='string'&&fresh.origin===original.origin&&fresh.loginom_build===original.loginom_build
  &&original.dom_epoch?.document&&fresh.dom_epoch?.document===original.dom_epoch.document
  &&same(fresh.workflow_ref,original.workflow_ref)&&fresh.active_tab_ref===original.active_tab_ref
  &&same(fresh.package_identity,original.package_identity)&&same(fresh.geometry,original.geometry)
  &&fresh.file_storage?.status===original.file_storage?.status&&fresh.file_storage?.directory===original.file_storage?.directory
  &&Array.isArray(fresh.ui?.dialogs)&&fresh.ui.dialogs.length===0&&Array.isArray(fresh.ui?.masks)&&fresh.ui.masks.length===0,
  'storage navigation owner changed');
 need(typeof fresh.observation_id==='string'&&fresh.observation_id&&typeof element.tid==='string'&&element.tid
  &&['click','double_click','scroll'].includes(verb),'storage issued observation required');
 const matches=fresh.ui.elements.filter(e=>e.tid===element.tid);
 need(matches.length===1,'storage navigation target ambiguous');
 const e=matches[0];
 need(typeof e.ref==='string'&&e.ref&&e.label===element.label&&e.allowed_actions?.includes(verb)
  &&e.interaction?.state==='point_observed'&&e.storage_entry?.kind===element.storage_entry?.kind
  &&e.storage_entry?.bytes===element.storage_entry?.bytes
  &&(verb!=='scroll'||same(e.scroll,element.scroll)),'storage navigation capability changed');
 return e;
}

// Match the pinned NodeProcedure pre-gesture refresh contract through public
// observe/uiAct. No browser gesture, owner, scope or intent is replayed blindly.
export async function navigateStorageWithFreshObservation({snapshot,element,verb='click',extra={},observe,act,record}) {
 need(typeof observe==='function'&&typeof act==='function'&&typeof record==='function','storage navigation adapters required');
 const binding=hash({document:snapshot.dom_epoch?.document,workflow:snapshot.workflow_ref,tab:snapshot.active_tab_ref,
  package:snapshot.package_identity,directory:snapshot.file_storage?.directory,tid:element.tid,label:element.label,
  kind:element.storage_entry?.kind,bytes:element.storage_entry?.bytes});
 const intent=hash({verb,extra});
 let previousObservation=snapshot.observation_id;
 for(let attempt=0;attempt<3;attempt++){
  const fresh=await observe(snapshot,element);
  need(fresh.observation_id!==previousObservation,'storage observation was not renewed');
  const current=rebindStorageNavigation(snapshot,fresh,element,verb);
  previousObservation=fresh.observation_id;
  const outcome=await act(fresh,current,verb,extra);
  if(outcome.status==='SUCCEEDED'&&outcome.cleanup_complete===true){
   need(outcome.trace?.filter(e=>e.event==='ui_gesture_applied').length===1
    &&outcome.trace?.filter(e=>e.event==='ui_preconditions_verified').length===1,'storage gesture count unconfirmed');
   return outcome;
  }
  if(attempt===2||outcome.status!=='NOT_APPLIED'||outcome.effect_possible!==false||outcome.cleanup_complete!==true
   ||outcome.phase!=='preconditions'||outcome.error?.code!=='UI_EPOCH_CHANGED'||!Array.isArray(outcome.trace)
   ||outcome.trace.some(e=>['ui_preconditions_verified','ui_gesture_applied'].includes(e.event)))return outcome;
  const event={phase:'cold_storage_navigation_refresh_authorized',operation_id:outcome.operation_id,
   rejected_operation_id:outcome.operation_id,attempt:attempt+1,effect_possible:false,binding_sha256:binding,intent_sha256:intent};
  const ack=await record(event);
  need(ack?.phase===event.phase&&ack.rejected_operation_id===event.rejected_operation_id
   &&ack.attempt===event.attempt&&ack.binding_sha256===binding&&ack.intent_sha256===intent,'storage refresh authorization not durable');
 }
}
