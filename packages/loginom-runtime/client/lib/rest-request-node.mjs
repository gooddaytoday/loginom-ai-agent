import {createTabularTransformNodeSupport} from './calculator-node.mjs';
import {validateRestRequestParameters,restRequestParametersSchema} from './rest-request-parameters.mjs';
import {makeRestConnectionCode} from './rest-connection.mjs';
import {makeRestRequestCode,makeRestLinkCode} from './rest-request.mjs';
import {runRestStep} from './rest-step.mjs';
import {openNewOutputTable,configureTablePrecision,restoreTablePrecision,prepareTableRead,returnFromOutputTable} from './node-output-procedure.mjs';
import {readTableOutputPages} from './table-output-pages.mjs';
import {decodeTableOutput} from './table-output-values.mjs';

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
 const implementation={type:'integration.rest_request',mode:'request',revision:'rest-request-get-v1',parameterSchema:restRequestParametersSchema,validate:validateRestRequestParameters,readback:restRequestReadback,
  configurationObservation:{condition:'owned REST wizard',ready:s=>s.wizard?.status==='observed'&&s.prepared_node_context?.surface==='wizard'},
  configureAllOutputs:async()=>({verified:true,cleanup_complete:true,effect_possible:false,not_applicable:true,native_output_definitions_preserved:true}),readOutputs:readRestOutputs};
 return {nodeApplyHandlers:createTabularTransformNodeSupport(config,implementation).nodeApplyHandlers,nodeApplyDriverFactory:options=>{
  let connection=null;
  const request=options.operation.parameters;
  return createTabularTransformNodeSupport(config,{...implementation,
   preflight:async(options,ctx)=>{
    if(!request.parameters.connection)return {verified:true,cleanup_complete:true,effect_possible:false,not_applicable:true};
    const result=await runRestStep(options,{...ctx,document_id:request.document_id,workflow_ref:request.workflow_ref},'connection',makeRestConnectionCode,request.parameters,config);
    connection=result.connection;return result;
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
