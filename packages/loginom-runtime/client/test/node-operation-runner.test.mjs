import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodeOperationRunner} from '../lib/node-operation-runner.mjs';

test('ID-only resume retains the immutable original request and validates the current handler',async()=>{
 const calls=[];let revision='v1';
 const runner=createNodeOperationRunner({validate:r=>{assert.ok(r.parameters);return revision;},progress:()=>null,
  run:async(r,options)=>{calls.push(structuredClone({r,resume:options.resume}));r.parameters.value='worker mutation';return {status:'AMBIGUOUS'};}});
 const request={operation_id:'original',parameters:{value:'accepted'}};
 runner.start(request);request.parameters.value='caller mutation';await runner.wait('original');
 assert.equal(runner.start({operation_id:'original'},{resume:true}).attempt,2);await runner.wait('original');
 assert.deepEqual(calls.map(c=>c.r.parameters.value),['accepted','accepted']);assert.equal(calls[1].resume,true);
 assert.throws(()=>runner.start({operation_id:'original',parameters:{value:'changed'}},{resume:true}),/different parameters/);
 assert.throws(()=>runner.start({operation_id:'unknown'},{resume:true}),/Unknown node operation/);
 revision='v2';assert.throws(()=>runner.start({operation_id:'original'},{resume:true}),/different parameters/);
 assert.equal(calls.length,2);
});

test('ID-only resume does not duplicate a running or completed worker',async()=>{
 let release,count=0;const runner=createNodeOperationRunner({validate:()=>1,progress:()=>null,
  run:async()=>{count++;await new Promise(r=>{release=r;});return {status:'SUCCEEDED'};}});
 runner.start({operation_id:'one',parameters:{}});
 assert.equal(runner.start({operation_id:'one'},{resume:true}).attempt,1);assert.equal(count,1);
 release();const done=await runner.wait('one');assert.deepEqual(runner.start({operation_id:'one'},{resume:true}),done);assert.equal(count,1);
});
