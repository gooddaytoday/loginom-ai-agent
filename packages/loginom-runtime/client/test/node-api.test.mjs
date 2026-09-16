import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeApiTools,deliveryApiTools,dispatchNodeApi} from '../lib/node-api.mjs';
import {validateTextImportNodeParameters} from '../lib/text-import-node.mjs';
const fixture=()=>{
 const calls=[];
 const runtime={tools:[...nodeApiTools,...deliveryApiTools]};
 for(const name of ['startNodeApply','nodeApplyStatus','waitNodeApply','cancelNodeApply','stopNodeApply','deliverArtifact','resumeArtifactDelivery','artifactDeliveryStatus'])
  runtime[name]=(...args)=>{calls.push({name,args});return {operation_id:'op',state:'running'};};
 return {runtime,calls};
};
test('lifecycle dispatch retains ID, local cancellation and independent server stop',async()=>{
 const {runtime,calls}=fixture(),signal=new AbortController().signal;
 for(const name of ['status','wait','cancel','stop'])await dispatchNodeApi(runtime,'dock_node_'+name,{operation_id:'op'},{signal});
 assert.deepEqual(calls.map(c=>c.name),['nodeApplyStatus','waitNodeApply','cancelNodeApply','stopNodeApply']);
 assert.ok(calls.every(c=>c.args[0]==='op'));assert.equal(calls[1].args[1].timeoutMs,1000);assert.equal(calls[1].args[1].signal,signal);
});
test('invalid, unavailable and aborted API calls never dispatch work',async()=>{
 const {runtime,calls}=fixture();
 for(const args of [{operation_id:'op',timeout_ms:60001},{operation_id:'op',timeout_ms:Infinity},{operation_id:'op',extra:true},{}])
  await assert.rejects(dispatchNodeApi(runtime,'dock_node_wait',args),/Invalid/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(dispatchNodeApi(runtime,'dock_node_cancel',{operation_id:'op'},{signal:controller.signal}));
 await assert.rejects(dispatchNodeApi({...runtime,tools:[]},'dock_node_cancel',{operation_id:'op'}),/unavailable/);
 assert.deepEqual(calls,[]);
});
test('delivery dispatch preserves grant and resume IDs without exposing a raw path',async()=>{
 const {runtime,calls}=fixture(),request={operation_id:'op',artifact_id:'csv',upload_grant_id:'grant',budget_ms:60000};
 await dispatchNodeApi(runtime,'dock_artifact_deliver',request);
 const resume={operation_id:'op',resume_id:'resume',budget_ms:30000};
 await dispatchNodeApi(runtime,'dock_artifact_delivery_resume',resume);
 assert.deepEqual(calls.map(c=>c.args[0]),[request,resume]);
 await assert.rejects(dispatchNodeApi(runtime,'dock_artifact_deliver',{...request,path:'/other'}),/unknown field/);
 assert.equal(calls.length,2);
});
test('complete import and existing patch pass the public schema and installed handler together',async()=>{
 const {runtime,calls}=fixture();
 const request={operation_id:'op',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind:'new',type:'imports.text',position:{x:320,y:280},label:'Source'},inputs:[],mode:'delimited',
  parameters:{source:{artifact_id:'csv',upload_operation_id:'delivery:upload',bytes:10,sha256:'a'.repeat(64)},
   settings:{source:{source_path:'/user/dock-p3/source.csv',encoding:'UTF-8',rows_to_skip:0,first_line_as_title:true},
    format:{delimiter:';',decimal_separator:'.',null_marker:'',text_qualifier:'"'},
    columns:[{name:'Id',label:'Id',type:'integer',data_kind:'Дискретный',used:true}]}},
  mappings:[{direction:'output',port:0,autosync:false,fields:[{source:{kind:'configured_field',name:'Id'},name:'Code',label:'Code'}]}],
  finish:'execute',read:{ports:[0],sample_rows:3,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 runtime.startNodeApply=(args,options)=>{validateTextImportNodeParameters(args.parameters,args.mode,args);calls.push({args,options});return {state:'running'};};
 await dispatchNodeApi(runtime,'dock_node_apply',request);
 await dispatchNodeApi(runtime,'dock_node_resume',request);
 assert.deepEqual(calls[1].options,{resume:true});
 const patch=structuredClone(request);patch.target={kind:'existing',type:'imports.text',ref:{document_id:'doc',workflow_id:'wf',node_id:'node'}};
 patch.parameters.settings={columns:[{source_name:'Id',label:'Identifier'}]};
 await dispatchNodeApi(runtime,'dock_node_apply',patch);
 const incomplete=structuredClone(request);delete incomplete.parameters.settings.format;
 await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',incomplete));
 const short=structuredClone(request);delete short.parameters.source.bytes;delete short.parameters.source.sha256;
 await dispatchNodeApi(runtime,'dock_node_apply',short);
 await dispatchNodeApi(runtime,'dock_node_resume',short);
 assert.equal(calls.length,5);
});

test('Field Parameters dispatch uses the catalog scalar mode and rejects malformed changes',async()=>{
 const {createCandidateNodeSupport}=await import('../lib/node-support.mjs');
 const {runtime,calls}=fixture(),support=createCandidateNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'});
 const handler=support.nodeApplyHandlers.get('transform.reform_columns');
 const request={operation_id:'reform',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'wf',tab_tid:'tab',prefix:'prefix',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind:'existing',type:'transform.reform_columns',ref:{document_id:'doc',workflow_id:'wf',node_id:'n'}},inputs:[],
  mode:'scalar',parameters:{changes:[{field:{kind:'input_field',name:'Raw'},name:'Clean',type:'real',excluded:false}]},mappings:[],finish:'done',
  read:{ports:[0],sample_rows:10,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 runtime.startNodeApply=args=>{handler.validate(args.parameters,args.mode,args);calls.push(args);return {state:'running'};};
 await dispatchNodeApi(runtime,'dock_node_apply',request);assert.equal(calls.length,1);
 for(const patch of [{field:{kind:'input_field',name:'Raw'},type:'variant'},{field:{kind:'input_field',name:'Raw'},label:''},{field:{kind:'configured_field',name:'Raw'},name:'Clean'},{field:{kind:'input_field',name:'Raw'}}])
  await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',{...request,parameters:{changes:[patch]}}));
 assert.equal(calls.length,1);
 assert.deepEqual(handler.modes,['scalar']);
});

test('Filter dispatch accepts ordered conditions and two explicit outputs, refusing unsupported requests',async()=>{
 const {createCandidateNodeSupport}=await import('../lib/node-support.mjs');
 const {runtime,calls}=fixture(),handler=createCandidateNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'}).nodeApplyHandlers.get('transform.filter_data');
 const request={operation_id:'filter',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'wf',tab_tid:'tab',prefix:'prefix',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind:'existing',type:'transform.filter_data',ref:{document_id:'doc',workflow_id:'wf',node_id:'n'}},inputs:[],mode:'conditions',
  parameters:{groups:[[{field:{kind:'input_field',name:'Id'},operator:'between',type:'integer',lower:2,upper:4}]]},
  mappings:[{direction:'input',port:0},{direction:'output',port:0},{direction:'output',port:1}],finish:'execute',
  read:{ports:[0,1],sample_rows:10,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 runtime.startNodeApply=args=>{handler.validate(args.parameters,args.mode,args);calls.push(args);return {state:'running'};};
 await dispatchNodeApi(runtime,'dock_node_apply',request);assert.equal(calls.length,1);assert.deepEqual(handler.modes,['conditions']);
 for(const patch of [{parameters:{groups:[]}},{read:{...request.read,ports:[0]}},{mode:'scalar'},{mappings:[{direction:'input',port:1}]}])
  await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',{...request,...patch}));
 assert.equal(calls.length,1);
});
