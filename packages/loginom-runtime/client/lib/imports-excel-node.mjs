import {createHash} from 'node:crypto';
import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {verifyFullImportCount,verifyImportSchema,verifyTextImportSource} from './text-import-node.mjs';
import {excelParametersSchema,validateExcelParameters} from './imports-excel-parameters.mjs';
import {makeExcelConfigureCode} from './imports-excel-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {resolveConfiguredOutputMapping} from './port-mapping-procedure.mjs';
import {openPreparedWizard} from './node-wizard-open.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
const need=(v,m)=>{if(!v)throw Error(m.startsWith('LOGINOM_')?m:'Excel import: '+m);};
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
 const m=mapped.value.native_mapping,preserved=finished.value.schema_after;
 need(m?.verified===true&&m.inventory_complete===true&&m.source_identity_verified===true
  &&m.mapping_wizard==='DataSetOutputSocketWizard'&&owner(m.node_context)
  &&m.node_context.output_port?.direction==='output'&&m.node_context.output_port.port===0
  &&mapped.value.source_identity_verified===true&&typeof m.autosync==='boolean'
  &&Array.isArray(m.source_fields)&&Array.isArray(m.target_fields)&&Array.isArray(c.columns)
  &&m.source_fields.length===c.columns.filter(f=>f.used).length&&(preserved||m.target_fields.length===c.columns.length),'output mapping owner or inventory differs');
 need(mapped.value.finish?.verified===true&&mapped.value.finish.cleanup_complete===true
  &&mapped.value.finish.settings_applied===true&&mapped.value.finish.mode==='done'&&owner(mapped.value.finish.node_context)
  &&finished.value.settings_applied===true&&['done','execute'].includes(finished.value.mode)&&owner(finished.value.node_context),'output mapping was not committed to this node');
 const linked=new Set(),fields=m.target_fields.map((f,index)=>{
  const source=f.source;
  need(f.index===index&&(preserved?typeof f.excluded==='boolean':f.excluded===false)&&f.inherited===false&&source&&typeof source.record_id==='string'
   &&!linked.has(source.record_id)&&m.source_fields.filter(s=>JSON.stringify(s)===JSON.stringify(source)).length===1
   &&['name','label','type','data_kind'].every(k=>typeof f[k]==='string'&&f[k]===(preserved?.mapping.target_fields[index]??c.columns[index])[k])
   &&typeof source.name==='string','output mapping fields or sources differ');
  linked.add(source.record_id);
  return {index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind,excluded:f.excluded,source_name:source.name};
 });
 need(linked.size===m.source_fields.length,'output source coverage differs');
 return {kind:'excel_import',scope:'observed_before_verified_finish',node,values_are:'observed_ui_values',source:c.source,auto_detect:c.auto_detect,columns:c.columns,
  receipt_ids:[configured,saved,mapped,finished].map(p=>p.receipt_id),output_mapping:{port:0,autosync:m.autosync,fields},package_persistence_verified:false};
}

// The selected worksheet and its row policies are backend scan facts.
export function verifyExcelFullCount(profileId,receipt,source,configuration,output,execution){
 const policy=receipt?.xlsx;
 const c=configuration.source;
 const selected=policy&&(c.sheet_method==='По имени'?c.sheet===policy.sheet_name:c.sheet_method==='По номеру'&&Number(c.sheet)===policy.sheet_index);
 if(!selected||policy.header_rows!==c.header_rows||policy.blank_rows!=='import'||c.blank_rows!=='Импортировать'||!c.whole_sheet)
  return {status:'not_verified',message:'N не сверено',reason:'Exact XLSX sheet/header/blank-row policy does not match the committed import',profile_id:profileId,actual_records:output.row_count};
 return verifyFullImportCount(profileId,receipt,source,output,execution);
}
export function excelSchemaSnapshot(configuration,mapping){
 need(configuration?.verified&&configuration.auto_detect==='Нет'&&configuration.columns?.length>0
  &&configuration.columns.length<=12&&mapping?.verified&&mapping.inventory_complete&&mapping.source_identity_verified,
  'LOGINOM_IMPORT_SCHEMA_CHANGED: complete Excel definitions and mapping required');
 const field=f=>Object.fromEntries(['field_id','index','name','label','type','data_kind','used','excluded','inherited'].filter(k=>Object.hasOwn(f,k)).map(k=>[k,f[k]]));
 return {auto_detect:configuration.auto_detect,header_rows:configuration.source.header_rows,whole_sheet:configuration.source.whole_sheet,
  blank_rows:configuration.source.blank_rows,columns:configuration.columns,
  mapping:{autosync:mapping.autosync,source_fields:mapping.source_fields.map(field),target_fields:mapping.target_fields.map(f=>({...field(f),source:field(f.source??{})}))}};
}
export function createExcelImportNodeSupport(config){
 const implementation={type:'imports.excel',mode:'xlsx',revision:'excel-import-v1',parameterSchema:excelParametersSchema,validate:validateExcelParameters,readback:excelReadback,
  configurationObservation:{condition:'owned Excel source wizard',ready:s=>s.wizard?.status==='observed'&&s.prepared_node_context?.surface==='wizard'},
  configureInputs:async()=>verified({not_applicable:true}),
 };
 return {nodeApplyHandlers:createTabularTransformNodeSupport(config,implementation).nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  const {operation,execute,onRecord,receiptOptions}=options;
  const request=operation.nodeApply?.request??operation.parameters,switching=request?.parameters?.source_switch;
  let channel,sourceReceipt,saveReceipt,beforeConfiguration,beforeMapping,schemaBefore,schemaAfter,committedConfiguration;
  const mapping=async()=> (await channel.observe({condition:'owned Excel output mapping',readMappings:true,
   ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true})).node_mapping;
  const configure=async(excel,flags={})=>{
   const step=operation.nodeStepSequence=(operation.nodeStepSequence??0)+1,id=operation.id+':n'+step,key='node.excel.configure.internal';
   const ctx={document_id:request.document_id,workflow_ref:request.workflow_ref,node:operation.nodeApply.node,deadline:operation.deadline};
   const action={verb:'excel_configure',excel,...flags},signature=createHash('sha256').update(JSON.stringify([id,action,ctx])).digest('hex');
   const entry=(phase,value)=>onRecord({operation_id:operation.id,action_key:'node.apply',action_revision:'1.0.0',phase,internal_provenance:'client_node_procedure_v1',step,internal_operation_id:id,...value});
   const prepared=await entry('node_step_prepared',{action,signature});
   need(prepared?.signature===signature&&JSON.stringify(prepared.action)===JSON.stringify(action),'step was not durably prepared');
   const code=makeExcelConfigureCode({...ctx,excel,...flags,origin:config.targetOrigin,build:config.targetBuild});
   const envelope=`async page=>{const r=await (${code})(page);return {status:r.verified?'SUCCEEDED':r.effect_possible?'AMBIGUOUS':'NOT_APPLIED',action_key:${JSON.stringify(key)},action_revision:'1',operation_id:${JSON.stringify(id)},phase:'configure',effect_possible:r.effect_possible,cleanup_complete:r.cleanup_complete,output:r,error:r.error?{code:'EXCEL_CONFIGURATION_UNCONFIRMED',message:r.error}:null,trace:[]}}`;
   let result;
   try{result=await execute(withBrowserReceipt(`(${envelope})(page)`,{...receiptOptions(id,key,signature),operation_id:id}),{timeout:Math.max(5000,ctx.deadline-Date.now()+5000)});}
   catch(error){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw error;}
   need(result.operation_id===id&&result.action_key===key,'step receipt differs');
   operation.cleanupConfirmed=result.cleanup_complete===true;operation.nodeEffectPossible ||= result.effect_possible===true;
   const completed=await entry('node_step_completed',{outcome:result});need(JSON.stringify(completed?.outcome)===JSON.stringify(result),'outcome was not durably preserved');
   need(result.status==='SUCCEEDED'&&operation.cleanupConfirmed&&result.output?.verified===true,result.error?.message??'configuration did not complete');
   return result.output;
  };
  const refuse=async(error,phase)=>{
   if(String(error.message).includes('LOGINOM_IMPORT_SCHEMA_CHANGED:')&&!operation.transportUncertain){
    const closed=await closePreparedWizard(channel);
    error.nodePhaseRefusal={phase,status:'FAILED',effect_possible:true,cleanup_complete:true,execution_started:false,
     verification:'excel_import_source_switch_schema_refused',proof:{closed}};
   }
   throw error;
  };
  const drivers=createTabularTransformNodeSupport(config,{...implementation,
   ...(switching?{
    async beforeOpen(c){channel=c;await channel.openOutputPort(0);beforeMapping=await mapping();await closePreparedWizard(channel);},
    async afterOpen(c){channel=c;beforeConfiguration=(await configure({}, {inspect:true})).configuration;
     schemaBefore=excelSchemaSnapshot(beforeConfiguration,beforeMapping);await closePreparedWizard(channel);await openPreparedWizard(channel);},
   }:{}),
   async configure(c,p){channel=c;try{
    const result=await configure(p.excel,switching?{preserve:true}:{});
    if(switching)verifyImportSchema(schemaBefore,excelSchemaSnapshot(result.configuration,beforeMapping));
    return result;
   }catch(error){return refuse(error,'configure');}},
   async configureOutput(c,configured){channel=c;const native=await mapping();
    if(switching){try{verifyImportSchema(schemaBefore,excelSchemaSnapshot(configured,native));}catch(error){return refuse(error,'output_mapping');}}
    else{
     resolveConfiguredOutputMapping({direction:'output',port:0},configured.columns,native);
     need(native.target_fields.length===configured.columns.length&&native.target_fields.every((f,i)=>!f.excluded&&f.source
      &&['name','label','type','data_kind'].every(k=>f[k]===configured.columns[i][k])),'output mapping differs from explicit Excel fields');
    }
    return verified({native_mapping:native,source_identity_verified:true});
   },
  }).nodeApplyDriverFactory(options);
  return {...drivers,
   async verifySource(p){
    sourceReceipt=verifyTextImportSource({source:p.source,settings:{source:{source_path:p.excel.source_path}}},p.source.kind==='storage'?[]:options.verifiedUploads(),p.source.kind==='storage'?undefined:options.uploadHistory?.(),
     p.source.kind==='storage'?await options.resolveStorageSource?.(p.source.server_source_ref):undefined);
    if(switching){need(typeof options.verifySourceSwitchSave==='function','Full source switch requires a verified package save');saveReceipt=options.verifySourceSwitchSave(switching.save_operation_id);}
    return sourceReceipt;
   },
   async finishGraph(mode,ctx){
    if(switching){
     await openPreparedWizard(channel);
     const committed=committedConfiguration=(await configure({}, {inspect:true})).configuration;
     need(committed.source.source_path===sourceReceipt.source.destination,'LOGINOM_FILE_CHANGED: committed full source differs');
     if(request.parameters.excel.sheet_name!==undefined)need(committed.source.sheet_method==='По имени'&&committed.source.sheet===request.parameters.excel.sheet_name,'LOGINOM_FILE_CHANGED: committed worksheet differs');
     await closePreparedWizard(channel);await channel.openOutputPort(0);
     schemaAfter=excelSchemaSnapshot(committed,await mapping());
     try{verifyImportSchema(schemaBefore,schemaAfter);}catch(error){return refuse(error,'finish');}
     await closePreparedWizard(channel);
    }
    const result=await drivers.finishGraph(mode,ctx);
    return {...result,...(switching?{reopen_performed:true,schema_before:schemaBefore,schema_after:schemaAfter}:{})};
   },
   async readOutput(read,ctx){
    const result=await drivers.readOutput(read,ctx);
    if(switching){const output=result.ports[0];
     try{output.full_import_verification={...verifyExcelFullCount(switching.profile_id,options.scanReceipt,sourceReceipt.source,
      committedConfiguration,output,
      operation.nodeApply.phases.find(p=>p.phase==='execute')?.value),source:sourceReceipt.source,saved_before_switch:saveReceipt,schema_before:schemaBefore,schema_after:schemaAfter};}
     catch(error){error.nodePhaseRefusal={phase:'read',status:'FAILED',effect_possible:true,cleanup_complete:true,verification:'excel_import_full_count_refused',
      execution_id:ctx.execution.execution_id,expected_records:options.scanReceipt?.records,actual_records:output.row_count,port:output.port,freshness_basis:output.freshness_basis};throw error;}
    }
    return result;
   },
  };
 }};
}
