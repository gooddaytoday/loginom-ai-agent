import {createHash} from 'node:crypto';
import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {verifyTextImportSource} from './text-import-node.mjs';
import {excelParametersSchema,validateExcelParameters} from './imports-excel-parameters.mjs';
import {makeExcelConfigureCode} from './imports-excel-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {resolveConfiguredOutputMapping} from './port-mapping-procedure.mjs';
const need=(v,m)=>{if(!v)throw Error('Excel import: '+m);};
const verified=v=>({verified:true,cleanup_complete:true,effect_possible:false,...v});
export function excelReadback({node,phases,operation_id}){
 const receipt=name=>{
  const matches=phases.filter(p=>p.phase===name),p=matches[0];
  need(matches.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name
   &&p.value?.verified===true&&p.value.cleanup_complete===true,'unique verified '+name+' required');return p;
 };
 const configured=receipt('configure'),saved=receipt('node_finish'),mapped=receipt('output_mapping'),finished=receipt('finish');
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const c=configured?.value?.configuration;
 need(configured?.status==='verified'&&c?.verified&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner differs');
 need(saved?.status==='verified'&&saved.value?.settings_applied===true&&saved.value.mode==='done'&&['document_id','workflow_id','node_id'].every(k=>saved.value.node_context?.[k]===node[k]),'settings were not committed to this node');
 const m=mapped.value.native_mapping;
 need(m?.verified===true&&m.inventory_complete===true&&m.source_identity_verified===true
  &&m.mapping_wizard==='DataSetOutputSocketWizard'&&owner(m.node_context)
  &&m.node_context.output_port?.direction==='output'&&m.node_context.output_port.port===0
  &&mapped.value.source_identity_verified===true&&typeof m.autosync==='boolean'
  &&Array.isArray(m.source_fields)&&Array.isArray(m.target_fields)&&Array.isArray(c.columns)
  &&m.source_fields.length===c.columns.length&&m.target_fields.length===c.columns.length,'output mapping owner or inventory differs');
 need(mapped.value.finish?.verified===true&&mapped.value.finish.cleanup_complete===true
  &&mapped.value.finish.settings_applied===true&&mapped.value.finish.mode==='done'&&owner(mapped.value.finish.node_context)
  &&finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode)&&owner(finished.value.node_context),'output mapping was not committed to this node');
 const linked=new Set(),fields=m.target_fields.map((f,index)=>{
  const source=f.source;
  need(f.index===index&&f.excluded===false&&f.inherited===false&&source&&typeof source.record_id==='string'
   &&!linked.has(source.record_id)&&m.source_fields.filter(s=>JSON.stringify(s)===JSON.stringify(source)).length===1
   &&['name','label','type','data_kind'].every(k=>typeof f[k]==='string'&&f[k]===c.columns[index][k])
   &&typeof source.name==='string','output mapping fields or sources differ');
  linked.add(source.record_id);
  return {index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind,excluded:false,source_name:source.name};
 });
 need(linked.size===m.source_fields.length,'output source coverage differs');
 return {kind:'excel_import',scope:'observed_before_verified_finish',node,values_are:'observed_ui_values',source:c.source,auto_detect:c.auto_detect,columns:c.columns,
  receipt_ids:[configured,saved,mapped,finished].map(p=>p.receipt_id),output_mapping:{port:0,autosync:m.autosync,fields},package_persistence_verified:false};
}

export function createExcelImportNodeSupport(config){
 const implementation={type:'imports.excel',mode:'xlsx',revision:'excel-import-v1',parameterSchema:excelParametersSchema,validate:validateExcelParameters,readback:excelReadback,
  configurationObservation:{condition:'owned Excel source wizard',ready:s=>s.wizard?.status==='observed'&&s.prepared_node_context?.surface==='wizard'},
  configureInputs:async()=>verified({not_applicable:true}),
  async configureOutput(channel,configured){
   const state=await channel.observe({condition:'owned Excel output mapping',readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
   resolveConfiguredOutputMapping({direction:'output',port:0},configured.columns,state.node_mapping);
   need(state.node_mapping.target_fields.length===configured.columns.length&&state.node_mapping.target_fields.every((f,i)=>!f.excluded&&f.source
    &&['name','label','type','data_kind'].every(k=>f[k]===configured.columns[i][k])),'output mapping differs from explicit Excel fields');
   return verified({native_mapping:state.node_mapping,source_identity_verified:true});
  },
 };
 return {nodeApplyHandlers:createTabularTransformNodeSupport(config,implementation).nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  const drivers=createTabularTransformNodeSupport(config,{...implementation,configure:async(channel,p,{request})=>{
   const {operation,execute,onRecord,receiptOptions}=options;
   const step=operation.nodeStepSequence=(operation.nodeStepSequence??0)+1,id=operation.id+':n'+step,key='node.excel.configure.internal';
   const ctx={document_id:request.document_id,workflow_ref:request.workflow_ref,node:operation.nodeApply.node,deadline:operation.deadline};
   const action={verb:'excel_configure',excel:p.excel},signature=createHash('sha256').update(JSON.stringify([id,action,ctx])).digest('hex');
   const entry=(phase,value)=>onRecord({operation_id:operation.id,action_key:'node.apply',action_revision:'1.0.0',phase,internal_provenance:'client_node_procedure_v1',step,internal_operation_id:id,...value});
   const prepared=await entry('node_step_prepared',{action,signature});
   need(prepared?.signature===signature&&JSON.stringify(prepared.action)===JSON.stringify(action),'step was not durably prepared');
   const code=makeExcelConfigureCode({...ctx,excel:p.excel,origin:config.targetOrigin,build:config.targetBuild});
   const envelope=`async page=>{const r=await (${code})(page);return {status:r.verified?'SUCCEEDED':r.effect_possible?'AMBIGUOUS':'NOT_APPLIED',action_key:${JSON.stringify(key)},action_revision:'1',operation_id:${JSON.stringify(id)},phase:'configure',effect_possible:r.effect_possible,cleanup_complete:r.cleanup_complete,output:r,error:r.error?{code:'EXCEL_CONFIGURATION_UNCONFIRMED',message:r.error}:null,trace:[]}}`;
   let result;
   try{result=await execute(withBrowserReceipt(`(${envelope})(page)`,{...receiptOptions(id,key,signature),operation_id:id}),{timeout:Math.max(5000,ctx.deadline-Date.now()+5000)});}
   catch(error){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw error;}
   need(result.operation_id===id&&result.action_key===key,'step receipt differs');
   operation.cleanupConfirmed=result.cleanup_complete===true;operation.nodeEffectPossible ||= result.effect_possible===true;
   const completed=await entry('node_step_completed',{outcome:result});need(JSON.stringify(completed?.outcome)===JSON.stringify(result),'outcome was not durably preserved');
   need(result.status==='SUCCEEDED'&&operation.cleanupConfirmed&&result.output?.verified===true,result.error?.message??'configuration did not complete');
   return result.output;
  }}).nodeApplyDriverFactory(options);
  return {...drivers,verifySource:async p=>verifyTextImportSource({source:p.source,settings:{source:{source_path:p.excel.source_path}}},options.verifiedUploads(),options.uploadHistory?.())};
 }};
}
