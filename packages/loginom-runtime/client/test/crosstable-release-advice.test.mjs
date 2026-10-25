import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseNodeApply,validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {validateCrossTableParameters} from '../lib/crosstable-parameters.mjs';

const node={document_id:'doc',workflow_id:'wf',node_id:'pivot'};
const input={source:{document_id:'doc',workflow_id:'wf',node_id:'source'},output:0,input:0};
const field=name=>({kind:'input_field',name});
const complete={row_keys:[field('Region')],column:field('Category'),facts:[{field:field('Amount'),functions:['sum']}],category_mode:'fixed',include_null:false,include_other:false};
const handlers=new Map([['transform.cross_table',{revision:'1',modes:['pivot'],output_wizard:'separate',validate:validateCrossTableParameters,configure:async()=>{throw Error('No replay');}}]]);
for(const [name,parameters,inputs] of [['complete configuration',complete,[input]],['retained configuration',{},[]]])
test('released CrossTable advice passes the unchanged validator: '+name,async()=>{
 const request={operation_id:'pivot',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind:'existing',type:'transform.cross_table',ref:node},inputs,mode:'pivot',parameters,mappings:[],finish:'execute',
  read:{ports:[0],sample_rows:10,require_exact_numbers:true},budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 const before=structuredClone(request);let releases=0;
 const operation={id:'pivot',nodeApply:{request,node,pending:{phase:'finish'},signature:'sig',
  phases:[{phase:'node_finish'},{phase:'output_mapping'}],execution:{status:'not_requested',execution_id:null},output:{}}};
 const result=await releaseNodeApply({operation,handlers,record:async e=>e,drivers:{releasePending:async()=>{
  releases++;return {verified:true,cleanup_complete:true,node_context:node,cleanup:{wizard_closed:false}};
 }}});
 const instruction=result.next_step.instruction;
 const advisedInputs=JSON.parse(instruction.match(/ and inputs:(\[[^\]]*\])/)[1]);
 const retry={...request,operation_id:'retry',inputs:advisedInputs};
 assert.doesNotThrow(()=>validateNodeApplyRequest(retry,handlers));
 assert.deepEqual(advisedInputs,inputs);
 if(!inputs.length)assert.match(instruction,/parameters:\{\}/);
 else assert.throws(()=>validateNodeApplyRequest({...retry,inputs:[]},handlers),/explicit table input zero/);
 assert.equal(releases,1);assert.deepEqual(request,before);
 assert.equal(result.execution.status,'unknown');assert.equal(result.persisted_package_verified,false);
});
