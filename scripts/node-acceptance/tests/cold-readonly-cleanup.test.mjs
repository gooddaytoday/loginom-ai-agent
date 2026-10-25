import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makePackageCleanupCode} from '../../../packages/loginom-runtime/client/lib/package-cleanup.mjs';

// Exercise the actual cold finally block after the saved readonly refusal.
// Native identity/dirty/foreign-package guards are covered by package-cleanup.test.
const source=await readFile(new URL('../cold-check.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('} finally {\n  // Cold teardown:')+11,source.indexOf('\nasync function loadSaved'));
const run=new (Object.getPrototypeOf(async function(){}).constructor)('f',
 `const {state,saved,session,config,makePackageCleanupCode,makeFailedOpenCleanupCode,makeColdOpenDiagnosticCode,rawExecute,record,page,writeFile,join,args,context}=f;const signals=[],handlers=[];const process={off(){}};${body.slice(0,body.lastIndexOf('}'))}`);
const path='/own/saved.lgp';

const catchStart=source.indexOf('} catch(error) {\n  state.failure=');
const catchEnd=source.indexOf('} finally {\n  // Cold teardown:',catchStart);
const handleFailure=new Function('state','config','loginPassword','error',source.slice(catchStart+'} catch(error) {'.length,catchEnd));
for(const scenario of ['fallback error','prepared reason','preclassified reason'])test('cold refusal redacts known secrets before recording '+scenario,async()=>{
 const {makeFailedOpenCleanupCode,makeColdOpenDiagnosticCode}=await import('../../../packages/loginom-runtime/client/lib/package-cleanup.mjs');
 const config={api_key:'SYNTHETIC_API_KEY_CANARY',loginom_url:'http://loginom.invalid/app/',workflow_profile:{loginom_user:'own'}};
 const loginPassword='SYNTHETIC_PASSWORD_CANARY',reason=`Open failed: ${config.api_key}; ${loginPassword}`;
 const error=Error(reason),state={openAttempted:true,openDeadline:Date.now()};
 if(scenario==='prepared reason')state.prepared={status:'NOT_READY',reason,effect_possible:true};
 if(scenario==='preclassified reason'){
  state.prepared={status:'NOT_READY',reason,effect_possible:true};
  state.openFailure={status:'NOT_READY',reason};
 }
 assert.throws(()=>handleFailure(state,config,loginPassword,error),e=>e===error);
 const writes=new Map(),records=[];
 await run({state,saved:{path},session:'own-session',config,makePackageCleanupCode,makeFailedOpenCleanupCode,makeColdOpenDiagnosticCode,page:{},
  rawExecute:async()=>({status:'BLOCKED',reason:'FAILED_OPEN_OWNER_UNCONFIRMED',package_closed:false,logged_out:false}),
  record:async event=>records.push(event),writeFile:async(name,body)=>writes.set(name,JSON.parse(body)),join:(...p)=>p.join('/'),
  args:{output:'cold'},context:{close:async()=>{}}});
 const result=writes.get('cold/result.json'),redacted='Open failed: [REDACTED]; [REDACTED]';
 assert.equal(result.error,redacted);assert.equal(result.reason,redacted);assert.equal(result.open_failure.reason,redacted);
 assert.equal(result.status,'FAIL');assert.equal(result.cleanup.status,'BLOCKED');
 const recorded=JSON.stringify({result,records});
 assert.ok(!recorded.includes(config.api_key)&&!recorded.includes(loginPassword));
});

const prepared={status:'READY',document_id:'own-document',package_ref:{path},workflow_ref:{tab_tid:'own-tab',
 navigation_path:[{label:'Saved (только чтение)'}]}};

for(const scenario of ['readonly','foreign path','dirty readonly','writable'])test('cold failure cleanup: '+scenario,async()=>{
 const state={prepared:structuredClone(prepared),closed:false,cleanupAttempted:false,failure:'COLD_PACKAGE_NOT_WRITABLE'};
 if(scenario==='foreign path')state.prepared.package_ref.path='/foreign/other.lgp';
 if(scenario==='writable')state.prepared.workflow_ref.navigation_path[0].label='Saved';
 const writes=new Map(),calls=[];let closed=false;
 await run({state,saved:{path},session:'own-session',config:{loginom_url:'https://loginom.invalid/app/',workflow_profile:{loginom_user:'own'}},
  makePackageCleanupCode,rawExecute:async code=>{
   const [options]=JSON.parse('['+code.slice(code.lastIndexOf(')(page,')+7,-1)+']');
   calls.push(options);
   assert.equal(options.documentId,'own-document');assert.equal(options.tabTid,'own-tab');assert.equal(options.packagePath,path);
   const readonly=scenario!=='writable';
   const reason=options.diagnosticReadOnly!==readonly?'PACKAGE_IDENTITY_CHANGED':scenario==='dirty readonly'?'UNSAVED_CHANGES':null;
   return {status:reason?'BLOCKED':'SUCCEEDED',reason,package_closed:!reason,logged_out:!reason,unsaved_changes_discarded:false};
  },writeFile:async(name,body)=>writes.set(name,JSON.parse(body)),join:(...p)=>p.join('/'),args:{output:'cold'},context:{close:async()=>{closed=true;}}});
 assert.equal(closed,true);
 assert.equal(calls.length,scenario==='foreign path'?0:1);
 const result=writes.get('cold/result.json');
 assert.equal(result.status,'FAIL');assert.equal(result.error,'COLD_PACKAGE_NOT_WRITABLE');
 assert.equal(result.cleanup.package_closed,['readonly','writable'].includes(scenario));
 assert.equal(result.cleanup.logged_out,result.cleanup.package_closed);
 if(scenario!=='foreign path'){
  assert.equal(calls[0].diagnosticReadOnly,scenario!=='writable');
  if(scenario!=='writable'){assert.equal(calls[0].diagnosticDiscard,false);assert.equal(calls[0].diagnosticWaitForIdle,false);}
 }
});

for(const scenario of ['clean','dirty','foreign','expired','already dispatched'])test('cancelled cold retains dirty/unknown guards: '+scenario,async()=>{
 const state={prepared:structuredClone(prepared),cancelled:'SIGINT',failure:'COLD_CANCELLED',
  cleanupExpired:scenario==='expired',cleanupAttempted:scenario==='already dispatched'};
 state.prepared.workflow_ref.navigation_path[0].label='Saved';
 if(scenario==='foreign')state.prepared.package_ref.path='/foreign/other.lgp';
 const writes=new Map(),events=[];
 await run({state,saved:{path},session:'own-session',config:{loginom_url:'https://loginom.invalid/app/',workflow_profile:{loginom_user:'own'}},
  makePackageCleanupCode,rawExecute:async code=>{
   const [options]=JSON.parse('['+code.slice(code.lastIndexOf(')(page,')+7,-1)+']');events.push('native-cleanup');
   assert.equal(options.diagnosticDiscard,false);assert.equal(options.diagnosticWaitForIdle,false);
   return {status:scenario==='dirty'?'BLOCKED':'SUCCEEDED',reason:scenario==='dirty'?'UNSAVED_CHANGES':null,
    package_closed:scenario!=='dirty',logged_out:scenario!=='dirty'};
  },writeFile:async(name,body)=>writes.set(name,JSON.parse(body)),join:(...p)=>p.join('/'),args:{output:'cold'},
  context:{close:async()=>events.push('browser')}});
 assert.deepEqual(events,['clean','dirty'].includes(scenario)?['native-cleanup','browser']:['browser']);
 if(scenario==='expired')assert.equal(writes.size,0,'finally must not overwrite the watchdog failure');
 else {
  const result=writes.get('cold/result.json');assert.equal(result.error,'COLD_CANCELLED');
  assert.equal(result.cleanup.package_closed,scenario==='clean');
  assert.equal(result.cancellation.lock_may_remain,scenario!=='clean');
  if(scenario==='dirty')assert.equal(writes.get('cold/cleanup.json').reason,'UNSAVED_CHANGES');
 }
});

const refusalStart=source.indexOf('  if (\n    prepared.status !== "READY"');
const refusalEnd=source.indexOf('\n\n  const origin',refusalStart);
const classify=new Function('prepared','saved','state',source.slice(refusalStart,refusalEnd));
for(const kind of ['rejected','foreign','readonly'])test('D56c cold Open keeps the exact refusal class: '+kind,()=>{
 const p=kind==='rejected'?{status:'NOT_READY',reason:'PACKAGE_OPEN_REJECTED',effect_possible:true}:structuredClone(prepared);
 if(kind==='foreign')p.package_ref.path='/foreign/other.lgp';
 const state={};let error;
 try{classify(p,{path},state);}catch(e){error=e;}
 assert.equal(error?.message,{rejected:'COLD_PACKAGE_OPEN_NOT_READY',foreign:'COLD_PACKAGE_PATH_MISMATCH',readonly:'COLD_PACKAGE_NOT_WRITABLE'}[kind]);
 assert.equal(state.openFailure?.reason,kind==='rejected'?'PACKAGE_OPEN_REJECTED':kind==='foreign'?'PACKAGE_PATH_MISMATCH':'PACKAGE_READ_ONLY');
});

for(const scenario of ['clean writer','dirty writer','no effect','transport lost','journal failure'])test('D56c saved rejected Open runs guarded cleanup before browser: '+scenario,async()=>{
 const {makeFailedOpenCleanupCode,makeColdOpenDiagnosticCode}=await import('../../../packages/loginom-runtime/client/lib/package-cleanup.mjs');
 // Same refusal shape as LAB-138 q5-base cold-execution-events.jsonl:1.
 const state={prepared:{status:'NOT_READY',reason:'PACKAGE_OPEN_REJECTED',effect_possible:scenario!=='no effect'},
  openFailure:{status:'NOT_READY',reason:'PACKAGE_OPEN_REJECTED'},failure:'COLD_PACKAGE_OPEN_NOT_READY'};
 const events=[],writes=new Map();
 await run({state,saved:{path},session:'own-session',page:{},config:{loginom_url:'http://loginom.invalid/app/',workflow_profile:{loginom_user:'own'}},
  makePackageCleanupCode,makeFailedOpenCleanupCode,makeColdOpenDiagnosticCode,
  record:async()=>{events.push('diagnostic');if(scenario==='journal failure')throw Error('journal unavailable');},
  rawExecute:async code=>{
   assert.match(code,/bindFailedOpen/);assert.match(code,/diagnosticDiscard":false/);events.push('native');
   if(scenario==='transport lost')throw Error('transport unavailable');
   return {status:scenario==='dirty writer'?'BLOCKED':'SUCCEEDED',reason:scenario==='dirty writer'?'UNSAVED_CHANGES':null,
    package_closed:scenario!=='dirty writer',logged_out:scenario!=='dirty writer',unsaved_changes_discarded:false};
  },writeFile:async(name,body)=>writes.set(name,JSON.parse(body)),join:(...p)=>p.join('/'),args:{output:'cold'},
  context:{close:async()=>events.push('browser')}});
 assert.deepEqual(events,scenario==='no effect'?['diagnostic','browser']:['diagnostic','native','browser']);
 const result=writes.get('cold/result.json');assert.equal(result.error,'COLD_PACKAGE_OPEN_NOT_READY');
 assert.equal(result.reason,'PACKAGE_OPEN_REJECTED');assert.equal(result.status,'FAIL');
 assert.equal(result.cleanup.package_closed,['clean writer','journal failure'].includes(scenario));
 if(scenario==='dirty writer')assert.equal(result.cleanup.reason,'UNSAVED_CHANGES');
 if(scenario==='transport lost')assert.equal(result.cleanup.status,'BLOCKED');
});

test('D56c slow Open diagnostics cannot hold cleanup beyond the remaining read budget',async()=>{
 const {makeFailedOpenCleanupCode,makeColdOpenDiagnosticCode}=await import('../../../packages/loginom-runtime/client/lib/package-cleanup.mjs');
 const state={prepared:{status:'NOT_READY',reason:'PACKAGE_OPEN_REJECTED',effect_possible:true},
  openFailure:{status:'NOT_READY',reason:'PACKAGE_OPEN_REJECTED'},openDeadline:Date.now()+20,failure:'COLD_PACKAGE_OPEN_NOT_READY'};
 const events=[],writes=new Map();let snapshot;
 await run({state,saved:{path},session:'own-session',page:{},config:{loginom_url:'http://loginom.invalid/app/',workflow_profile:{loginom_user:'own'}},
  makePackageCleanupCode,makeFailedOpenCleanupCode,makeColdOpenDiagnosticCode,
  record:async e=>{snapshot=e.snapshot;events.push('diagnostic');},rawExecute:async code=>{
   if(code.includes('readColdOpenFailure'))return new Promise(()=>{});
   events.push('native');return {status:'SUCCEEDED',reason:null,package_closed:true,logged_out:true};
  },writeFile:async(name,body)=>writes.set(name,JSON.parse(body)),join:(...p)=>p.join('/'),args:{output:'cold'},
  context:{close:async()=>events.push('browser')}});
 assert.deepEqual(events,['diagnostic','native','browser']);
 assert.equal(snapshot.status,'unavailable');assert.equal(snapshot.reason,'diagnostic_timeout');
 assert.equal(writes.get('cold/result.json').cleanup.package_closed,true);
});
