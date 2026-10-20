import test from 'node:test';
import assert from 'node:assert/strict';
import {Page,runtime,nodeParameters} from './support/executor-fixture.mjs';
import {compactActionResult} from '../lib/user-results.mjs';

test('mixed single/batch description refusal offers an executable batch shape',()=>{
 const page=new Page(),engine=runtime(page);
 const types=['imports.text','transform.join_data','exports.text'];
 let error;try{engine.describe({action_key:'package.save_checkpoint',node_types:types});}catch(e){error=e;}
 assert.ok(error);
 const reply=compactActionResult(engine.requestFailure(error));
 assert.equal(reply.status,'FAILED');assert.equal(reply.effect_possible,false);
 assert.equal(reply.request_rejected,true);assert.equal(reply.next_step.tool,'dock_action_describe');
 const example=JSON.parse(/For example: (\{.*\})\./.exec(reply.next_step.instruction)[1]);
 const corrected=engine.describe(example);
 assert.deepEqual(corrected.actions.map(a=>a.action_key),['package.save_checkpoint']);
 assert.deepEqual(corrected.node_types.map(n=>n.type),types);
 assert.equal(engine.describe({action_key:'package.save_checkpoint'}).action.action_key,'package.save_checkpoint');
 assert.throws(()=>engine.describe({action_key:'package.save_checkpoint',action_keys:['package.save_as']}),/Choose a single/);
 assert.throws(()=>engine.describe({action_keys:['package.save_checkpoint','package.save_checkpoint']}),/distinct/);
 assert.equal(engine.requestFailure(Error('unrelated refusal')).next_step,undefined);
 assert.deepEqual(page.events,[]);
});

test('mixed description hint does not mask a pending browser effect',async()=>{
 const page=new Page();page.failDrag=true;
 const engine=runtime(page);
 const original=await engine.run('node.add',nodeParameters,{operationId:'original'});
 assert.equal(original.status,'AMBIGUOUS');
 const reply=engine.requestFailure(Error('Choose a single action or a batch description'));
 assert.equal(reply.status,'AMBIGUOUS');assert.equal(reply.operation_id,'original');
 assert.equal(reply.effect_possible,true);assert.equal(reply.next_step,undefined);
 assert.deepEqual(reply.output.available_actions,[]);
});
