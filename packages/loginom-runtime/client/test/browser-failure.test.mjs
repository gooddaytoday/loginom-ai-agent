import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCapabilityResult} from '../lib/executor.mjs';
import {operationFailureDiagnostic} from '../lib/browser-failure.mjs';
import {createExecutionJournal} from '../lib/execution-journal.mjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('private operation diagnostics retain fixed causes and omit arbitrary error text',()=>{
 assert.deepEqual(operationFailureDiagnostic(Error('Pinned browser capability call failed [BROWSER_SCRIPT_ERROR] (exception=TypeError)')),
  {code:'BROWSER_SCRIPT_ERROR',detail:'exception=TypeError',exception:'Error'});
 assert.deepEqual(operationFailureDiagnostic(new TypeError('PRIVATE password=HIDDEN https://private.invalid/')),
  {code:'UNCLASSIFIED_ERROR',detail:null,exception:'TypeError'});
 assert.deepEqual(operationFailureDiagnostic(Object.assign(Error('Private failure'),{cause:Error('SECRET')})),
  {code:'UNCLASSIFIED_ERROR',detail:null,exception:'Error'});
 assert.equal(operationFailureDiagnostic(Error('LOGINOM_FILE_CHANGED')).code,'LOGINOM_FILE_CHANGED');
});
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

test('private transport journal redacts the retained cause and keeps the public refusal fixed',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'upload-cause-'));
 try{
  const record=createExecutionJournal({directory,metadata:{sessionId:'test'},knownSecrets:['PRIVATE']});
  let failure;
  try{parseCapabilityResult({isError:true,content:[{type:'text',text:'Error: peer reset password=PRIVATE'}]});}
  catch(error){failure=error;}
  await record({phase:'artifact_upload_transport_failed',cause:operationFailureDiagnostic(failure,{uploadCause:true})});
  const text=await readFile(join(directory,'execution-events.jsonl'),'utf8');
  assert.ok(!text.includes('PRIVATE'));
  const cause=JSON.parse(text).cause;
  assert.equal(cause.name,'Error');
  assert.equal(cause.code,'UNCLASSIFIED_BROWSER_ERROR');
  assert.equal(cause.detail,null);
  assert.match(cause.original_message,/^Error: peer reset password=\s*\[redacted\]$/);
  assert.equal(failure.message,'Pinned browser capability call failed [UNCLASSIFIED_BROWSER_ERROR]');
 }finally{await rm(directory,{recursive:true,force:true});}
});
