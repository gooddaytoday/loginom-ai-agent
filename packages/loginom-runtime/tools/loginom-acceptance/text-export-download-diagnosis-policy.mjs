// Private acceptance purpose; never a product/public capability.
export const DIAGNOSIS_ASSIGNMENT='node17:download-diagnosis:1:43a7d37f';
export function diagnosisPolicy(){
 const used=new Set();let prepared=false,delivered=false;
 return request=>{
  const {name,arguments:a={}}=request.params??{};
  const once=id=>{if(used.has(id))throw Error('DIAGNOSIS_REPEAT_FORBIDDEN');used.add(id);};
  if(name==='dock_prepare'&&a.operation_id==='smoke-prepare'&&a.intent==='new_draft'){once('prepare');prepared=true;return;}
  if(!prepared)throw Error('DIAGNOSIS_NOT_PREPARED');
  if(name==='dock_artifact_deliver'&&a.operation_id==='smoke-deliver'){once('deliver');delivered=true;return;}
  if(name==='dock_artifact_delivery_status'&&a.operation_id==='smoke-deliver'&&delivered)return;
  if(name==='dock_node_wait'&&['smoke-source','smoke-original','smoke-reject'].includes(a.operation_id)&&used.has(a.operation_id))return;
  if(name==='dock_node_apply'&&delivered){
   const order=['smoke-source','smoke-original','smoke-reject','smoke-replace'],i=order.indexOf(a.operation_id);
   if(i<0||(i>0&&!used.has(order[i-1])))throw Error('DIAGNOSIS_NODE_ORDER');
   if(a.target?.type!==(i===0?'imports.text':'exports.text')||a.finish!=='execute'||a.mode!=='delimited'||(i===3?a.parameters?.overwrite!=='replace':a.parameters?.overwrite!==undefined))throw Error('DIAGNOSIS_NODE_FORBIDDEN');
   once(a.operation_id);return;
  }
  throw Error('DIAGNOSIS_OPERATION_FORBIDDEN');
 };
}
export async function refuseDiagnosticDispatch({diagnosisOnly,record,run,request}){
 if(!diagnosisOnly)return;
 await record({phase:'diagnostic_stop',run_id:run.run_id,operation_id:request.params.arguments.operation_id,product_dispatch_forbidden:true,observer_completed:true});
 throw Error('DIAGNOSIS_OBSERVER_COMPLETED_PRODUCT_REPLACE_FORBIDDEN');
}
