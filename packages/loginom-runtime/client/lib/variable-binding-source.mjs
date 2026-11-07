import {createNodeProcedure} from './node-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
export async function preflightBuiltinBindings(options,ctx,config,source){
 const {operation,execute,onRecord,now,receiptOptions}=options,r=operation.parameters;
 const channel=createNodeProcedure({operation,execute,record:onRecord,now,...config,maxSteps:1024,signal:ctx.signal,
  preparedNodeContext:{document_id:r.document_id,workflow_ref:r.workflow_ref,node:source},
  wrapMutation:(code,p)=>withBrowserReceipt('('+code+')(page)',{...receiptOptions(p.id,p.action_key,p.signature),operation_id:p.id})});
 // Empty Close uses the existing independent user-values reader and Cancels
 // both untouched drafts. It preserves dirty state and every variable ID.
 const result=await channel.configureUserVariables([],'close');
 if(result.verified!==true||result.cleanup_complete!==true||result.independent_readback!==true||result.settings_applied!==false)throw Error('BINDING_SOURCE_UNVERIFIED');
 for(const b of r.bindings){
  const mapping=r.mappings.find(m=>m.kind==='control'&&m.port===0),field=(mapping?.fields??mapping?.changes??[]).find(f=>f.name===b.variable.name);
  const name=field?.source?.name??b.variable.name,vs=result.variables.filter(v=>v.name===name);
  if(vs.length!==1)throw Error('BINDING_VARIABLE_MISSING: '+b.parameter);
  const [,,g,c]=b.parameter.split('/'),condition=r.parameters.groups?.[Number(g)]?.[Number(c)],v=vs[0];
  if(condition&&v.type!==condition.type)throw Error('BINDING_TYPE_MISMATCH: '+b.parameter);
  if(v.cell?.is_null!==false)throw Error('BINDING_NULL_UNSUPPORTED: '+b.parameter);
 }
 return result;
}
