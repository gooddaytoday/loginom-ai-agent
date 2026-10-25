import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makePackageCleanupCode} from '../../../packages/loginom-runtime/client/lib/package-cleanup.mjs';

// Exercise the actual cold finally block after the saved readonly refusal.
// Native identity/dirty/foreign-package guards are covered by package-cleanup.test.
const source=await readFile(new URL('../cold-check.mjs',import.meta.url),'utf8');
const body=source.slice(source.indexOf('} finally {\n  // Cold teardown:')+11,source.indexOf('\nasync function loadSaved'));
const run=new (Object.getPrototypeOf(async function(){}).constructor)('f',
 `const {state,saved,session,config,makePackageCleanupCode,rawExecute,writeFile,join,args,context}=f;const signals=[],handlers=[];const process={off(){}};${body.slice(0,body.lastIndexOf('}'))}`);
const path='/own/saved.lgp';
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
