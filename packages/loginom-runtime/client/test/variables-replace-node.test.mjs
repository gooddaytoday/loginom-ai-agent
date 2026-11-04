import test from 'node:test';
import assert from 'node:assert/strict';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {validateNodeApplyRequest} from '../lib/node-apply.mjs';
import {isUnchangedTransformExecution} from '../lib/node-read-contract.mjs';
import {configureVariablesReplace} from '../lib/variables-replace-procedure.mjs';
const ref={document_id:'doc',workflow_id:'wf',node_id:'source'};
const request=()=>({operation_id:'replace',contract_revision:'1.0.0',document_id:'doc',workflow_ref:{workflow_id:'wf',tab_tid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-1',prefix:'MF;TF',navigation_path:[{tid:'crumb',label:'flow'}]},
 target:{kind:'new',type:'variables.replace'},inputs:[],variable_inputs:[{source:ref,output:0,input:0,kind:'variables'}],mode:'exact',
 parameters:{rules:[{variable:{kind:'input_variable',name:'Count'},type:'integer',pairs:[{from:2,to:5}],other:'keep',precision:0}]},mappings:[],finish:'execute',
 read:{ports:[],variable_ports:[0],sample_rows:0,require_exact_numbers:true},budgets:{configure_ms:600000,execute_ms:600000,total_ms:1200000}});
test('registered scalar replacement has the native variables palette and production validation',()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 assert.equal(NODE_TYPES['variables.replace'].palette_group,'Переменные');assert.equal(NODE_TYPES['variables.replace'].variable_outputs,1);
 assert.doesNotThrow(()=>validateNodeApplyRequest(request(),support.nodeApplyHandlers));
 const r=request();r.read.ports=[0];assert.throws(()=>validateNodeApplyRequest(r,support.nodeApplyHandlers),/variable output/);
 r.read.ports=[];r.parameters.rules[0].pairs.push({from:2,to:8});assert.throws(()=>validateNodeApplyRequest(r,support.nodeApplyHandlers),/duplicate original/);
});
test('source refresh uses unchanged graph execution without reopening configuration',()=>{
 const r=request();r.target={kind:'existing',type:'variables.replace',ref:{...ref,node_id:'replacement'}};r.parameters={};r.variable_inputs=[];
 assert.equal(isUnchangedTransformExecution(r),true);
 r.variable_inputs=request().variable_inputs;assert.equal(isUnchangedTransformExecution(r),false);
});
test('serialized variable writer refuses expired budgets and unknown names before a UI gesture',async()=>{
 const context={verified:true,surface:'wizard',...ref},task={binding:{workflow_ref:{prefix:'MF;TF'}},deadline:Date.now()+10000,parameters:request().parameters};
 const page={locator:()=>assert.fail('No gesture or locator before resolving names')};
 const readNode=async()=>context,readContext=async()=>({verified:true,inventory_complete:true,input_fields:[{name:'Other',label:'Other',type:'integer',mode:'none'}]});
 const unknown=await configureVariablesReplace(page,task,readNode,readContext);
 assert.equal(unknown.status,'NOT_APPLIED');assert.equal(unknown.effect_possible,false);assert.match(unknown.error,/unknown variable/);
 const expired=await configureVariablesReplace(page,{...task,deadline:0},readNode,readContext);
 assert.equal(expired.status,'NOT_APPLIED');assert.match(expired.error,/deadline/);
});
