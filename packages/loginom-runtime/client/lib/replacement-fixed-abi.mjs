import {makeReplacementCaptureCode} from './replacement-capture.mjs';

// Executable private contract proposal, NOT a registration/grant/host entry.
// Admission needs the original host-owned handles and raw native observations.
export const REPLACEMENT_FIXED_ABI=Object.freeze({
 revision:1,kind:'replacement-input0-readonly-v1',node_type:'transform.replace_columns',input:0,
 consumer:'makeReplacementCaptureCode(request)',
 resource:'runtime/src/acceptance/replacement-input0-readonly-v1.mjs',
 request_keys:Object.freeze(['binding','account','package_path','origin','build','port_guid','opening_operation_id']),
 retained_handles:Object.freeze(['startupOwner','page','context','executor','session','lease','run','generation','chat','signal','deadline']),
 raw_binding:Object.freeze(['document','package','workflow','node','input_port','connection','epoch','opening_receipt','original_request']),
 result:'DIAGNOSTIC_READ | NOT_APPLIED',admission:false,settings_applied:false,execution_started:false,
});

// Reject accessor operands before invoking the existing private consumer. This
// fixes the operand boundary of the proposed ABI, not the generic PATH policy.
export function compileReplacementReadContract(request){
 if(!request||![Object.prototype,null].includes(Object.getPrototypeOf(request)))throw Error('REPLACEMENT_FIXED_REQUEST');
 const descriptors=Object.getOwnPropertyDescriptors(request),keys=Object.keys(descriptors);
 if(Reflect.ownKeys(request).length!==keys.length||keys.some(k=>!REPLACEMENT_FIXED_ABI.request_keys.includes(k)&&k!=='output_column_page')
  ||REPLACEMENT_FIXED_ABI.request_keys.some(k=>!Object.hasOwn(descriptors,k))
  ||keys.some(k=>!Object.hasOwn(descriptors[k],'value')||!descriptors[k].enumerable))throw Error('REPLACEMENT_FIXED_REQUEST');
 // Still diagnostic-only. A valid object/code does not mint retained authority.
 return makeReplacementCaptureCode(copyData(request,new Set()));
}

function copyData(value,seen){
 if(value===null||['string','boolean','undefined'].includes(typeof value))return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(typeof value!=='object'||seen.has(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('REPLACEMENT_FIXED_REQUEST');
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(value);
 if(keys.some(k=>typeof k!=='string'||!Object.hasOwn(descriptors[k],'value')||!descriptors[k].enumerable&&!(Array.isArray(value)&&k==='length')))throw Error('REPLACEMENT_FIXED_REQUEST');
 seen.add(value);const result=Array.isArray(value)?[]:{};
 for(const key of keys)if(key!=='length'||!Array.isArray(value))Object.defineProperty(result,key,{value:copyData(descriptors[key].value,seen),enumerable:true,writable:true,configurable:true});
 seen.delete(value);return result;
}

export function validateReplacementReadContract(result,request){
 const reject=()=>{throw Error('REPLACEMENT_FIXED_RESULT')};
 if(!result||!['DIAGNOSTIC_READ','NOT_APPLIED'].includes(result.status)||result.effect_possible!==false
   ||result.native_capture_admitted!==false||result.settings_applied===true||result.execution_started===true
   ||!result.gates||Object.keys(result.gates).sort().join(',')!=='current_resources,deadline_pending_dirty,host_registration,native_semantic_mapping,original_owner,same_owner_cleanup'
   ||Object.values(result.gates).some(v=>v!=='not_verified'))reject();
 if(result.status==='NOT_APPLIED')return result; // Refusal never authorizes retry/release.
 const exact=n=>n?.verified===true&&n.surface==='wizard'&&n.document_id===request.binding.document_id
  &&n.workflow_id===request.binding.workflow_ref.workflow_id&&n.node_id===request.binding.node.node_id&&n.tid===request.binding.workflow_ref.prefix+';WizrdMCF'
  &&n.input_port?.direction==='input'&&n.input_port.port===0&&n.input_port.native_index===0
  &&n.input_port.port_guid===request.port_guid&&n.input_port.opening_operation_id===request.opening_operation_id&&!n.output_port;
 const proofs=[result.native_before,result.native_after,result.observation?.output?.prepared_node_context,result.final_observation?.output?.prepared_node_context];
 if(proofs.some(p=>!exact(p)||JSON.stringify(p)!==JSON.stringify(proofs[0]))
  ||result.identity?.account!==request.account||result.identity?.package_path!==request.package_path
  ||result.identity?.origin!==request.origin||result.identity?.build!==request.build||result.identity?.verified!==true
  ||[result.observation,result.final_observation].some(o=>o?.status!=='SUCCEEDED'||o.effect_possible!==false)
  ||!result.observation.output.dom_epoch||JSON.stringify(result.observation.output.dom_epoch)!==JSON.stringify(result.final_observation.output.dom_epoch))reject();
 return result;
}
