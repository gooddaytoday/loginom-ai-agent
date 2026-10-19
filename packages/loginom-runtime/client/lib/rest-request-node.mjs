import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateRestRequestParameters,restRequestParametersSchema} from './rest-request-parameters.mjs';
import {makeRestConnectionCode} from './rest-connection.mjs';
import {makeRestRequestCode,makeRestLinkCode} from './rest-request.mjs';
import {runRestStep} from './rest-step.mjs';
import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput} from './table-output-values.mjs';
import {createJavascriptCodeNodeSupport} from './javascript-code-node.mjs';
import {createRedactor} from './redact.mjs';
import {applyNode,validateNodeApplyRequest} from './node-apply.mjs';
import {prepareNodeTarget} from './node-target.mjs';
import {createHash} from 'node:crypto';

const need=(v,m)=>{if(!v)throw Error('REST request: '+m);};
const outputs=[
 [['RequestID','Идентификатор запроса','integer'],['Response','Ответ сервера','string']],
 [['RequestID','Идентификатор запроса','integer'],['ErrorCode','Код завершения','integer'],['ErrorDesc','Описание ошибки','string'],['HttpStatusCode','Код состояния HTTP','integer']],
].map(port=>port.map(([name,label,type])=>({name,label,type,data_kind:type==='string'?'Дискретный':'Непрерывный'})));
export function restRequestReadback({node,phases,operation_id}){
 const configured=phases.find(p=>p.phase==='configure'),saved=phases.find(p=>p.phase==='node_finish');
 const c=configured?.value?.configuration;
 need(configured?.status==='verified'&&c?.verified&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration readback owner differs');
 need(saved?.status==='verified'&&saved.value?.settings_applied===true&&saved.value.mode==='done'&&['document_id','workflow_id','node_id'].every(k=>saved.value.node_context?.[k]===node[k]),'node settings were not committed to this node');
 return {kind:'rest_request',scope:'observed_before_verified_finish',node,values_are:'observed_ui_values',method:'GET',
  connection:c.connection??null,query_parameters:c.query_parameters,receipt_ids:[configured,saved].map(p=>{need(p.receipt_id===operation_id+':'+p.phase,'readback phase differs');return p.receipt_id;}),package_persistence_verified:false};
}

export function restQueryEncoderRequest(request,deadline,now=Date.now()){
 const fields=[...new Set(request.parameters.query_parameters.map(q=>q.field))];
 need(request.inputs.length===1,'raw query values require one explicit table input');
 const budget=Math.min(request.budgets.total_ms,deadline-now);
 need(budget>0,'query encoding deadline elapsed');
 return {operation_id:'rest-url-'+createHash('sha256').update(request.operation_id).digest('hex').slice(0,32),
  contract_revision:request.contract_revision,document_id:request.document_id,workflow_ref:request.workflow_ref,
  target:{kind:'new',type:'programming.javascript',label:'URL query encoding'},inputs:request.inputs,
  mode:'script',parameters:{schema_mode:'declared',columns:fields.map(name=>({name,label:name,type:'string',data_kind:'Дискретный',usage:'Не задано'})),
   source_text:'import {InputTable,OutputTable} from "builtIn/Data";\n'
    +'for(let row=0;row<InputTable.RowCount;row++){\n OutputTable.Append();\n for(const name of '+JSON.stringify(fields)+'){\n'
    +'  const value=InputTable.Get(row,name);\n  if(value!=null&&typeof value!=="string")throw Error("REST query values require raw string fields");\n  OutputTable.Set(name,value==null?null:encodeURIComponent(value));\n }\n}\n'},
  mappings:[],finish:'execute',read:{ports:[],sample_rows:0,require_exact_numbers:false},
  budgets:{configure_ms:budget,execute_ms:budget,total_ms:budget}};
}

async function prepareQueryEncoder(options,ctx,config){
 const request=restQueryEncoderRequest(options.operation.parameters,ctx.deadline,options.now());
 const operation={id:request.operation_id,parameters:request,action:options.operation.action,
  deadline:ctx.deadline,nodeTargetAdapter:options.operation.nodeTargetAdapter};
 const redactor=config.redactor??createRedactor();
 const support=createJavascriptCodeNodeSupport({...config,redactor});
 const drivers=support.nodeApplyDriverFactory({...options,operation});
 const {graph}=validateNodeApplyRequest(request,support.nodeApplyHandlers);
 const result=await applyNode({request,operation,handlers:support.nodeApplyHandlers,
  drivers:{...drivers,
   activateWorkflow:phase=>operation.nodeTargetAdapter.activateWorkflow({document_id:request.document_id,workflow_ref:request.workflow_ref},phase),
   prepareTarget:async(_,phase)=>{
    await drivers.beforeTarget(phase);
    const target=await prepareNodeTarget({request:graph,operation,adapter:operation.nodeTargetAdapter,record:options.onRecord,signal:phase.signal,now:options.now});
    need(target.status==='SUCCEEDED',target.error??'query encoder target was not created');
    return {verified:true,cleanup_complete:true,effect_possible:true,node:target.node.ref,target};
   }},record:options.onRecord,signal:ctx.signal,stopSignal:ctx.stopSignal,now:options.now});
 options.operation.nodeEffectPossible ||= result.effect_possible===true;
 if(operation.transportUncertain||result.cleanup_complete!==true){options.operation.transportUncertain ||= operation.transportUncertain===true;options.operation.cleanupConfirmed=false;}
 if(result.status!=='SUCCEEDED'||result.cleanup_complete!==true||result.execution.status!=='completed'){
  const cause=result.error?.cause??result.error;
  const message=typeof cause?.message==='string'?redactor.text(cause.message):null;
  const error=Error('REST request: query encoder did not complete at '+(result.pending_phase??result.execution.status)
   +(message?': '+message:''));
  if(typeof cause?.code==='string'&&message)error.receipt={error:{code:cause.code,message}};
  throw error;
 }
 return {source:result.node,output:0,input:0};
}
async function readRestOutputs(channel,read,ctx){
 const ports=[],evidence=[];
 for(const port of read.ports){
  const table=await openNewOutputTable(channel,port),formatProof=read.require_exact_numbers?await configureTablePrecision(channel,table.table):null;
  let data,settings,restoration;
  try{
   settings=await prepareTableRead(channel,table.table);
   const raw=await readTableOutputPages(channel,table.table,{sampleRows:read.sample_rows});
   data=decodeTableOutput(raw,{formatProof,readSettings:settings,expectedColumns:outputs[port],requireExactNumbers:read.require_exact_numbers});
  }finally{if(formatProof)restoration=await restoreTablePrecision(channel,formatProof);}
  const returned=await returnFromOutputTable(channel,table.table);
  ports.push({port,port_guid:table.port_guid,fresh:true,execution_id:ctx.execution.execution_id,...data});
  evidence.push({port,table_creation:table,format_proof:formatProof,format_restoration:restoration,read_settings:settings,workflow_return:returned});
 }
 return {verified:true,cleanup_complete:true,effect_possible:true,status:ports.every(p=>p.sample_complete)?'complete':'partial',execution_id:ctx.execution.execution_id,evidence_ref:ctx.receipt_id,ports,port_evidence:evidence};
}
export function createRestRequestNodeSupport(config){
 const implementation={type:'integration.rest_request',mode:'request',revision:'rest-request-get-v2',parameterSchema:restRequestParametersSchema,validate:validateRestRequestParameters,readback:restRequestReadback,
  configurationObservation:{condition:'owned REST wizard',ready:s=>s.wizard?.status==='observed'&&s.prepared_node_context?.surface==='wizard'},
  configureAllOutputs:async()=>({verified:true,cleanup_complete:true,effect_possible:false,not_applicable:true,native_output_definitions_preserved:true}),readOutputs:readRestOutputs};
 return {nodeApplyHandlers:createTabularTransformNodeSupport(config,implementation).nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  let connection=null;
  const request=options.operation.parameters;
  return createTabularTransformNodeSupport(config,{...implementation,
   preflight:async(options,ctx)=>{
    if(!request.parameters.connection)return {verified:true,cleanup_complete:true,effect_possible:false,not_applicable:true};
    if(request.target.kind==='existing'&&request.inputs.length){
     const graph=await options.operation.nodeTargetAdapter.observe({document_id:request.document_id,workflow_ref:request.workflow_ref},ctx.deadline,ctx.signal);
     need(graph.complete===true&&graph.document_id===request.document_id&&graph.workflow_ref.workflow_id===request.workflow_ref.workflow_id,'complete owned graph is required before query encoding');
     if(graph.links.some(link=>link.target===request.target.ref.node_id&&link.input===0)){
      const error=Error('REST request: input 0 is already connected; no encoder or connection was created. next_step: dock_node_apply with a NEW operation_id, target:'+JSON.stringify(request.target)
       +', inputs:[], parameters:{}, finish:"done". This preserves the existing input and saved bindings; inspect them before execution.');
      error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};
      throw error;
     }
    }
    // Loginom 7.4.2 concatenates raw query values before parsing the URL.
    // Prepare values through the existing JS lifecycle, rather than requiring
    // the model to author a codec or changing the caller's source table.
    const target_inputs=request.inputs.length?[await prepareQueryEncoder(options,ctx,config)]:null;
    const result=await runRestStep(options,{...ctx,document_id:request.document_id,workflow_ref:request.workflow_ref},'connection',makeRestConnectionCode,request.parameters,config);
    connection=result.connection;return {...result,...(target_inputs?{target_inputs}:{})};
   },
   beforeInput:async(options,ctx)=>{
    if(!connection)return;
    const graph=await options.operation.nodeTargetAdapter.observe({document_id:ctx.document_id,workflow_ref:ctx.workflow_ref},ctx.deadline,ctx.signal);
    need(graph.complete,'complete graph is required for the service link');
    await runRestStep(options,ctx,'link',makeRestLinkCode,{connection,dom_epoch:graph.dom_epoch},config);
   },
   configure:async(channel,p,{request})=>{
    const ctx={document_id:request.document_id,workflow_ref:request.workflow_ref,node:options.operation.nodeApply.node,deadline:options.operation.deadline};
    const result=await runRestStep(options,ctx,'configure',makeRestRequestCode,p,config);
    return {...result,configuration:{...result.configuration,connection}};
   },
  }).nodeApplyDriverFactory(options);
 }};
}
