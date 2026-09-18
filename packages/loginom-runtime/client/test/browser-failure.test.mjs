import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCapabilityResult} from '../lib/executor.mjs';
for(const [message,category] of [
 ['Loginom connection is disconnected; restore the original session','LOGINOM_DISCONNECTED'],
 ['Loginom account or document changed; prepare the workspace again','LOGINOM_IDENTITY_CHANGED'],
 ['Target page, context or browser has been closed','BROWSER_CLOSED'],
 ['Execution context was destroyed','EXECUTION_CONTEXT_DESTROYED'],
 ['WebSocket is not open','BROWSER_CONNECTION_CLOSED'],
 ['Timeout 1000ms exceeded','BROWSER_TIMEOUT'],
 ['Browser receipt capacity reached','BROWSER_RECEIPT_CAPACITY'],
 ['Unrecognized native failure','UNCLASSIFIED_BROWSER_ERROR'],
])test('browser failure retains category without raw page/script/secrets: '+category,()=>{
 assert.throws(()=>parseCapabilityResult({isError:true,content:[{type:'text',text:message+'\npassword=PRIVATE api_key=HIDDEN https://private.invalid/'}]}),error=>{
  assert.equal(error.message,'Pinned browser capability call failed ['+category+']');return true;
 });
});
