import test from 'node:test';
import assert from 'node:assert/strict';
import {createCandidateNodeSupport} from '../lib/node-support.mjs';
import {NODE_TYPES} from '../lib/node-contracts.mjs';
import {nodeApplyInputSchema} from '../lib/node-api.mjs';
test('variables calculator registers a native scalar handler independently of table calculator',()=>{
 const support=createCandidateNodeSupport({targetOrigin:'https://app.loginom.ai',targetBuild:'7.4.2'});
 const handler=support.nodeApplyHandlers.get('variables.calculator');assert.ok(handler);
 assert.deepEqual(handler.modes,['expression']);assert.equal(NODE_TYPES['variables.calculator'].tabular_outputs,0);
 assert.equal(NODE_TYPES['variables.calculator'].variable_outputs,1);assert.equal(NODE_TYPES['variables.calculator'].palette_group,'Переменные');
 assert.equal(NODE_TYPES['variables.user'].palette_group,'Трансформация');
 assert.ok(nodeApplyInputSchema.properties.target.properties.type.enum.includes('variables.calculator'));
 const request={target:{kind:'new'},inputs:[],mappings:[],read:{ports:[],variable_ports:[0]}};
 handler.validate({expressions:[{target:{kind:'new'},name:'a',label:'A',type:'integer',formula:'NULL'}]},'expression',request);
 assert.throws(()=>handler.validate({expressions:[{target:{kind:'new'},name:'a',label:'A',type:'integer',formula:'1'}]},'expression',{...request,read:{ports:[0]}}));
});
