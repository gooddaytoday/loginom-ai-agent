import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
const request=()=>({operation_id:'positional',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'flow',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},target:{kind:'new',type:'transform.col_union_data'},inputs:[0,1].map(input=>({input,output:0,source:{document_id:'doc',workflow_id:'flow',node_id:'source'+input}})),mode:'positional',parameters:{col_union:{row_count:'maximum',padding:'repeat'}},mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:240000,execute_ms:60000,total_ms:360000}});
test('public positional union registration dispatches its handler and rejects a third table',()=>{
 const handlers=createCandidateNodeSupport({}).nodeApplyHandlers,r=request();
 assert.doesNotThrow(()=>validateActionParameters(nodeApplyInputSchema,r));
 assert.doesNotThrow(()=>validateNodeApplyRequest(r,handlers));
 assert.equal(typeof handlers.get(r.target.type).configurationReadback,'function');
 r.inputs.push({...r.inputs[0],input:2});assert.throws(()=>validateNodeApplyRequest(r,handlers));
});
