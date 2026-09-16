import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserWorkflowBindings, userNodeTool } from '../lib/user-workflow.mjs';
import { nodeApiTools, dispatchNodeApi } from '../lib/node-api.mjs';
import { validateActionParameters } from '../lib/action-catalog.mjs';

const workspace=()=>({document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'tab',prefix:'prefix',navigation_path:[{tid:'module',label:'Module'},{tid:'scenario',label:'Scenario'}]}});
const request=()=>({operation_id:'op',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf'},
  target:{kind:'existing',type:'transform.sorting',ref:{document_id:'doc',workflow_id:'wf',node_id:'sort'}},inputs:[],mappings:[],mode:'keys',parameters:{},finish:'execute',
  read:{ports:[0],sample_rows:3,require_exact_numbers:false},budgets:{configure_ms:1000,execute_ms:1000,total_ms:3000}});

test('short user references expand into the unchanged node contract without browser or knowledge calls',async()=>{
  const bindings=createUserWorkflowBindings(),state=workspace();bindings.remember(state);
  const tool=nodeApiTools.find(t=>t.name==='dock_node_apply'),userTool=userNodeTool(tool),args=request();
  validateActionParameters(userTool.inputSchema,args);
  assert.throws(()=>validateActionParameters(tool.inputSchema,args),/Invalid/);
  assert.throws(()=>validateActionParameters(userTool.inputSchema,{...args,workflow_ref:state.workflow_ref}),/unknown field/);
  state.workflow_ref.navigation_path[0].tid='tampered';
  const full=bindings.expandNode(args);let received;
  await dispatchNodeApi({tools:nodeApiTools,startNodeApply:async r=>{received=r;}},'dock_node_apply',full);
  assert.equal(received.workflow_ref.navigation_path[0].tid,'module');
  assert.deepEqual(args.workflow_ref,{workflow_id:'wf'});
  assert.deepEqual(bindings.expandNode(args),full);
});
test('foreign identities and damaged prepare references fail before changing preparation state',()=>{
  const bindings=createUserWorkflowBindings(),state=workspace();bindings.remember(state);
  assert.throws(()=>bindings.expandNode({...request(),document_id:'foreign'}),/UNKNOWN_PREPARED_WORKFLOW/);
  assert.throws(()=>bindings.expandNode({...request(),workflow_ref:{workflow_id:'foreign'}}),/UNKNOWN_PREPARED_WORKFLOW/);
  const ref={...state.workflow_ref,document_id:'doc',navigation_path:state.workflow_ref.navigation_path.map(c=>({label:c.label,tid:c.tid}))};
  const args={intent:'existing_workflow',workflow_ref:ref};
  assert.deepEqual(bindings.normalizePreparation(args).workflow_ref,{...workspace().workflow_ref,document_id:'doc'});
  ref.navigation_path[0].tid='scenario';
  assert.throws(()=>bindings.normalizePreparation(args),/WORKFLOW_REFERENCE_MISMATCH/);
  assert.deepEqual(bindings.expandNode(request()).workflow_ref,workspace().workflow_ref);
});
test('verified save continuation updates the local path while old documents remain isolated',()=>{
  const bindings=createUserWorkflowBindings();bindings.remember(workspace());
  const saved=workspace();saved.workflow_ref.navigation_path[0].label='Saved module';bindings.remember(saved);
  assert.equal(bindings.expandNode(request()).workflow_ref.navigation_path[0].label,'Saved module');
  bindings.remember({document_id:'new-doc',workflow_ref:{...saved.workflow_ref,workflow_id:'new-wf'}});
  assert.throws(()=>bindings.expandNode({...request(),workflow_ref:{workflow_id:'new-wf'}}),/UNKNOWN_PREPARED_WORKFLOW/);
});
