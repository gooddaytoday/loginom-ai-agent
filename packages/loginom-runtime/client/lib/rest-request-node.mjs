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
import {applyNode,validateNodeApplyRequest,releaseNodeApply} from './node-apply.mjs';
import {prepareNodeTarget,releaseNodeTarget} from './node-target.mjs';
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
 const operation_id='rest-url-'+createHash('sha256').update(request.operation_id).digest('hex').slice(0,32);
 return {operation_id,
  contract_revision:request.contract_revision,document_id:request.document_id,workflow_ref:request.workflow_ref,
  // Repeated REST branches must not rename their generated nodes to one rendered label.
  target:{kind:'new',type:'programming.javascript',label:'URL query encoding '+operation_id.slice(9)},inputs:request.inputs,
  mode:'script',parameters:{schema_mode:'declared',columns:fields.map(name=>({name,label:name,type:'string',data_kind:'Дискретный',usage:'Не задано'})),
   source_text:'import {InputTable,OutputTable} from "builtIn/Data";\n'
    +'for(let row=0;row<InputTable.RowCount;row++){\n OutputTable.Append();\n for(const name of '+JSON.stringify(fields)+'){\n'
    +'  const value=InputTable.Get(row,name);\n  if(value!=null&&typeof value!=="string")throw Error("REST query values require raw string fields");\n  OutputTable.Set(name,value==null?null:encodeURIComponent(value));\n }\n}\n'},
  mappings:[],finish:'execute',read:{ports:[],sample_rows:0,require_exact_numbers:false},
  budgets:{configure_ms:budget,execute_ms:budget,total_ms:budget}};
}

async function prepareQueryEncoder(options,ctx,config){
 const request=restQueryEncoderRequest(options.operation.parameters,ctx.deadline,options.now());
 const adapter=options.operation.nodeTargetAdapter,parent=options.operation.parameters.target;
 const operation={id:request.operation_id,parameters:request,action:options.operation.action,
  deadline:ctx.deadline,nodeTargetAdapter:{...adapter,
   choosePosition:(value,graph,deadline,signal)=>parent.kind==='new'
    ?adapter.choosePosition(value,graph,deadline,signal,parent.position?[parent.position]:[])
    :adapter.choosePosition(value,graph,deadline,signal)}};
 const support=createJavascriptCodeNodeSupport({...config,redactor:config.redactor??createRedactor()});
 const drivers=support.nodeApplyDriverFactory({...options,operation});
 const child={operation,drivers,handlers:support.nodeApplyHandlers,result:null};
 options.operation.restQueryEncoder=child;
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
 child.result=result;
 options.operation.nodeEffectPossible ||= result.effect_possible===true;
 if(operation.transportUncertain||result.cleanup_complete!==true){options.operation.transportUncertain ||= operation.transportUncertain===true;options.operation.cleanupConfirmed=false;}
 need(result.status==='SUCCEEDED'&&result.cleanup_complete===true&&result.execution.status==='completed','query encoder did not complete');
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
 const implementation={type:'integration.rest_request',mode:'request',revision:'rest-request-get-v2',parameterSchema:restRequestParametersSchema,validate:validateRestRequestParameters,readback:restRequestReadback,keepExecutionConsoleOpen:true,
  configurationObservation:{condition:'owned REST wizard',ready:s=>s.wizard?.status==='observed'&&s.prepared_node_context?.surface==='wizard'},
  configureAllOutputs:async()=>({verified:true,cleanup_complete:true,effect_possible:false,not_applicable:true,native_output_definitions_preserved:true}),readOutputs:readRestOutputs};
 return {nodeApplyHandlers:createTabularTransformNodeSupport(config,implementation).nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  let connection=null;
  const request=options.operation.parameters;
  const drivers=createTabularTransformNodeSupport(config,{...implementation,
   preflight:async(options,ctx)=>{
    if(!request.parameters.connection)return {verified:true,cleanup_complete:true,effect_possible:false,not_applicable:true};
    let existingInput=null;
    if(request.target.kind==='existing'&&request.inputs.length){
     const graph=await options.operation.nodeTargetAdapter.observe({document_id:request.document_id,workflow_ref:request.workflow_ref},ctx.deadline,ctx.signal);
     need(graph.complete===true&&graph.document_id===request.document_id&&JSON.stringify(graph.workflow_ref)===JSON.stringify(request.workflow_ref),'complete owned graph is required before query encoding');
     const target=graph.nodes.filter(n=>n.ref.node_id===request.target.ref.node_id);
     need(target.length===1&&target[0].type==='integration.rest_request'&&['document_id','workflow_id','node_id'].every(k=>target[0].ref[k]===request.target.ref[k]),'existing REST identity differs');
     const links=graph.links.filter(link=>link.target===request.target.ref.node_id&&link.input===0);
     need(links.length<=1,'input 0 is ambiguous');
     existingInput=links[0]??null;
     if(existingInput&&(existingInput.source!==request.inputs[0].source.node_id||existingInput.output!==request.inputs[0].output)){
      const error=Error('REST request: input 0 is connected to a different raw source or output; no encoder or connection was created. next_step: dock_node_apply with a NEW operation_id and a NEW integration.rest_request target, the requested raw inputs, the same connection/query_parameters and finish:"execute". The existing REST and its input are preserved.');
      error.nodePhaseRefusal={phase:'target',status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true};
      throw error;
     }
    }
    // Loginom 7.4.2 concatenates raw query values before parsing the URL.
    // Prepare values through the existing JS lifecycle, rather than requiring
    // the model to author a codec or changing the caller's source table.
    const target_inputs=request.inputs.length?[await prepareQueryEncoder(options,ctx,config)]:null;
    if(existingInput)options.operation.restQueryInput={edge:existingInput,encoder:target_inputs[0].source};
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
  return {...drivers,async releaseBeforeTarget({signal,deadline}){
   const child=options.operation.restQueryEncoder;
   if(!child||child.result?.status==='SUCCEEDED'||options.operation.preTargetGraph)return;
   const original=child.operation,childRequest=original.parameters;
   need(!options.operation.targetPhase&&options.operation.nodeApply?.pending?.phase==='target'
    &&original.id===restQueryEncoderRequest(request,deadline,options.now()).operation_id
    &&childRequest.document_id===request.document_id
    &&JSON.stringify(childRequest.workflow_ref)===JSON.stringify(request.workflow_ref)
    &&childRequest.target.kind==='new'&&childRequest.target.type==='programming.javascript',
    'query encoder release owner differs');
   need(!original.transportUncertain,'query encoder transport remains uncertain');
   const result=original.nodeApply?.result??(child.result?.cleanup_complete===true&&child.result.pending_phase===null?child.result:null)??await releaseNodeApply({operation:original,
    handlers:child.handlers,drivers:child.drivers,record:options.onRecord,signal,
    releaseBeforeTarget:()=>releaseNodeTarget({operation:original,adapter:original.nodeTargetAdapter,
     record:options.onRecord,readReceipt:options.readReceipt,deadline,signal,now:options.now})});
   need(result.cleanup_complete===true&&result.pending_phase===null,'query encoder release remains unresolved');
   const graph=await options.operation.nodeTargetAdapter.observe({document_id:request.document_id,
    workflow_ref:request.workflow_ref},deadline,signal);
   need(graph.complete===true&&graph.document_id===request.document_id
    &&JSON.stringify(graph.workflow_ref)===JSON.stringify(request.workflow_ref),'query encoder release graph differs');
   need(!child.releaseGraph||JSON.stringify(child.releaseGraph)===JSON.stringify(graph),
    'query encoder release graph changed before checkpoint acknowledgement');
   child.releaseGraph??=structuredClone(graph);
   const event={operation_id:options.operation.id,phase:'rest_query_encoder_released',
    child_operation_id:original.id,result,graph};
   const saved=await options.onRecord(structuredClone(event));
   need(JSON.stringify(Object.fromEntries(Object.keys(event).map(k=>[k,saved?.[k]])))===JSON.stringify(event),
    'query encoder release journal acknowledgement differs');
   options.operation.preTargetGraph=structuredClone(graph);
   options.operation.preTargetWarnings=result.node?['The incomplete URL query encoder '+JSON.stringify(result.node)
    +' remains in the graph. Its settings and execution are unverified; release did not delete or execute it.']:[];
   options.operation.cleanupConfirmed=true;
  }};
 }};
}
