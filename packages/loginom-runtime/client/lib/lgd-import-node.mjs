import {createHash} from 'node:crypto';
import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {verifyTextImportSource} from './text-import-node.mjs';
import {lgdImportParametersSchema,validateLgdImportParameters} from './lgd-parameters.mjs';
import {makeLgdImportConfigureCode} from './lgd-import-procedure.mjs';
import {withBrowserReceipt} from './executor.mjs';
import {closePreparedWizard} from './node-wizard-close.mjs';
const need=(v,m)=>{if(!v)throw Error('LGD import: '+m);};
const verified=v=>({verified:true,cleanup_complete:true,effect_possible:false,...v});
export function verifyLgdOutputMapping(m){
 need(m.inventory_complete&&m.source_identity_verified&&m.source_fields.length>0&&m.source_fields.length===m.target_fields.length
  &&m.target_fields.every((f,i)=>f.index===i&&['integer','real','string','boolean','datetime'].includes(f.type)
   &&['Дискретный','Непрерывный'].includes(f.data_kind)&&!f.excluded&&f.source
   &&JSON.stringify(f.source)===JSON.stringify(m.source_fields[i])
   &&['name','label','type'].every(k=>f[k]===m.source_fields[i][k])),'native LGD output properties changed');
 return m;
}
export function lgdImportReadback({node,phases,operation_id}){
 const phase=name=>{const p=phases.filter(p=>p.phase===name);need(p.length===1&&p[0].status==='verified'&&p[0].receipt_id===operation_id+':'+name&&p[0].value?.verified===true&&p[0].value.cleanup_complete===true,'verified '+name+' required');return p[0];};
 const configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration,m=mapped.value.native_mapping;
 need(c?.verified&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k])
  &&saved.value.settings_applied===true&&saved.value.mode==='done'&&m?.verified&&m.inventory_complete&&m.source_identity_verified
  &&m.target_fields.length>0&&mapped.value.finish?.verified,'configuration, mapping and commit chain required');
 return {kind:'lgd_import',scope:'observed_before_verified_finish',node,values_are:'observed_ui_values',source:c.source,
  output_mapping:{port:0,autosync:m.autosync,fields:m.target_fields.map(f=>({index:f.index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind,source_name:f.source.name}))},
  receipt_ids:[configured,saved,mapped,finished].map(p=>p.receipt_id),package_persistence_verified:false};
}
export function createLgdImportNodeSupport(config){
 const definition={type:'imports.lgd',mode:'native',revision:'lgd-import-v1',parameterSchema:lgdImportParametersSchema,validate:validateLgdImportParameters,
  readback:lgdImportReadback,configurationObservation:{condition:'owned LGD source',ready:s=>s.wizard?.stage==='lgd_import'},
  configureInputs:async()=>verified({not_applicable:true})};
 return {nodeApplyHandlers:createTabularTransformNodeSupport(config,definition).nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  const {operation,onRecord,execute,receiptOptions}=options;let source,variables=[];
  const drivers=createTabularTransformNodeSupport(config,{...definition,
   async beforeOpen(channel,request){
    const graph=await operation.nodeTargetAdapter.observe({document_id:request.document_id,workflow_ref:request.workflow_ref},operation.deadline);
    need(graph.complete===true,'complete LGD variable graph required');
    if(![...graph.links,...graph.variable_links??[]].some(e=>e.kind==='variables'&&e.target===operation.nodeApply.node.node_id))return;
    const existing=operation.nodeApply.phases.find(p=>p.phase==='input_mapping')?.value?.variable_mappings;
    const mapped=existing?.find(m=>m.kind==='variables'&&m.port===0);
    const observed=mapped??(await channel.mapVariablePort({direction:'input',kind:'variables',port:0})).mapping;
    need(observed?.kind==='variables'&&observed.port===0,'verified LGD input variables required');
    variables=observed.fields.filter(v=>v.type===5&&!v.is_null&&typeof v.value==='string'&&v.source?.type===5);
   },
   async configure(channel,p){
    const step=operation.nodeStepSequence=(operation.nodeStepSequence??0)+1,id=operation.id+':n'+step,key='node.lgd_import.configure.internal';
    const task={document_id:operation.nodeApply.request.document_id,workflow_ref:operation.nodeApply.request.workflow_ref,node:operation.nodeApply.node,
     deadline:operation.deadline,origin:config.targetOrigin,build:config.targetBuild,source_path:source?.source?.destination,checksum:p.lgd_import?.checksum,
     source_binding:p.lgd_import?.bindings?.source_path?.variable,variables};
    const signature=createHash('sha256').update(JSON.stringify(task)).digest('hex');
    const entry=(phase,value)=>onRecord({operation_id:operation.id,action_key:'node.apply',action_revision:'1.0.0',phase,internal_provenance:'client_node_procedure_v1',step,internal_operation_id:id,...value});
    const action={verb:'lgd_import_configure',source_path:task.source_path,checksum:task.checksum,source_binding:task.source_binding};
    const ack=await entry('node_step_prepared',{action,signature});need(ack?.signature===signature&&JSON.stringify(ack.action)===JSON.stringify(action),'durable preparation differs');
    const code=makeLgdImportConfigureCode(task);
    const envelope=`async page=>{const r=await (${code})(page);return {status:r.verified?'SUCCEEDED':r.effect_possible?'FAILED':'NOT_APPLIED',action_key:${JSON.stringify(key)},action_revision:'1',operation_id:${JSON.stringify(id)},phase:'configure',effect_possible:r.effect_possible,cleanup_complete:r.cleanup_complete,output:r,error:r.error?{code:'LGD_CONFIGURATION_REFUSED',message:r.error}:null,trace:[]}}`;
    let result;try{result=await execute(withBrowserReceipt('('+envelope+')(page)',{...receiptOptions(id,key,signature),operation_id:id}),{timeout:Math.max(5000,task.deadline-Date.now()+5000)});}
    catch(error){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw error;}
    need(result.operation_id===id&&result.action_key===key,'receipt identity differs');
    operation.cleanupConfirmed=result.cleanup_complete===true;operation.nodeEffectPossible ||= result.effect_possible===true;
    const completed=await entry('node_step_completed',{outcome:result});need(JSON.stringify(completed?.outcome)===JSON.stringify(result),'durable result differs');
    if(!result.output?.verified){
     const closed=await closePreparedWizard(channel);operation.cleanupConfirmed=closed.cleanup_complete===true;
     const error=Error(result.error?.message??'LGD configuration refused');
     error.nodePhaseRefusal={phase:'configure',status:'FAILED',effect_possible:true,cleanup_complete:closed.cleanup_complete,settings_unchanged:true,execution_started:false,verification:'lgd_import_native_refused',proof:{closed}};throw error;
    }
    return result.output;
   },
   async configureOutput(channel){
    const s=await channel.observe({condition:'LGD complete output mapping',readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
    const m=verifyLgdOutputMapping(s.node_mapping);
    return verified({native_mapping:m,source_identity_verified:true});
   },
  }).nodeApplyDriverFactory(options);
  return {...drivers,async verifySource(p){
   if(!p.source)return verified({not_applicable:true,source_kind:'saved_lgd_source'});
   const proof=p.source.kind==='storage'?await options.resolveStorageSource?.(p.source.server_source_ref):undefined;
   source=verifyTextImportSource({source:p.source,settings:proof?{source:{source_path:proof.destination}}:{}},options.verifiedUploads(),options.uploadHistory?.(),proof);
   need(/\.lgd$/i.test(source.source.destination),'verified standalone .lgd required');return source;
  }};
 }};
}
