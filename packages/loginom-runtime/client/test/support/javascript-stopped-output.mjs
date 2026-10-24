// Exercise the real JS driver across its lifecycle, with isolated native seams.
import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {createRedactor} from '../../lib/redact.mjs';
import {javascriptSourceIdentity} from '../../lib/javascript-source-read.mjs';
import {NodeProcedureStepError} from '../../lib/node-procedure.mjs';

const fault=process.argv[2];
const calls=[],node={document_id:'doc',workflow_id:'flow',node_id:'js'};
const workflow={workflow_id:'flow',prefix:'MF;TF-1',tab_tid:'tab'};
const source='import {OutputTable} from "builtIn/Data";\n';
const identity=javascriptSourceIdentity(source),settings={generation:true};
const primary=new NodeProcedureStepError({status:'AMBIGUOUS',effect_possible:true,cleanup_complete:true,
 error:{code:'UI_DEADLINE_EXCEEDED',message:'Observed UI action deadline exceeded'}});
const operation={id:'js-read',parameters:{document_id:'doc',workflow_ref:workflow,mode:'script',
 target:{kind:'new',type:'programming.javascript'},parameters:{source_text:source,schema_mode:'code'}},
 cleanupConfirmed:true,transportUncertain:false};
const channel={openPort:async()=>{},observe:async()=>({prepared_node_context:{...node,verified:true},
 node_mapping:{verified:true,inventory_complete:true,source_identity_verified:true,state_source:'cached_mapping_stores',
 settings_applied:false,package_saved:false,autosync:true,source_fields:[{name:'Value'}],target_fields:[{name:'Value'}],
 node_context:{...node,surface:'wizard',input_port:{direction:'input',port:0},output_port:{direction:'output',port:0,port_guid:'port'}}}})};
const procedure=await import('../../lib/node-procedure.mjs');
mock.module(new URL('../../lib/node-procedure.mjs',import.meta.url),{namedExports:{...procedure,createNodeProcedure:()=>channel}});
const admission=await import('../../lib/javascript-source-admission.mjs');
mock.module(new URL('../../lib/javascript-source-admission.mjs',import.meta.url),{namedExports:{...admission,
 createJavascriptSourceAdmission:()=>({admit:async()=>({intent:'create',effective_source:identity}),
 withMutation:async(_,perform)=>{await perform();return {phase:'configured',effective_source:identity,
 settings_sha256:admission.javascriptSourceSettingsDigest(settings)};},withEffect:async(_,perform)=>perform()})}});
const managed=await import('../../lib/javascript-managed-source-adapter.mjs');
mock.module(new URL('../../lib/javascript-managed-source-adapter.mjs',import.meta.url),{namedExports:{...managed,
 createJavascriptManagedSourceAdapter:()=>({open:async()=>({settings}),read:async()=>({source}),
 replace:async()=>({draft_exact:true,...identity}),commit:async()=>({owned_done_settled:true,graph_owner_verified:true})})}});
mock.module(new URL('../../lib/javascript-port-mapping-close.mjs',import.meta.url),{namedExports:{closeJavascriptPortMapping:async()=>{}}});
const execution=await import('../../lib/node-execution-procedure.mjs');
mock.module(new URL('../../lib/node-execution-procedure.mjs',import.meta.url),{namedExports:{...execution,
 createNodeExecutionProcedure:()=>({prepare:async()=>{},waitCompleted:async()=>({verified:true,owner_verified:true,
 status:'completed',execution_id:'execution'})}),finishConfiguredGraph:async()=>({verified:true})}});
const output=await import('../../lib/node-output-procedure.mjs');
mock.module(new URL('../../lib/node-output-procedure.mjs',import.meta.url),{namedExports:{...output,
 openNewOutputTable:async()=>({port_guid:'port',table:{port_guid:'port',view_guid:'view',table_tid:'table'}}),
 configureTablePrecision:async(_,table,{progress}={})=>{if(progress)progress.apply_issued=true;return {table,original_formats:[]};},
 prepareTableRead:async()=>{calls.push('read');if(fault==='transport')operation.transportUncertain=true;
  if(fault==='cleanup-unconfirmed')operation.cleanupConfirmed=false;throw primary;},
 restoreTablePrecision:async()=>{calls.push('restore-format');throw Error('Node procedure is blocked by a mask or dialog');},
 restoreStoppedTableRead:async(_,view)=>{calls.push('cancel-own-filter');assert.ok(view.formatProof);
  if(fault==='cancel-failed')throw primary;calls.push('restore-format','return-graph');return {returned:{verified:true}};},
 returnFromOutputTable:async()=>{calls.push('return-graph');return {verified:true};}}});
const pending=await import('../../lib/node-pending-release.mjs');
mock.module(new URL('../../lib/node-pending-release.mjs',import.meta.url),{namedExports:{...pending,
 releasePendingNode:async({restoreRead})=>{calls.push('release');if(restoreRead)await restoreRead();return {verified:true,cleanup_complete:true};}}});
const {createJavascriptCodeNodeSupport}=await import('../../lib/javascript-code-node.mjs');
const support=createJavascriptCodeNodeSupport({targetOrigin:'http://test',targetBuild:'7.4.2',redactor:createRedactor()});
const driver=support.nodeApplyDriverFactory({operation,execute:async()=>assert.fail('Unexpected browser transport'),
 onRecord:async e=>e,now:Date.now,receiptOptions:()=>({}),readReceipt:async()=>({state:'completed',receipt:{cleanup_complete:true}})});
const ctx={node,document_id:'doc',workflow_ref:workflow,deadline:Date.now()+60000,execution:{execution_id:'execution'}};
operation.nodeTargetAdapter={observe:async()=>({complete:true,document_id:'doc',workflow_ref:workflow,nodes:[],links:[],foreign_links:[]})};
await driver.beforeTarget(ctx);
await driver.mapPorts([],{...ctx,receipt_id:'js-read:input_mapping'});
await driver.openWizard(ctx);await driver.configureJavascript(ctx,operation.parameters.parameters);
await driver.finish('done',ctx);await driver.materializeOutput(ctx);await driver.waitExecution(ctx);
await driver.mapPorts([],{...ctx,receipt_id:'js-read:output_mapping'});
await assert.rejects(driver.readOutput({ports:[0],require_exact_numbers:true,sample_rows:12},ctx),error=>error===primary,
 'Cleanup must retain the original ambiguous Filter click receipt');
if(['transport','cleanup-unconfirmed'].includes(fault))assert.deepEqual(calls,['read']);
if(fault==='cancel-failed')assert.deepEqual(calls,['read','cancel-own-filter']);
if(fault==='owned'){
 assert.deepEqual(calls,['read','cancel-own-filter','restore-format','return-graph']);
 assert.ok(driver.releasePendingPhases.includes('read'));
 await driver.releasePending({pending:{phase:'read'},node,request:operation.parameters});
 assert.equal(calls.at(-1),'release');
 assert.equal(calls.filter(c=>c==='cancel-own-filter').length,1,'A restored view must not be cancelled again');
 await assert.rejects(driver.releasePending({pending:{phase:'materialization_execute'},node,request:operation.parameters}),/Only a stopped JavaScript/);
}
console.log(JSON.stringify({fault,calls}));
