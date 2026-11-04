import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {NODE_TYPES,describeNodeTypes} from '../lib/node-contracts.mjs';
import {nodeApiTools,dispatchNodeApi} from '../lib/node-api.mjs';
import {userNodeTool} from '../lib/user-workflow.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {validateUiAction} from '../lib/workspace-ui.mjs';
const support=createCandidateNodeSupport({targetOrigin:'https://example.test',targetBuild:'7.4.2'});
test('ungroup registers two native inputs/outputs and only shares with bounded model schemas',()=>{
 const type=NODE_TYPES['transform.ungroup_data'];assert.equal(type.tabular_inputs,2);assert.equal(type.tabular_outputs,2);assert.deepEqual(type.modes,['shares']);
 const tool=nodeApiTools.find(t=>t.name==='dock_node_apply'),compact=userNodeTool(tool),card=describeNodeTypes(['transform.ungroup_data'],{},new Map(),support.nodeApplyHandlers)[0];
 assert.ok(Buffer.byteLength(JSON.stringify({name:compact.name,description:compact.description,inputSchema:compact.inputSchema}))<=20000);
 assert.ok(Buffer.byteLength(JSON.stringify(card))<=12000);
 const skill=readFileSync(new URL('../../../product/skills/loginom-automation/references/nodes/transform-ungroupdata.md',import.meta.url));
 assert.ok(skill.length<=6000);assert.doesNotMatch(skill.toString(),/\$(?:\d+|ARGUMENTS)/);
 assert.ok(card.parameter_schema.properties.ungroup);
});
test('ungroup public dispatch rejects seasonality, port 1 and unknown fields before runtime',async()=>{
 const r={operation_id:'ungroup',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF-1',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',navigation_path:[{tid:'path',label:'Scenario'}]},
  target:{kind:'new',type:'transform.ungroup_data',position:{x:320,y:320}},inputs:[0,1].map(input=>({input,output:0,source:{document_id:'doc',workflow_id:'wf',node_id:'source'+input}})),mode:'shares',
  parameters:{ungroup:{keys:[{total:'Group',support:'Group'}],value_field:'Total',item_field:'Item',share_field:'Share',rounding:{format:'none'},balance:'none'}},
  mappings:[],finish:'execute',read:{ports:[0],sample_rows:100,require_exact_numbers:true},budgets:{configure_ms:600000,execute_ms:120000,total_ms:600000}};
 let count=0;const runtime={tools:nodeApiTools,startNodeApply:args=>{validateNodeApplyRequest(args,support.nodeApplyHandlers);count++;return {};}};
 await dispatchNodeApi(runtime,'dock_node_apply',r);assert.equal(count,1);
 for(const change of [{mode:'seasonal'},{read:{...r.read,ports:[1]}},{parameters:{...r.parameters,variables:{}}}])await assert.rejects(dispatchNodeApi(runtime,'dock_node_apply',{...r,...change}));
 assert.equal(count,1);
});
test('ungroup may advance only its observed owned wizard through conditional output/done',()=>{
 const action={verb:'wizard_step',ref:'ui-next',expected_stage:['output_mapping','done']};
 const snapshot={wizard:{status:'observed',stage:'ungroup'},ui:{elements:[{ref:'ui-next',allowed_actions:['wizard_step']}]}};
 assert.doesNotThrow(()=>validateUiAction(action,snapshot));
 assert.throws(()=>validateUiAction(action,{...snapshot,wizard:{status:'observed',stage:'unsupported'}}));
});
