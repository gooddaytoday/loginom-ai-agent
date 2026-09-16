import test from 'node:test';import assert from 'node:assert/strict';
import {nodeApiTools,dispatchNodeApi} from '../lib/node-api.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
test('public missing values API accepts empty string constants and rejects incomplete or foreign policies before dispatch',async()=>{
 const handler=createCandidateNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'}).nodeApplyHandlers.get('preprocessing.data_recovery'),calls=[];
 const runtime={tools:nodeApiTools,startNodeApply:r=>{handler.validate(r.parameters,r.mode,r);calls.push(r);return {state:'running'};}};
 const request={operation_id:'op',contract_revision:'1.0.0',document_id:'d',workflow_ref:{workflow_id:'w',tab_tid:'tab',prefix:'prefix',navigation_path:[{tid:'path',label:'Scenario'}]},target:{kind:'existing',type:'preprocessing.data_recovery',ref:{document_id:'d',workflow_id:'w',node_id:'n'}},inputs:[],mode:'impute',parameters:{ordered:false,max_nulls_percent:0,fields:[{field:{kind:'input_field',name:'Note'},method:'constant',value:''}]},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 await dispatchNodeApi(runtime,'dock_node_apply',request);assert.equal(calls.length,1);assert.deepEqual(handler.modes,['impute']);
 for(const mutate of [r=>delete r.parameters.max_nulls_percent,r=>r.parameters.fields[0].value=0,r=>r.parameters.fields[0].value='x'.repeat(2049),r=>r.parameters.fields[0].method='median',r=>r.parameters.ordered=true]){const r=structuredClone(request);mutate(r);await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',r));}
 assert.equal(calls.length,1);
});
