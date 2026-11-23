import {preflightTabularSource} from './sorting-preflight.mjs';
import {preflightInactiveTabularSource} from './grouping-preflight.mjs';
import {resolveDataToVarParameters} from './variables-datatovar-parameters.mjs';
import {createNodeExecutionProcedure,finishConfiguredGraph} from './node-execution-procedure.mjs';
import {makeJavascriptManagedSelectionReadCode,dispatchManagedJavascriptBody} from './javascript-managed-selection.mjs';

export function preflightDataToVarSource(options,ctx,config){
 return preflightTabularSource(options,ctx,config,{required:options.operation.parameters.parameters.fields!==undefined,
  label:'datatovar',resolve:resolveDataToVarParameters,inactiveSource:source=>preflightInactiveDataToVarSource(options,source),
  scriptSource:source=>preflightExecutedDataToVarSource(options,ctx,source)});
}

// Saved JavaScript producers have protected UI preview refs. Execute the exact
// owned graph source and read only its schema through the completed-port path;
// never open its editor, use F3 or synthesize managed JavaScript history.
export async function preflightExecutedDataToVarSource(options,ctx,{channel,binding,port,state}){
 const request=options.operation.parameters,node=binding.node;
 const need=(ok,message)=>{if(!ok){const error=Error('DataToVar source: '+message);
  error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};throw error;}};
 need(request.finish==='execute','saved JavaScript input requires finish:"execute" to confirm its current schema');
 need(port.index===0&&port.native_index===0&&typeof port.port_guid==='string'
  &&state.node_outputs?.verified===true&&state.prepared_node_context?.verified===true
  &&state.prepared_node_context.surface==='graph'&&['document_id','workflow_id','node_id'].every(k=>state.prepared_node_context[k]===node[k]),'owned table source output 0 required');
 const requireRead=(ok,message)=>{if(!ok)throw Error('DataToVar executed source: '+message);};
 const task={operation_id:options.operation.id+':source-select-0',owner:node,
  workflow_ref:{prefix:binding.workflow_ref.prefix,tab_tid:binding.workflow_ref.tab_tid},
  targetOrigin:new URL(state.origin).origin,targetBuild:state.loginom_build,deadline:options.operation.deadline};
 const before=await options.execute(makeJavascriptManagedSelectionReadCode({...task,mode:'capture'}));
 try{
  if(before.ready!==true){
   options.operation.cleanupConfirmed=false;let selected;
   try{selected=await dispatchManagedJavascriptBody({task,before,execute:options.execute,record:options.onRecord,receiptOptions:options.receiptOptions});}
   catch(error){options.operation.transportUncertain=true;options.operation.nodeEffectPossible=true;throw error;}
   options.operation.nodeEffectPossible ||= selected.effect_possible===true;
   options.operation.cleanupConfirmed=selected.cleanup_complete===true;
   requireRead(selected.status==='SUCCEEDED'&&selected.output?.selection?.ready===true,'owned source selection unconfirmed');
  }
 }finally{if(!options.operation.transportUncertain)await options.execute(makeJavascriptManagedSelectionReadCode({...task,mode:'dispose'}));}
 const driver=createNodeExecutionProcedure(channel,node,{allowDeactivate:true});
 await driver.prepare();await finishConfiguredGraph(channel,driver,'execute',node);
 const execution=await driver.waitCompleted({signal:ctx.signal,stopSignal:ctx.stopSignal});
 // After Execute, refuse with its real effects retained by the operation gate.
 requireRead(execution.verified===true&&execution.owner_verified===true&&execution.status==='completed'&&execution.cleanup_complete===true,'execution unconfirmed');
 const result=await channel.readOutputPort({port:0,execution,sampleRows:0,requireExactNumbers:false});
 const output=result.output;
 requireRead(result.verified===true&&result.cleanup_complete===true&&output?.port_guid===port.port_guid
  &&output.execution_id===execution.execution_id&&output.fresh===true&&output.sample_rows===0
  &&Array.isArray(output.schema)&&output.schema.length>0,'complete owned schema required');
 let fields=output.schema;
 const mapping=request.mappings.find(m=>m.direction==='input'&&m.port===0);
 if(mapping?.fields){
  const seen=new Set();requireRead(mapping.fields.length===fields.length,'mapping must account for every source field');
  fields=mapping.fields.map(f=>{const source=fields.find(c=>c.name===f.source?.name);
   requireRead(source&&!seen.has(source.name)&&f.excluded!==true,'exact complete input mapping required');seen.add(source.name);
   return {...source,name:f.name??source.name,label:f.label??source.label};});
 }
 resolveDataToVarParameters(request.parameters,fields);
 await options.onRecord({phase:'datatovar_preflight_completed',operation_id:options.operation.id,node,port:0,
  execution,schema:fields,parameters_valid:true,source_activity:{before:port.active,after:true},
  source_read:'completed_execution_port_schema',settings_changed:false});
 return {verified:true,parameters_valid:true,schema:fields,execution,source_read:'completed_execution_port_schema',settings_changed:false};
}

export function preflightInactiveDataToVarSource(options,source){
 return preflightInactiveTabularSource(options,source,{label:'datatovar',
  sourceIcons:['bg-vendor-icon-importtextfile'],resolve:resolveDataToVarParameters});
}
