import {variableBindingsSchema,validateVariableBindings} from './variable-binding-parameters.mjs';
import {configureVariableBinding} from './variable-binding-procedure.mjs';
import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
import {validateTextImportPatch} from './text-import-procedure.mjs';
const parameter='/settings/source/source_path';
const need=(ok,code)=>{if(!ok)throw Error(code+': '+parameter);};
export const importBindingSchema=structuredClone(variableBindingsSchema);
importBindingSchema.maxItems=1;
importBindingSchema.description='Nonempty non-NULL verified string path; omit literal.';
importBindingSchema.items.properties.parameter={const:parameter};
importBindingSchema.items.properties.variable.properties.kind={const:'variables'};
importBindingSchema.items.properties.variable.properties.input={const:0};

export function resolveImportBindingParameters(p,r){
 validateVariableBindings(r.bindings,'imports.text');
 if(!r.bindings?.length)return p;
 need(r.finish!=='close'&&!p.preview_only&&!p.source_switch,'BINDING_PARAMETER_UNSUPPORTED');
 need(!Object.hasOwn(p.settings?.source??{},'source_path'),'BINDING_CONFLICT');
 need(r.target.kind==='existing'||r.variable_inputs?.some(i=>i.kind==='variables'&&i.input===0),'BINDING_PORT_MISMATCH');
 return {...p,settings:{...p.settings,source:{...p.settings?.source,source_path:'/binding-validation.csv'}}};
}
export function importBindingChannel(options,ctx,config,node){
 const {operation,execute,onRecord,now,receiptOptions}=options;
 operation.deadline=ctx.deadline;
 return createNodeProcedure({operation,execute,record:onRecord,now,...config,maxSteps:1024,signal:ctx.signal,
  preparedNodeContext:{document_id:operation.parameters.document_id,workflow_ref:operation.parameters.workflow_ref,node},
  wrapMutation:(code,p)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(p.id,p.action_key,p.signature),operation_id:p.id})});
}
export function resolveImportBindingValue(proof,name,mapping,expectedPath){
 need(proof?.verified===true&&proof.cleanup_complete===true&&proof.independent_readback===true,'BINDING_SOURCE_UNVERIFIED');
 const field=mapping?.fields?.find(f=>f.name===name),sourceName=field?.source?.name??name;
 const variables=proof.variables?.filter(v=>v.name===sourceName);
 need(variables?.length===1,'BINDING_VARIABLE_MISSING');
 const v=variables[0];need(v.type==='string'&&v.cell?.type==='string','BINDING_TYPE_MISMATCH');
 need(v.cell.is_null===false,'BINDING_NULL_UNSUPPORTED');
 need(typeof v.cell.value==='string'&&v.cell.value.length>0,'BINDING_VALUE_INVALID');
 try{validateTextImportPatch({source:{source_path:v.cell.value}});}catch{need(false,'BINDING_VALUE_INVALID');}
 if(expectedPath!==undefined)need(v.cell.value===expectedPath,'BINDING_SOURCE_UNVERIFIED');
 if(field)need(field.type===5&&field.source?.type===5&&field.source.id===v.id,'BINDING_SOURCE_UNVERIFIED');
 return {value:v.cell.value,variable:v,name};
}
export async function prepareImportBinding(options,ctx,config,settings){
 try{return await readImportBindingSource(options,ctx,config,settings);}
 catch(error){
  const op=options.operation,r=op.parameters;
  if(/^BINDING_/.test(error.message)&&!op.targetPhase&&!op.transportUncertain&&op.cleanupConfirmed!==false){
   const graph=await op.nodeTargetAdapter.observe({document_id:r.document_id,workflow_ref:r.workflow_ref},ctx.deadline,ctx.signal);
   if(graph.complete===true&&graph.document_id===r.document_id&&graph.workflow_ref.workflow_id===r.workflow_ref.workflow_id)
    error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};
  }
  throw error;
 }
}
async function readImportBindingSource(options,ctx,config,{saved=false,expectedPath}={}){
 const r=options.operation.parameters;
 const graph=await options.operation.nodeTargetAdapter.observe({document_id:r.document_id,workflow_ref:r.workflow_ref},ctx.deadline,ctx.signal);
 need(graph.complete===true&&graph.document_id===r.document_id&&graph.workflow_ref.workflow_id===r.workflow_ref.workflow_id,'BINDING_SOURCE_UNVERIFIED');
 const links=r.variable_inputs?.length?r.variable_inputs.filter(l=>l.kind==='variables'&&l.input===0)
  :(graph.variable_links??[]).filter(l=>l.target===r.target.ref?.node_id&&l.kind==='variables'&&l.input===0);
 if(!links.length&&saved)return null;
 need(links.length===1,'BINDING_PORT_MISMATCH');
 const link=links[0];
 let mapping,name=r.bindings?.[0]?.variable.name;
 if(r.target.kind==='existing'){
  const target=importBindingChannel(options,ctx,config,r.target.ref);
  if(saved){
   const s=await readImportBindingField(target);
   const f=s.wizard.import_source.fields.source_path;
   if(f.variable_mode!==true)return null;
   const mapped=await target.readVariablePortMapping({direction:'input',kind:'variables',port:0});
   need(mapped.verified===true&&mapped.independent_readback===true&&mapped.cleanup_complete===true,'BINDING_SOURCE_UNVERIFIED');mapping=mapped.mapping;
   const fields=mapping.fields.filter(v=>f.variable_caption?.startsWith(v.label+' ( '));
   need(fields.length===1,'BINDING_VARIABLE_MISSING');name=fields[0].name;
  }else{
   const mapped=await target.readVariablePortMapping({direction:'input',kind:'variables',port:0});
   need(mapped.verified===true&&mapped.independent_readback===true&&mapped.cleanup_complete===true,'BINDING_SOURCE_UNVERIFIED');mapping=mapped.mapping;
  }
 }
 const nodes=graph.nodes.filter(n=>n.ref.node_id===(link.source?.node_id??link.source));
 need(nodes.length===1&&nodes[0].type==='variables.user'&&link.output===4,'BINDING_SOURCE_UNVERIFIED');
 const source=nodes[0],channel=importBindingChannel(options,ctx,config,source.ref);
 const proof=await channel.configureUserVariables([],'close');
 const result={...resolveImportBindingValue(proof,name,mapping,expectedPath),proof,source,link,graph,mapping};
 // The host resolves only an observed/admitted file in its own selected input
 // directory. It never turns an arbitrary string into a storage reference.
 need(typeof options.resolveBoundFileSource==='function','BINDING_SOURCE_UNVERIFIED');
 const file=await options.resolveBoundFileSource(result.value);
 need(file?.kind==='storage'&&file.verified===true&&file.destination===result.value,'BINDING_SOURCE_UNVERIFIED');
 return {...result,file};
}
export function importBindingInventory(field,prepared,node){
 const {mapping,source,link,graph,name,variable}=prepared;
 need(field?.status==='observed'&&field.variable_mode===true&&field.truncated===false,'BINDING_SOURCE_UNVERIFIED');
 need(mapping?.kind==='variables'&&mapping.port===0&&typeof mapping.port_guid==='string','BINDING_PORT_MISMATCH');
 const fields=mapping.fields.filter(v=>v.name===name);need(fields.length===1,'BINDING_VARIABLE_MISSING');
 const f=fields[0];
 need(f.type===5&&f.source?.id===variable.id&&f.source.type===5
  &&mapping.fields.filter(x=>x.label===f.label).length===1
  &&field.variable_caption===f.label+' ( '+field.value+' )','BINDING_SOURCE_UNVERIFIED');
 const links=(graph.variable_links??[]).filter(l=>l.target===node.node_id&&l.kind==='variables'&&l.input===0);
 need(links.length===1&&links[0].source===source.ref.node_id&&links[0].target_port_guid===mapping.port_guid,'BINDING_PORT_MISMATCH');
 // The selector identifies the mapped variable; an inactive input can retain
 // NULL/old cached text. The independently read source, not that cache,
 // authorizes the current file. Execute receipts prove the actual output.
 need(typeof field.row_id==='string','BINDING_SOURCE_UNVERIFIED');
 return [{parameter,mode:'variable',row_id:field.row_id,variable:{kind:'variables',input:0,id:f.id,name:f.name,type:'string',is_null:false},
  source:{ref:source.ref,type:source.type,output:link.output,variable_id:variable.id},input_port_guid:mapping.port_guid,connected:true,verified:true}];
}
export async function configureImportBinding(channel,prepared){
 const f=prepared.mapping.fields.filter(f=>f.name===prepared.name);need(f.length===1,'BINDING_VARIABLE_MISSING');
 need(resolveImportBindingValue(prepared.proof,prepared.name,prepared.mapping).value===prepared.value,'BINDING_SOURCE_UNVERIFIED');
 need(prepared.mapping.fields.filter(x=>x.label===f[0].label).length===1,'BINDING_VARIABLE_MISSING');
 const chosen=caption=>typeof caption==='string'&&caption.startsWith(f[0].label+' ( ')&&caption.endsWith(' )');
 const ready=s=>s.wizard?.stage==='text_import_file'&&s.prepared_node_context?.verified===true;
 const observe=(condition,predicate=()=>true)=>channel.observe({condition,ready:s=>ready(s)&&predicate(s)});
 const state=await observe('owned Import binding editor');
 return configureVariableBinding({channel,observe,ready,state,base:state.wizard.root_tid+';ImportTextFilePreviewWizard;edtFileName',identity:s=>s.prepared_node_context,
  option:e=>chosen(e.import_binding?.caption),
  committed:s=>{const field=s.wizard.import_source?.fields?.source_path;return field?.status==='observed'&&field.variable_mode===true&&chosen(field.variable_caption);}});
}
export function resolveImportBindingSourceReadback(source,prepared,node){
 const field=source.fields.source_path;
 importBindingInventory(field,prepared,node);
 // Same W1 rule as scalar bindings: the independently observed source is
 // authoritative while the native input cache is inactive. No literal write.
 return {...source,fields:{...source.fields,source_path:{...field,value:prepared.value,
  value_length_utf16:prepared.value.length,truncated:false,value_kind:'independent_variable_source'}}};
}
export async function readImportBindingField(channel){
 await openPreparedWizard(channel);
 try{return await channel.observe({condition:'independent Import filename binding readback',ready:s=>s.wizard?.stage==='text_import_file'&&s.wizard.import_source?.fields?.source_path?.status==='observed'});}
 finally{const closed=await closePreparedWizard(channel);need(closed.verified===true&&closed.cleanup_complete===true,'BINDING_SOURCE_UNVERIFIED');}
}
export async function readImportBindings(channel,prepared){
 const s=await readImportBindingField(channel);
 const mapping=await channel.readVariablePortMapping({direction:'input',kind:'variables',port:0});
 need(mapping.verified===true&&mapping.independent_readback===true&&mapping.cleanup_complete===true,'BINDING_SOURCE_UNVERIFIED');
 return importBindingInventory(s.wizard.import_source.fields.source_path,{...prepared,mapping:mapping.mapping},s.prepared_node_context);
}
