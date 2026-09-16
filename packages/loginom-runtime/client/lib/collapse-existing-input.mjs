import {createHash} from 'node:crypto';
import {readPreparedNodeContext} from './node-context.mjs';
import {bindLoadedNativeRuntime,collectNativeRuntime,verifyLoadedNativeRuntime} from './collapse-native-runtime.mjs';
import {readCollapseInputBrowser} from './collapse-existing-input-browser.mjs';
import {collapseInputSources} from './collapse-existing-input-pins.mjs';
import {resolveCollapseParameters} from './collapse-parameters.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const need=(v,m)=>{if(!v)throw Error('Collapse existing input: '+m);};
const types={1:'boolean',2:'datetime',3:'real',4:'integer',5:'string',6:'variant'};
export function validateCollapseInputSnapshot(snapshot,request,expected) {
 need(snapshot?.verified===true&&snapshot.complete===true&&snapshot.cleanup_complete===true&&snapshot.mutation_calls===0,'complete readonly snapshot required');
 need(snapshot.document_id===request.document_id&&snapshot.workflow_id===request.workflow_ref.workflow_id&&snapshot.node_id===request.target.ref.node_id&&snapshot.build==='7.4.2','snapshot owner/build');
 need(snapshot.binding?.node===snapshot.node_id&&snapshot.binding.input&&snapshot.binding.link&&snapshot.binding.source&&snapshot.binding.source_port&&typeof snapshot.active==='boolean','native input identity');
 need(snapshot.references_acquired===snapshot.references_released&&Number.isInteger(snapshot.references_acquired)&&snapshot.references_acquired>=5,'native references not released');
 const fields=snapshot.fields;need(Array.isArray(fields)&&fields.length<=1000&&new Set(fields.map(f=>f.name)).size===fields.length&&new Set(fields.map(f=>f.id)).size===fields.length&&new Set(fields.map(f=>f.source_name)).size===fields.length,'complete unique effective fields');
 need(fields.every((f,i)=>f.index===i&&Number.isSafeInteger(f.id)&&f.id>=0&&typeof f.name==='string'&&f.name.length>0&&f.name.length<240&&typeof f.source_name==='string'&&f.source_name.length>0&&types[f.type]),'invalid effective input field');
 need(Array.isArray(snapshot.native_schema_bytes)&&snapshot.native_schema_bytes.length<=65536&&(fields.length===0||snapshot.native_schema_bytes.length>0)&&snapshot.native_schema_bytes.every(b=>Number.isInteger(b)&&b>=0&&b<=255),'native schema bytes');
 need(snapshot.usage_types&&['columns','definitions','hashed'].every(k=>Number.isInteger(snapshot.usage_types[k])&&snapshot.usage_types[k]>=0&&snapshot.usage_types[k]<=65535)&&(snapshot.usage_types.columns|snapshot.usage_types.definitions)===snapshot.usage_types.hashed,'native usage masks');
 const input=request.inputs.find(i=>i.input===0);
 if(input)need(input.source.node_id===snapshot.binding.source&&input.source.document_id===snapshot.document_id&&input.source.workflow_id===snapshot.workflow_id,'requested input differs from saved source');
 const stable={document_id:snapshot.document_id,workflow_id:snapshot.workflow_id,node_id:snapshot.node_id,binding:snapshot.binding,fields,native_schema_bytes:snapshot.native_schema_bytes,usage_types:snapshot.usage_types,active:snapshot.active};
 const signature=createHash('sha256').update(JSON.stringify(stable)).digest('hex');
 if(expected)need(signature===expected,'stale effective input snapshot');
 const mapping=request.mappings.find(m=>m.direction==='input'&&m.port===0);
 let effective=fields.map(f=>({...f,type:types[f.type]}));
 if(mapping?.fields){
  need(mapping.fields.length===fields.length,'input mapping must retain every effective source');
  const seen=new Set();effective=mapping.fields.map(m=>{const f=effective.find(f=>f.source_name===m.source?.name);need(f&&!seen.has(f.source_name)&&m.excluded!==true,'unknown or repeated saved mapping source');seen.add(f.source_name);return {...f,name:m.name??f.name};});
 }
 resolveCollapseParameters(request.parameters,effective);
 return {signature,fields:effective};
}
const refuse=error=>{error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;};
export async function checkCollapseExistingInput(options,ctx,config,{recheck=false}={}) {
 const {operation,execute,onRecord}=options,request=operation.parameters;
 if(request.target.kind!=='existing'||request.parameters.information===undefined)return;
 const binding={document_id:request.document_id,workflow_ref:request.workflow_ref,node:request.target.ref};
 const before=await execute(`async page=>(${readPreparedNodeContext.toString()})(page,${JSON.stringify(binding)})`);
 if(before.verified!==true||before.surface!=='graph')refuse(Error('Collapse existing input requires its unchanged graph owner'));
 const runtimeBinding=operation.id+':existing-input'+(recheck?':recheck':':initial');
 const loaded=await execute(`async page=>(${bindLoadedNativeRuntime.toString()})(page,${JSON.stringify({binding_id:runtimeBinding,document_id:request.document_id,node_id:request.target.ref.node_id,origin:new URL(config.targetOrigin).origin})},${collectNativeRuntime.toString()})`);
 try{verifyLoadedNativeRuntime(loaded,{binding_id:runtimeBinding,document_id:request.document_id});}catch(error){refuse(error);}
 const budgetMs=Math.max(1,Math.min(25000,ctx.deadline-Date.now()));
 const snapshot=await execute(`async page=>page.evaluate(${readCollapseInputBrowser.toString()},${JSON.stringify({binding,sources:collapseInputSources,budgetMs,runtimeBinding})})`);
 const after=await execute(`async page=>(${readPreparedNodeContext.toString()})(page,${JSON.stringify(binding)})`);
 try{
  need(same(before,after),'graph owner changed during snapshot');
  const validated=validateCollapseInputSnapshot(snapshot,request,recheck?operation.collapseExistingInputSignature:undefined);
  if(recheck)need(typeof operation.collapseExistingInputSignature==='string','initial input snapshot missing');
  else operation.collapseExistingInputSignature=validated.signature;
  const event=await onRecord({phase:'collapse_existing_input_verified',operation_id:operation.id,proof:{recheck,snapshot,signature:validated.signature}});
  need(event?.phase==='collapse_existing_input_verified','input proof not retained');
  return validated;
 }catch(error){refuse(error);}
}
