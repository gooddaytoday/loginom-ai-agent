import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {isUnchangedTransformExecution} from '../lib/node-read-contract.mjs';

const support=createCandidateNodeSupport({targetOrigin:'http://example.test',targetBuild:'7.4.2'});
for(const mode of ['inner','left','right','full','difference'])test('Join '+mode+' is registered from public schema through handler and unchanged execution',()=>{
 assert.ok(nodeApplyInputSchema.properties.mode.enum.includes(mode));
 const request={operation_id:'join-mode',contract_revision:'1.0.0',document_id:'doc',
  workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind:'existing',type:'transform.join_data',ref:{document_id:'doc',workflow_id:'wf',node_id:'join'}},
  inputs:[],mode,parameters:{},mappings:[],finish:'execute',read:{ports:[0],sample_rows:10,require_exact_numbers:true},
  budgets:{configure_ms:10000,execute_ms:10000,total_ms:30000}};
 assert.doesNotThrow(()=>validateNodeApplyRequest(request,support.nodeApplyHandlers));
 assert.equal(isUnchangedTransformExecution(request),true);
 for(const patch of [{parameters:{keys:[]}},{inputs:[{}]},{mappings:[{}]},{finish:'done'},{finish:'close'},{mode:'cross'}])
  assert.equal(isUnchangedTransformExecution({...request,...patch}),false);
 assert.throws(()=>validateNodeApplyRequest({...request,mode:'cross'},support.nodeApplyHandlers),/Unsupported node configuration mode/);
});
