import {createHash} from 'node:crypto';
import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {databaseImportParametersSchema,validateDatabaseImportParameters} from './imports-database-parameters.mjs';
import {makeDatabaseConnectionCode} from './imports-database-connection.mjs';
import {makeDatabaseImportConfigureCode} from './imports-database-procedure.mjs';
import {makeRestLinkCode} from './rest-request.mjs';
import {withBrowserReceipt} from './executor.mjs';
const need=(v,m)=>{if(!v)throw Error('Database import: '+m);};
const verified=v=>({verified:true,cleanup_complete:true,effect_possible:false,...v});
const TYPES=['integer','real','string','boolean','datetime'];

// Same private node-step journal and browser receipt as the REST connection:
// an unknown reply leaves the node phase pending and is never repeated.
async function runDatabaseStep(options,ctx,kind,makeCode,parameters,config){
 const {operation,execute,onRecord,receiptOptions}=options;
 ctx.signal?.throwIfAborted();
 const step=operation.nodeStepSequence=(operation.nodeStepSequence??0)+1;
 const id=operation.id+':n'+step,key='node.database.'+kind+'.internal',action={verb:'database_'+kind,...parameters};
 const signature=createHash('sha256').update(JSON.stringify([id,action,ctx.document_id,ctx.workflow_ref,ctx.node??null])).digest('hex');
 const entry=(phase,value)=>onRecord({operation_id:operation.id,action_key:'node.apply',action_revision:'1.0.0',phase,internal_provenance:'client_node_procedure_v1',step,internal_operation_id:id,...value});
 const prepared=await entry('node_step_prepared',{action,signature});
 need(prepared?.signature===signature&&JSON.stringify(prepared.action)===JSON.stringify(action),'step was not durably prepared');
 const code=makeCode({...parameters,document_id:ctx.document_id,workflow_ref:ctx.workflow_ref,node:ctx.node??null,origin:config.targetOrigin,build:config.targetBuild,deadline:ctx.deadline});
 const envelope=`async page=>{const r=await (${code})(page);return {status:r.verified?'SUCCEEDED':r.effect_possible?'AMBIGUOUS':'NOT_APPLIED',action_key:${JSON.stringify(key)},action_revision:'1',operation_id:${JSON.stringify(id)},phase:${JSON.stringify(kind)},effect_possible:r.effect_possible,cleanup_complete:r.cleanup_complete,output:r,error:r.error?{code:'DATABASE_STEP_UNCONFIRMED',message:r.error}:null,trace:[]}}`;
 let result;
 try{result=await execute(withBrowserReceipt(`(${envelope})(page)`,{...receiptOptions(id,key,signature),operation_id:id}),{timeout:Math.max(5000,ctx.deadline-Date.now()+5000)});}
 catch(error){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw error;}
 if(result.operation_id!==id||result.action_key!==key){operation.transportUncertain=true;operation.cleanupConfirmed=false;throw Error('Database import: step receipt differs');}
 operation.cleanupConfirmed=result.cleanup_complete===true;operation.nodeEffectPossible ||= result.effect_possible===true;
 const checkpoint=kind==='connection'?result.output?.pre_target_checkpoint:null;
 if(checkpoint)operation.cleanupConfirmed=false;
 const completed=await entry('node_step_completed',{outcome:result});
 need(JSON.stringify(completed?.outcome)===JSON.stringify(result),'step outcome was not durably preserved');
 if(checkpoint&&!operation.targetPhase&&!operation.nodeApply?.node&&operation.nodeApply?.pending?.phase==='target'
   &&result.cleanup_complete===true&&checkpoint.graph?.complete===true&&checkpoint.graph.interaction_ready===true
   &&checkpoint.graph.document_id===ctx.document_id&&JSON.stringify(checkpoint.graph.workflow_ref)===JSON.stringify(ctx.workflow_ref)
   &&checkpoint.connection?.name===parameters.connection?.name){
  operation.preTargetGraph=structuredClone(checkpoint.graph);
  operation.preTargetWarnings=['The tested SQLite connection '+JSON.stringify(checkpoint.connection.name)
   +' remains in the module. Its graph reference and the import node were not created.'];
  operation.cleanupConfirmed=true;operation.nodeApply.cleanup_complete=true;
 }
 if(result.status!=='SUCCEEDED'||!operation.cleanupConfirmed||result.output?.verified!==true)
  throw Error(result.error?.message??'Database import: '+kind+' did not confirm completion');
 return result.output;
}
export function verifyDatabaseOutputMapping(m){
 need(m?.verified&&m.inventory_complete&&m.source_identity_verified&&m.source_fields.length>0&&m.source_fields.length===m.target_fields.length
  &&m.target_fields.every((f,i)=>f.index===i&&TYPES.includes(f.type)&&['Дискретный','Непрерывный'].includes(f.data_kind)&&!f.excluded&&f.source
   &&JSON.stringify(f.source)===JSON.stringify(m.source_fields[i])&&['name','label','type'].every(k=>f[k]===m.source_fields[i][k])),
  'native output fields differ from the database result set');
 return m;
}
export function databaseImportReadback({node,phases,operation_id}){
 const phase=name=>{const p=phases.filter(p=>p.phase===name);need(p.length===1&&p[0].status==='verified'&&p[0].receipt_id===operation_id+':'+name&&p[0].value?.verified===true&&p[0].value.cleanup_complete===true,'verified '+name+' required');return p[0];};
 const configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration,m=mapped.value.native_mapping;
 need(c?.verified&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k])
  &&saved.value.settings_applied===true&&saved.value.mode==='done'&&m?.verified&&m.inventory_complete&&m.source_identity_verified
  &&m.target_fields.length>0&&mapped.value.finish?.verified,'configuration, mapping and commit chain of this node required');
 return {kind:'database_import',scope:'observed_before_verified_finish',node,values_are:'observed_ui_values',mode:c.mode,
  ...(c.mode==='sql'?{sql:c.sql}:{table:c.table}),database_path:c.database_path,connection:c.connection??null,
  output_mapping:{port:0,autosync:m.autosync,fields:m.target_fields.map(f=>({index:f.index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind,source_name:f.source.name}))},
  receipt_ids:[configured,saved,mapped,finished].map(p=>p.receipt_id),package_persistence_verified:false};
}
export function createDatabaseImportNodeSupport(config){
 const definition={type:'imports.database',modes:['table','sql'],revision:'database-import-sqlite-v1',parameterSchema:databaseImportParametersSchema,
  validate:validateDatabaseImportParameters,readback:databaseImportReadback,
  configurationObservation:{condition:'owned database import wizard',ready:s=>s.wizard?.status==='observed'&&s.prepared_node_context?.surface==='wizard'},
  configureInputs:async()=>verified({not_applicable:true})};
 return {nodeApplyHandlers:createTabularTransformNodeSupport(config,definition).nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  const request=options.operation.parameters;let connection=null;
  const linkConnection=async ctx=>{
   if(!connection)return null;
   const graph=await options.operation.nodeTargetAdapter.observe({document_id:ctx.document_id,workflow_ref:ctx.workflow_ref},ctx.deadline,ctx.signal);
   need(graph.complete,'complete graph is required for the connection link');
   return runDatabaseStep(options,ctx,'link',makeRestLinkCode,{connection,dom_epoch:graph.dom_epoch},config);
  };
  return createTabularTransformNodeSupport(config,{...definition,
   preflight:async(options,ctx)=>{
    const path=request.parameters?.database?.database_path;
    if(!path)return verified({not_applicable:true});
    const result=await runDatabaseStep(options,{...ctx,document_id:request.document_id,workflow_ref:request.workflow_ref},'connection',makeDatabaseConnectionCode,
     {connection:{name:path,database_path:path},...(request.target.kind==='existing'?{existing_target:request.target.ref}:{})},config);
    need(result.connection?.database_path===path&&result.connection.connection_test==='passed'&&typeof result.connection.reference_node_id==='string','connection readback differs');
    connection={name:path,database_path:path,reference_node_id:result.connection.reference_node_id};
    return result;
   },
   beforeInput:(_,ctx)=>linkConnection(ctx),
   configure:async(channel,p,{request})=>{
    const ctx={document_id:request.document_id,workflow_ref:request.workflow_ref,node:options.operation.nodeApply.node,deadline:options.operation.deadline};
    const d=p.database;
    const result=await runDatabaseStep(options,ctx,'configure',makeDatabaseImportConfigureCode,
     d?{database_path:d.database_path,mode:request.mode,...(request.mode==='sql'?{sql:d.sql}:{table:d.table})}:{database_path:null},config);
    need(!d||result.configuration.database_path===d.database_path&&result.configuration.mode===request.mode,'configured source differs');
    return {...result,configuration:{...result.configuration,connection:connection&&{database_path:connection.database_path,reference_node_id:connection.reference_node_id}}};
   },
   configureOutput:async channel=>{
    const s=await channel.observe({condition:'database import output mapping',readMappings:true,ready:s=>s.wizard?.stage==='output_mapping'&&s.node_mapping?.verified===true});
    return verified({native_mapping:verifyDatabaseOutputMapping(s.node_mapping),source_identity_verified:true});
   },
  }).nodeApplyDriverFactory(options);
 }};
}
