import test from 'node:test';
import assert from 'node:assert/strict';
import { injectSaveReopen,NEEDLE,saveReopenFaultCall } from './save-reopen-client.mjs';
test('reopen injection occurs after the real close record and requires unique boundary',()=>{
 const request={arguments:{code:'before\n'+NEEDLE+'\nafter'}};
 const result=injectSaveReopen(request);
 assert.ok(result.arguments.code.indexOf(NEEDLE)<result.arguments.code.indexOf("throw new Error"));
 assert.equal(request.arguments.code,'before\n'+NEEDLE+'\nafter');
 assert.throws(()=>injectSaveReopen({arguments:{code:'missing'}}));
 assert.throws(()=>injectSaveReopen({arguments:{code:NEEDLE+NEEDLE}}));
});
test('non-save requests pass through without interception',async()=>{
 const request={name:'other'};let receipts=0;
 const wrapped=saveReopenFaultCall(async value=>value,async()=>receipts++);
 assert.equal(await wrapped(request),request);assert.equal(receipts,0);
});
