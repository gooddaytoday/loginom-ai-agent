import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
export async function preflightBuiltinBindings(options,ctx,config,source){
 const {operation,execute,onRecord,now,receiptOptions}=options,r=operation.parameters;
 const channelFor=node=>createNodeProcedure({operation,execute,record:onRecord,now,...config,maxSteps:1024,signal:ctx.signal,
  preparedNodeContext:{document_id:r.document_id,workflow_ref:r.workflow_ref,node},
  wrapMutation:(code,p)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(p.id,p.action_key,p.signature),operation_id:p.id})});
 const channel=channelFor(source.ref),ports=source.variable_outputs?.filter(p=>p.kind==='variables'&&p.port===4);
 if(ports?.length!==1)throw Error('BINDING_SOURCE_UNVERIFIED');
 // Values/Cancel deactivates an active builtin. Preview first; open Values
 // only for an already inactive source, retaining the existing typed reader.
 let result=await channel.readBuiltinVariablesPreview({port_guid:ports[0].port_guid});
 if(result.verified!==true||result.cleanup_complete!==true||typeof result.source_active!=='boolean')throw Error('BINDING_SOURCE_UNVERIFIED');
 if(result.source_active===false)result=await channel.configureUserVariables([],'close');
 if(result.verified!==true||result.cleanup_complete!==true||result.independent_readback!==true||result.settings_applied===true)throw Error('BINDING_SOURCE_UNVERIFIED');
 let savedMapping;
 if(r.target.kind==='existing'){
  const read=await channelFor(r.target.ref).readVariablePortMapping({direction:'input',kind:'control',port:0});
  if(read.verified!==true||read.cleanup_complete!==true||read.independent_readback!==true)throw Error('BINDING_SOURCE_UNVERIFIED');
  savedMapping=read.mapping;
 }
 validateBuiltinBindingSource(result,r,savedMapping);
 return {...result,source:source.ref,settings_applied:false,...(savedMapping?{mapping:savedMapping}:{})};
}

export function validateBuiltinBindingSource(result,r,savedMapping){
 for(const b of r.bindings??[]){
  const mapping=r.mappings.find(m=>m.kind==='control'&&m.port===0),field=(mapping?.fields??mapping?.changes??[]).find(f=>f.name===b.variable.name);
  const saved=savedMapping?.fields.find(f=>f.name===b.variable.name);
  const name=field?.source?.name??saved?.source?.name??b.variable.name,vs=result.variables.filter(v=>v.name===name&&(field||!saved||v.id===saved.source?.id));
  if(vs.length!==1)throw Error('BINDING_VARIABLE_MISSING: '+b.parameter);
  const [,,g,c]=b.parameter.split('/'),condition=r.parameters.groups?.[Number(g)]?.[Number(c)],v=vs[0];
  const type=['/sort_result','/compare_with_locale'].includes(b.parameter)?'boolean':condition?.type;
  if(type&&v.type!==type)throw Error('BINDING_TYPE_MISMATCH: '+b.parameter);
  if(v.cell?.is_null!==false&&!(r.target.type==='transform.filter_data'&&v.type==='real'&&v.cell?.is_null===true&&v.cell.value===null&&v.cell.precision==='exact_null'))throw Error('BINDING_NULL_UNSUPPORTED: '+b.parameter);
 }
}
export async function preflightBooleanBindings(options,ctx,config){
 const op=options.operation,r=op.parameters;
 if(!r.bindings?.length)return;
 const graph=await op.nodeTargetAdapter.observe({document_id:r.document_id,workflow_ref:r.workflow_ref},ctx.deadline,ctx.signal);
 if(graph.complete!==true||graph.document_id!==r.document_id||graph.workflow_ref.workflow_id!==r.workflow_ref.workflow_id)throw Error('BINDING_SOURCE_UNVERIFIED');
 const links=r.variable_inputs?.some(l=>l.kind==='control')?r.variable_inputs.filter(l=>l.kind==='control'&&l.input===0)
  :(graph.variable_links??[]).filter(l=>l.target===r.target.ref?.node_id&&l.kind==='control'&&l.input===0);
 if(links.length!==1)throw Error('BINDING_PORT_MISMATCH');
 const sources=graph.nodes.filter(n=>n.ref.node_id===(links[0].source?.node_id??links[0].source));
 if(sources.length!==1)throw Error('BINDING_SOURCE_UNVERIFIED');
 if(sources[0].type==='variables.user')op.variableBindingSource=await preflightBuiltinBindings(options,ctx,config,sources[0]);
}
export async function prepareBooleanBindingInput(options,ctx,{channel}){
 const r=options.operation.nodeApply.request;
 if(!r.bindings?.length||r.mappings.some(m=>m.kind==='control'))return;
 const mapped=await channel[r.target.kind==='new'?'mapVariablePort':'readVariablePortMapping']({direction:'input',kind:'control',port:0});
 if(mapped.verified!==true||mapped.cleanup_complete!==true||mapped.independent_readback!==true)throw Error('BINDING_SOURCE_UNVERIFIED');
 options.operation.variableBindingMapping=mapped.mapping;
}
