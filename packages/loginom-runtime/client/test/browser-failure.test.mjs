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

for(const reason of ['owner','dialog','attempted','capacity','awaiting_original_attempt'])
 test('connection guard refusal retains only its fixed reason: '+reason,()=>{
  assert.throws(()=>parseCapabilityResult({isError:true,content:[{type:'text',text:
   'Error: Loginom connection is disconnected; original session recovery unverified ('+reason+'); inspect the pending operation before continuing\npassword=PRIVATE'}]}),error=>{
    assert.equal(error.message,'Pinned browser capability call failed [LOGINOM_DISCONNECTED] (reason='+reason+')');
    return true;
  });
 });

for(const exception of ['ReferenceError','TypeError','SyntaxError','RangeError'])
 test('script exception retains a fixed name without page values: '+exception,()=>{
  assert.throws(()=>parseCapabilityResult({isError:true,content:[{type:'text',text:exception+': PRIVATE secret bytes https://private.invalid/'}]}),
   {message:'Pinned browser capability call failed [BROWSER_SCRIPT_ERROR] (exception='+exception+')'});
 });
test('unrecognized connection reason is never echoed',()=>{
 assert.throws(()=>parseCapabilityResult({isError:true,content:[{type:'text',text:
  'Loginom connection is disconnected; original session recovery unverified (PRIVATE)'}]}),
  {message:'Pinned browser capability call failed [LOGINOM_DISCONNECTED]'});
});

test('browser transport diagnostics retain the bounded original cause privately',()=>{
 const text='Error: socket peer reset password=PRIVATE';
 assert.throws(()=>parseCapabilityResult({isError:true,content:[{type:'text',text}]}),error=>{
  assert.equal(error.message,'Pinned browser capability call failed [UNCLASSIFIED_BROWSER_ERROR]');
  assert.equal(error.cause.message,text);
  return true;
 });
});
