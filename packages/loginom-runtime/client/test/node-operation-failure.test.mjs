import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeOperationRunner} from '../lib/node-operation-runner.mjs';
test('explicit resume of a settled terminal failure redelivers it without relaunch or attempt change',async()=>{
 let calls=0;
 const outcome={status:'FAILED',cleanup_complete:true,output:{execution:{status:'failed',failure_verified:true}}};
 const r=createNodeOperationRunner({run:async()=>{calls++;return outcome;},validate:()=>1,progress:()=>null}),request={operation_id:'op'};
 r.start(request);const first=await r.wait('op');
 assert.equal(first.state,'settled');assert.deepEqual(r.start(request,{resume:true}),first);assert.equal(calls,1);
});
