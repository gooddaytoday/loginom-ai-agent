import {configureReform} from '../../client/lib/reform-procedure.mjs';
import {bindReformInput} from '../../client/lib/reform-input.mjs';
const need=(v,m)=>{if(!v)throw Error('LOGINOM_FP_'+m);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=['owner','run','lease','generation','chat','admission','account','session','packagePath','expires'];
const ids=['session_id','account','package_path','document_id','workflow_id','node_id'];
// Fixed private component, NOT registered as a model tool or managed caller.
// The future admitted caller supplies the existing serial NodeProcedure channel.
// This component never opens/finishes a wizard, executes, saves or cleans up.
export async function collectFieldParametersPreservation({binding,identity,retained,inputMapping,resources,channel,record}) {
 need(binding?.revision===1&&binding.harness==='field-parameters-preservation-v1','BINDING');
 need(keys.filter(k=>!['generation','expires'].includes(k)).every(k=>typeof binding[k]==='string'&&binding[k].length>0)
  &&binding.lease===binding.owner+':'+binding.run&&Number.isSafeInteger(binding.generation)&&binding.generation>0
  &&Number.isFinite(binding.expires)&&binding.expires>Date.now(),'AUTHORITY');
 need(identity&&ids.every(k=>typeof identity[k]==='string'&&identity[k].length>0)
  &&identity.session_id===binding.session&&identity.account===binding.account&&identity.package_path===binding.packagePath
  &&identity.type==='transform.reform_columns'&&identity.input_port===0,'IDENTITY');
 need(retained?.channel===channel&&channel&&typeof channel.observe==='function'&&typeof channel.perform==='function'
  &&typeof record==='function'&&keys.every(k=>retained.binding?.[k]===binding[k])
  &&ids.every(k=>retained.identity?.[k]===identity[k])
  &&['type','input_port'].every(k=>retained.identity?.[k]===identity[k]),'RETAINED_CONTEXT');
 const owner=Object.freeze({...Object.fromEntries(keys.map(k=>[k,binding[k]])),...Object.fromEntries(ids.map(k=>[k,identity[k]]))});
 const current=()=>{
  need(Date.now()<owner.expires&&keys.every(k=>binding[k]===owner[k]&&retained.binding[k]===owner[k])
   &&ids.every(k=>identity[k]===owner[k]&&retained.identity[k]===owner[k])
   &&identity.type==='transform.reform_columns'&&identity.input_port===0
   &&retained.identity.type===identity.type&&retained.identity.input_port===identity.input_port
   &&retained.channel===channel,'OWNER_CHANGED');
  need(resources&&resources.observed_at<=Date.now()&&resources.deadline===owner.expires
   &&resources.observed_at>=owner.expires-120000&&ids.every(k=>resources[k]===owner[k])
   &&keys.filter(k=>!['expires','packagePath','account','session'].includes(k)).every(k=>resources[k]===owner[k])
   &&['dirty','running','unsettled','pending','unknown_effect'].every(k=>resources[k]===false),'RESOURCE_UNKNOWN');
 };
 const input=structuredClone(inputMapping);
 const ready=s=>s.wizard?.status==='observed'&&s.wizard.stage==='field_parameters'&&s.node_reform?.verified===true;
 const check=s=>{
  current();const c=s?.prepared_node_context,w=s?.wizard;
  need(c?.verified===true&&c.surface==='wizard'&&['document_id','workflow_id','node_id'].every(k=>c[k]===owner[k])
   &&w?.status==='observed'&&w.stage==='field_parameters'&&typeof w.root_ref==='string'&&w.root_ref
   &&typeof w.root_tid==='string'&&w.root_tid,'NODE_ROOT');
  need([s.node_reform?.node_context,input?.node_context].every(n=>n?.verified===true
   &&['document_id','workflow_id','node_id'].every(k=>n[k]===owner[k])),'NATIVE_BINDING');
  const b=bindReformInput(s.node_reform,input);
  need(b.fields.length===5&&b.fields.every(f=>typeof f.record_id==='string'&&f.record_id.length>0
   &&typeof f.field_id==='string'&&f.caching_method===2)&&new Set(b.fields.map(f=>f.record_id)).size===5,'BASELINE');
  return {configuration:b,root_ref:w.root_ref,root_tid:w.root_tid};
 };
 let root;
 const scoped={...channel,observe:async options=>{current();const s=await channel.observe(options);
  const c=s?.prepared_node_context,w=s?.wizard;
  need(c?.verified===true&&c.surface==='wizard'&&['document_id','workflow_id','node_id'].every(k=>c[k]===owner[k])
   &&w?.root_ref===root.root_ref&&w?.root_tid===root.root_tid,'NODE_ROOT');
  if(options.readReform)check(s);return s;},
  perform:async options=>{current();const receipt=await channel.perform(options);
   need(receipt?.status==='SUCCEEDED'&&receipt.cleanup_complete===true&&receipt.action_key==='ui.act'
    &&typeof receipt.operation_id==='string'&&receipt.operation_id.length>0,'TYPED_STEP_UNCONFIRMED');
   return receipt;}};
 let uncertain=false;
 try {
  current();const before=check(await channel.observe({condition:'FP full bound baseline',readReform:true,ready}));
  root=before;
  const names=before.configuration.fields.map(f=>f.input_field.name);
  need(same(names,['RowID','A','B','C','Extra']),'INPUT_IDENTITIES');
  await record({event:'fp_preservation_baseline',owner,baseline:before});current();
  uncertain=true;
  const configured=await configureReform(scoped,{changes:[
   {field:{kind:'input_field',name:'A'},label:'Only A'},
   {field:{kind:'input_field',name:'B'},name:'RenamedB',usage:'Группа',data_kind:'Неопределенное'},
   {field:{kind:'input_field',name:'C'},excluded:true},
  ]},{inputMapping:input});
  need(configured?.verified===true&&configured.cleanup_complete===true&&configured.settings_applied===false,'READBACK_UNCONFIRMED');
  uncertain=false;current();const after=check(await channel.observe({condition:'FP preservation readback',readReform:true,ready}));
  need(after.root_ref===before.root_ref&&after.root_tid===before.root_tid,'ROOT_CHANGED');
  need(same(after.configuration,configured.configuration)&&same(configured.baseline_configuration,before.configuration),'READBACK_CHANGED');
  const result={revision:1,kind:'field_parameters_preservation_draft',owner,before,after,configured,
   stopped_before_done:true,settings_applied:false,execution_started:false,native_verified:false,
   values_verified:false,package_persistence_verified:false};
  await record({event:'fp_preservation_readback',owner,result});current();return result;
 }catch(primary){
  // Awaited record is not fsync. Persistence refusal never replaces primary.
  try{await record({event:'fp_preservation_refusal',owner,uncertain,rejection:fpRejection(primary)})}catch{}
  throw primary; // No finally cleanup, no retry, no pending/journal deletion.
 }
}
export function fpRejection(v){return v instanceof Error?{kind:'Error',name:v.name,message:v.message,...('cause' in v?{cause:fpRejection(v.cause)}:{})}:{kind:'value',value:v===undefined?null:v,is_undefined:v===undefined};}
