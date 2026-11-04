import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nodeApiTools} from '../lib/node-api.mjs';
import {describeNodeTypes} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {userNodeTool,userActionInventory,createUserWorkflowBindings} from '../lib/user-workflow.mjs';
test('association rules fit the approved model-visible tool and card budgets',()=>{
 const tool=userNodeTool(nodeApiTools.find(t=>t.name==='dock_node_apply'));
 assert.ok(Buffer.byteLength(JSON.stringify({name:tool.name,description:tool.description,inputSchema:tool.inputSchema}))<=20000);
 const handlers=createCandidateNodeSupport({}).nodeApplyHandlers;
 const card=userActionInventory({node_types:describeNodeTypes(['datamining.assn_rules'],{},new Map(),handlers)}).node_types[0];
 assert.ok(Buffer.byteLength(JSON.stringify(card))<=12000);
 assert.deepEqual(card.candidate_modes,['fp_growth']);assert.ok(card.parameter_schema.properties.transaction_field);
 const file=readFileSync(new URL('../../../product/skills/loginom-automation/references/nodes/datamining.assn_rules.md',import.meta.url),'utf8');
 assert.ok(Buffer.byteLength(file)<=6000);assert.doesNotMatch(file,/\$\d|\$ARGUMENTS/);
});
test('compact association rules Execute reads both supported ports by default',()=>{
 const b=createUserWorkflowBindings(),workflow_ref={workflow_id:'wf',prefix:'MF;TF',tab_tid:'tab',navigation_path:[]};
 b.remember({document_id:'doc',workflow_ref});
 const expanded=b.expandNode({document_id:'doc',workflow_ref:{workflow_id:'wf'},target:{kind:'new',type:'datamining.assn_rules'},mode:'fp_growth',parameters:{},finish:'execute'});
 assert.deepEqual(expanded.read.ports,[0,1]);
});
