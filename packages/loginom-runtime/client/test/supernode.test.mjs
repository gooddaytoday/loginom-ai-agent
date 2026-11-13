import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSupernodeParameters} from '../lib/supernode-parameters.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';

const boundary={input:{kind:'table',name:'Input',label:'Исходные данные',requirement:'required'},output:{kind:'table',name:'Output',label:'Результат'}};
const ref={document_id:'doc',workflow_id:'wf',node_id:'node'};
const request={operation_id:'new',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'crumb',label:'Scenario'}]},
 target:{kind:'new',type:'control.supernode'},inputs:[],mode:'tabular_boundary',parameters:{boundary},mappings:[],finish:'done',read:{ports:[],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:60000,execute_ms:60000,total_ms:180000}};

test('supernode handler is registered with the approved table boundary mode',()=>{
 const {nodeApplyHandlers}=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 assert.ok(nodeApplyHandlers.has('control.supernode'));
 assert.equal(NODE_TYPES['control.supernode'].palette_group,'Управление');
 assert.doesNotThrow(()=>validateNodeApplyRequest(request,nodeApplyHandlers));
 assert.throws(()=>validateNodeApplyRequest({...request,mode:'compose'},nodeApplyHandlers));
 assert.throws(()=>validateNodeApplyRequest({...request,parameters:{boundary:{...boundary,input:{...boundary.input,name:'9bad'}}}},nodeApplyHandlers));
 assert.throws(()=>validateNodeApplyRequest({...request,inputs:[{source:{...ref,workflow_id:'foreign'},input:0,output:0}]},nodeApplyHandlers),/another workflow/);
});

test('supernode preflight rejects unsupported boundaries before browser work',()=>{
 assert.doesNotThrow(()=>validateSupernodeParameters({boundary},'tabular_boundary',request));
 assert.throws(()=>validateSupernodeParameters({},'tabular_boundary',request),/boundary/);
 for(const input of [{...boundary.input,name:'9bad'},{...boundary.input,requirement:'optional'},{...boundary.input,kind:'variables'}])
  assert.throws(()=>validateSupernodeParameters({boundary:{...boundary,input}},'tabular_boundary',request));
 const existing={...request,target:{kind:'existing',type:'control.supernode',ref}};
 assert.doesNotThrow(()=>validateSupernodeParameters({},'tabular_boundary',existing));
 assert.throws(()=>validateSupernodeParameters({boundary},'compose',request));
});
