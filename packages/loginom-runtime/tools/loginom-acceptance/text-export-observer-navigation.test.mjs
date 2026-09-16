import test from 'node:test';import assert from 'node:assert/strict';
import {waitObserved} from './text-export-observer-native.mjs';
import {offlineProof} from './text-export-observer-offline.mjs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('read-only settling keeps original deadline and bounded 250ms frequency',async()=>{
 let time=0,reads=0;const deadline=1000;
 const value=await waitObserved({guard:()=>assert.ok(time<deadline),sample:async()=>++reads===3?'/test-2':'/',accept:s=>s==='/test-2',sleep:async ms=>{assert.equal(ms,250);time+=ms;}});
 assert.equal(value,'/test-2');assert.equal(reads,3);assert.equal(time,500);
 await assert.rejects(waitObserved({guard:()=>assert.ok(time<deadline),sample:async()=>false,accept:Boolean,sleep:async ms=>{time+=ms;}}));assert.equal(time,1000);
});
test('cancellation after any read or sleep cannot accept a late observation',async()=>{
 for(const at of ['sample','sleep']){const abort=new AbortController();let reads=0;
 await assert.rejects(waitObserved({guard:()=>abort.signal.throwIfAborted(),sample:async()=>{reads++;if(at==='sample')abort.abort();return at==='sample';},accept:Boolean,sleep:async()=>abort.abort()}));assert.equal(reads,1);}
});
test('foreign document, storage owner, path and dialog fail before dispatch',async t=>{
 for(const [index,change] of [[5,s=>s.dom_epoch.document='other'],[5,s=>s.workflow_ref.prefix='other'],[5,s=>s.file_storage.directory='/other'],[5,s=>s.ui.dialogs=['modal']],[12,s=>s.workflow_ref.tab_tid='other']]){
  const root=await mkdtemp(join(tmpdir(),'node17-navigation-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const r=await offlineProof(root,{changeResponse:(r,i)=>{if(i===index)change(r.output);return r;}});assert.equal(r.dispatched,0);assert.ok(r.error);
 }
});

test('delayed folder observation repeats only reads and dispatches once after one folder gesture',async t=>{
 const root=await mkdtemp(join(tmpdir(),'node17-settle-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const r=await offlineProof(root,{transformResponses:q=>{
  const clone=x=>structuredClone(x),old=clone(q[5]);old.output.file_storage.directory='/';
  const folder=clone(old);folder.output.ui.elements=[{tid:folder.output.workflow_ref.prefix+';FileStorageForm;colName_test-2',ref:'ui-folder',label:'test-2',allowed_actions:['double_click'],storage_entry:{kind:'folder'}}];
  return [...q.slice(0,4),clone(q[4]),clone(old),clone(folder),clone(folder),clone(q[3]),clone(q[4]),clone(old),clone(q[4]),clone(q[5]),...q.slice(6)];
 }});
 assert.equal(r.error,null);assert.equal(r.dispatched,1);
 const actions=(await readFile(join(root,'observer/observer-actions.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(e=>e.phase==='completed');
 assert.equal(actions.filter(e=>e.step.kind==='folder').length,1);assert.equal(actions.filter(e=>e.step.kind==='download').length,1);
 const folder=actions.findIndex(e=>e.step.kind==='folder');assert.deepEqual(actions.slice(folder+1,folder+5).map(e=>e.step.kind),['roots','root','roots','root']);
 assert.ok(actions[folder+3].mono_start-actions[folder+2].mono_end>=240);
});
