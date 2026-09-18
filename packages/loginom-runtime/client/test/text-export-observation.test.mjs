import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForExportStorageObservation,navigateExportDirectory,downloadExportWithFreshObservation,retainedExportStorageTab} from '../lib/text-export-output.mjs';

test('retained Files tab requires the same document and actual issued element',()=>{
 const tab={ref:'ui-owned-tab',tid:'MF;t.br;tb-3',allowed_actions:['click']},snapshot={dom_epoch:{document:'browser-doc'},ui:{elements:[tab]}},retained={document_id:'package-doc',document:'browser-doc',ref:tab.ref,tid:tab.tid};
 assert.equal(retainedExportStorageTab(snapshot,retained,'package-doc'),tab);
 for(const change of [s=>s.dom_epoch.document='other',s=>s.ui.elements[0].ref='recreated',s=>s.ui.elements[0].allowed_actions=[],s=>s.ui.elements.push({...s.ui.elements[0]})]){
  const different=structuredClone(snapshot);change(different);assert.equal(retainedExportStorageTab(different,retained,'package-doc'),null);
 }
 assert.equal(retainedExportStorageTab(snapshot,retained,'other-package'),null);
 assert.equal(retainedExportStorageTab(snapshot,null,'package-doc'),null);
});

const stale=()=>Object.assign(Error('detached read root'),{code:'UI_ROOT_STALE'});
test('export reobserves fresh roots after a stale detail without repeating navigation',async()=>{
 let reads=0,waits=0;
 const result=await waitForExportStorageObservation({observe:async()=>{if(++reads===1)throw stale();return {directory:'/mimo/run',quiet:true};},
  condition:s=>s.directory==='/mimo/run',quiet:s=>s.quiet,guard:()=>{},sleep:async()=>{waits++;}});
 assert.equal(result.directory,'/mimo/run');assert.equal(reads,2);assert.equal(waits,1);
});
test('export stale-read retries are bounded and other failures propagate immediately',async()=>{
 for(const code of ['UI_ROOT_STALE','EXPORT_DOCUMENT_CHANGED','UI_BROWSER_CALL_FAILED']){
  let reads=0;
  await assert.rejects(waitForExportStorageObservation({observe:async()=>{reads++;throw Object.assign(Error(code),{code});},
   condition:()=>true,quiet:()=>true,guard:()=>{},sleep:async()=>{}}),new RegExp(code));
  assert.equal(reads,code==='UI_ROOT_STALE'?4:1);
 }
});
test('export never accepts the wrong folder or a masked observation after a fresh read',async()=>{
 let reads=0;
 const result=await waitForExportStorageObservation({observe:async()=>[{}, {directory:'/foreign',quiet:true},{directory:'/mimo/run',quiet:false},{directory:'/mimo/run',quiet:true}][reads++],
  condition:s=>s.directory==='/mimo/run',quiet:s=>s.quiet,guard:()=>{},sleep:async()=>{}});
 assert.equal(reads,4);assert.equal(result.directory,'/mimo/run');
});
test('export accepts native tab reuse only at the exact destination without reopening folders',async()=>{
 for(const reuse of [false,true]){
  let directory='/',prefix='MF;TF-4';const gestures=[];
  const state=(elements=[])=>({file_storage:{status:'observed',directory},workflow_ref:{prefix},ui:{elements}});
  const result=await navigateExportDirectory({directory:'/mimo/run',
   inDirectory:async expected=>{assert.ok(!expected||expected.includes(directory));return state();},
   row:async name=>state([{tid:prefix+';FileStorageForm;colName_'+name,label:name,storage_entry:{kind:'folder'}}]),
   act:async(s,e,verb)=>{assert.equal(verb,'double_click');gestures.push(e.label);directory=directory==='/'?'/mimo':'/mimo/run';if(reuse){directory='/mimo/run';prefix='MF;TF-3';}}});
  assert.equal(result.file_storage.directory,'/mimo/run');assert.deepEqual(gestures,reuse?['mimo']:['mimo','run']);
 }
});
test('export refuses a restored unrelated folder before any additional navigation',async()=>{
 let directory='/',clicks=0;
 const state=()=>({file_storage:{status:'observed',directory},workflow_ref:{prefix:'MF;TF-4'},ui:{elements:[{tid:'MF;TF-4;FileStorageForm;colName_mimo',label:'mimo',storage_entry:{kind:'folder'}}]}});
 await assert.rejects(navigateExportDirectory({directory:'/mimo/run',
  inDirectory:expected=>waitForExportStorageObservation({observe:async()=>state(),condition:s=>!expected||expected.includes(s.file_storage.directory),quiet:()=>true,guard:()=>{},sleep:async()=>{}}),
  row:async()=>state(),act:async()=>{clicks++;directory='/mimo/other';}}),/did not settle/);
 assert.equal(clicks,1);
});
test('third export resumes from a confirmed reused root and rejects navigation cycles',async()=>{
 for(const cycle of [false,true]){
  let directory='/',prefix='MF;TF-5',count=0;const clicked=[];
  const state=elements=>({file_storage:{status:'observed',directory},workflow_ref:{prefix},ui:{elements:elements??[]}});
  const run=navigateExportDirectory({directory:'/mimo/run',
   inDirectory:async(expected,previous)=>{assert.ok(!expected||expected.includes(directory));if(previous)assert.ok(previous.file_storage.directory!==directory||previous.workflow_ref.prefix!==prefix);return state();},
   row:async name=>state([{tid:prefix+';FileStorageForm;colName_'+name,label:name,storage_entry:{kind:'folder'}}]),
   act:async(s,e,verb)=>{
    assert.equal(verb,'double_click');clicked.push([prefix,directory,e.label]);count++;
    if(count===1)directory='/mimo';
    else if(count===2){directory='/';prefix=cycle?'MF;TF-5':'MF;TF-4';}
    else if(count===3)directory='/mimo';
    else {directory='/mimo/run';prefix='MF;TF-3';}
   }});
  if(cycle){await assert.rejects(run,/navigation cycle/);assert.equal(count,2);}
  else {assert.equal((await run).file_storage.directory,'/mimo/run');assert.deepEqual(clicked.map(x=>x[2]),['mimo','run','mimo','run']);}
 }
});
function downloadFixture(){
 const file={ref:'file',tid:'file-tid',label:'result.csv',storage_entry:{bytes:123}};
 const snapshot={authenticated:true,origin:'http://loginom',loginom_build:'7.4.2',dom_epoch:{document:'doc',revision:1},workflow_ref:{prefix:'TF3'},active_tab_ref:'tab3',package_identity:null,file_storage:{status:'observed',directory:'/mimo/run'},ui:{elements:[file],dialogs:[],masks:[]}};
 const refusal={status:'NOT_APPLIED',effect_possible:false,cleanup_complete:true,error:{code:'DOWNLOAD_CONTEXT_CHANGED'},trace:[{event:'download_context_refused',checks:Object.fromEntries(['observation','authenticated','origin','build','workflow','tab','package','storage','dialogs','masks'].map(k=>[k,true]).concat([['epoch',false]]))}]};
 return {file,snapshot,refusal};
}
test('export download refreshes only a confirmed epoch-only refusal before any gesture',async()=>{
 const f=downloadFixture(),attempts=[];let refreshes=0;
 const result=await downloadExportWithFreshObservation({...f,guard:()=>{},refresh:async()=>{refreshes++;return {...f.snapshot,dom_epoch:{document:'doc',revision:2}};},download:async(s,e,index)=>{attempts.push([index,s.dom_epoch.revision]);return index?{status:'SUCCEEDED'}:f.refusal;}});
 assert.equal(result.status,'SUCCEEDED');assert.equal(refreshes,1);assert.deepEqual(attempts,[[0,1],[1,2]]);
});
test('export download never repeats an unknown result, possible effect or other context change',async()=>{
 for(const change of [r=>r.status='AMBIGUOUS',r=>r.effect_possible=true,r=>r.cleanup_complete=false,r=>r.trace[0].checks.workflow=false,r=>r.trace=[],r=>r.error.code='DOWNLOAD_EVENT_MISSING']){
  const f=downloadFixture();change(f.refusal);let attempts=0;
  const result=await downloadExportWithFreshObservation({...f,guard:()=>{},refresh:async()=>{assert.fail('Unsafe refresh');},download:async()=>{attempts++;return f.refusal;}});
  assert.equal(result,f.refusal);assert.equal(attempts,1);
 }
});
test('export download refresh rejects changed file bytes, folder, document or identity',async()=>{
 for(const change of [s=>s.ui.elements[0].storage_entry.bytes++,s=>s.file_storage.directory='/mimo/other',s=>s.dom_epoch.document='other',s=>s.ui.elements[0].ref='new']){
  const f=downloadFixture();let attempts=0;const fresh=structuredClone(f.snapshot);change(fresh);
  await assert.rejects(downloadExportWithFreshObservation({...f,guard:()=>{},refresh:async()=>fresh,download:async()=>{attempts++;return f.refusal;}}),/target changed/);assert.equal(attempts,1);
 }
});
test('export download epoch refresh is bounded',async()=>{
 const f=downloadFixture();let attempts=0;
 await downloadExportWithFreshObservation({...f,guard:()=>{},refresh:async()=>f.snapshot,download:async()=>{attempts++;return f.refusal;}});
 assert.equal(attempts,3);
});
