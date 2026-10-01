import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {dispatchNodeApi,nodeApiTools} from '../lib/node-api.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {createUserWorkflowBindings} from '../lib/user-workflow.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {compactNodeResult} from '../lib/user-results.mjs';

test('installed DataPartition public contract exposes five modes and three output defaults',async()=>{
 const support=createCandidateNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'});
 const handler=support.nodeApplyHandlers.get('preprocessing.data_partition');
 assert.deepEqual(handler.modes,['random','uniform','stratified','sequential','biased']);
 assert.equal(NODE_TYPES['preprocessing.data_partition'].tabular_outputs,3);
 assert.equal(NODE_TYPES['preprocessing.data_partition'].palette_group,'Предобработка');
 const bindings=createUserWorkflowBindings();
 bindings.remember({document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'tab',navigation_path:[{tid:'scenario',label:'Scenario'}]}});
 const request=bindings.expandNode({operation_id:'partition',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf'},
  target:{kind:'new',type:'preprocessing.data_partition',label:'Split'},inputs:[{source:{document_id:'doc',workflow_id:'wf',node_id:'input'},output:0,input:0}],
  mode:'sequential',parameters:{training:{unit:'rows',value:6},test:{unit:'percent',value:25},priority:'test',test_position:'start',seed:{policy:'fixed',value:17},
   sequential:{order:['unused','training','test']}},mappings:[],finish:'execute'});
 assert.deepEqual(request.read.ports,[0,1,2]);
 const calls=[],runtime={tools:nodeApiTools,startNodeApply:args=>{handler.validate(args.parameters,args.mode,args);calls.push(args);return {state:'running'};}};
 await dispatchNodeApi(runtime,'dock_node_apply',request);
 for(const patch of [{read:{...request.read,ports:[0,1]}},{mode:'random'},{parameters:{...request.parameters,sequential:{take:2,skip:1}}}])
  await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',{...request,...patch}));
 assert.equal(calls.length,1);
});

test('compact DataPartition response retains every semantic port role and typed payload',()=>{
 const schema=[{index:0,name:'ID',label:'ID',type:'integer',data_kind:'Дискретный',data_kind_source:'fresh_native'}];
 const ports=['combined','training','test'].map((role,port)=>({role,port,port_guid:'p'+port,fresh:true,execution_id:'execution',schema,
  row_count:1,sample:[[{type:'integer',is_null:false,value:'9007199254740993',precision:'exact_integer'}]],sample_rows:1,sample_complete:true,
  precision:{numbers_verified:true,limitations:[]},filter_enabled:false}));
 const result=compactNodeResult({operation_id:'partition',state:'settled',outcome:{status:'SUCCEEDED',cleanup_complete:true,
  output:{node:{document_id:'d',workflow_id:'w',node_id:'n'},execution:{status:'completed',execution_id:'execution'},
   output:{status:'complete',ports,execution_id:'execution'}}}});
 assert.deepEqual(result.output.ports.map(p=>p.role),['combined','training','test']);
 assert.equal(result.output.ports[1].sample[0][0].value,'9007199254740993');
 assert(result.output.ports.every(p=>p.sample_complete&&p.schema[0].data_kind_source==='fresh_native'));
});
