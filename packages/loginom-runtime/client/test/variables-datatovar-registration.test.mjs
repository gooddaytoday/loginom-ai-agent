import test from 'node:test';
import assert from 'node:assert/strict';
import {NODE_TYPES,describeNodeTypes} from '../lib/node-contracts.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {isUnchangedTransformExecution,buildNodeReadRequest} from '../lib/node-read-contract.mjs';
import {createUserWorkflowBindings} from '../lib/user-workflow.mjs';

test('DataToVar has its native palette identity, one table input and variable-only output',()=>{
 const type=NODE_TYPES['variables.from_table'];assert.ok(type);
 assert.equal(type.palette_group,'Переменные');assert.equal(type.icon_class,'bg-vendor-icon-datatovariables');
 assert.equal(type.tabular_inputs,1);assert.equal(type.tabular_outputs,0);assert.equal(type.variable_outputs,1);
 assert.deepEqual(type.modes,['aggregate']);
 assert.ok(nodeApplyInputSchema.properties.target.properties.type.enum.includes(type.type));
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'}),handler=support.nodeApplyHandlers.get(type.type);
 assert.ok(handler);assert.ok(handler.parameter_schema.properties.fields);
 assert.ok(Buffer.byteLength(JSON.stringify(describeNodeTypes([type.type],{},new Map(),support.nodeApplyHandlers)[0]))<=12000);
});

test('DataToVar reexecution preserves configuration and variable read defaults never request a table',()=>{
 const request={document_id:'doc',workflow_ref:{workflow_id:'wf'},target:{kind:'existing',type:'variables.from_table'},mode:'aggregate',finish:'execute',parameters:{},inputs:[],mappings:[]};
 assert.equal(isUnchangedTransformExecution(request),true);
 assert.equal(isUnchangedTransformExecution({...request,parameters:{fields:[]}}),false);
 assert.equal(isUnchangedTransformExecution({...request,variable_inputs:[{}]}),false);
 const bindings=createUserWorkflowBindings();
 bindings.remember({status:'READY',document_id:'doc',workflow_ref:{workflow_id:'wf',prefix:'MF;TF',tab_tid:'tab',navigation_path:[]}});
 const expanded=bindings.expandNode(request);
 assert.deepEqual(expanded.read.ports,[]);assert.deepEqual(expanded.read.variable_ports,[0]);
 assert.equal(expanded.read.require_exact_numbers,true);
});
