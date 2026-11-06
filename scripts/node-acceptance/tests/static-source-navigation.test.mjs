import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyStaticSourceBytes} from '../static-source-proof.mjs';
// LAB-859 cold.execution-events.jsonl:77–79: own folder at epoch 12560,
// double_click refused before any effect at epoch 12586. Exercise the real
// storage row finder and cold source verifier; only browser transport is replayed.
function storageNavigation({receipt={},refusals=1,changed}={}){
 const account='lab-own',prefix='MF;TF-2',calls=[],observations=[];
 let opened=false,sequence=0;
 const runtime={
  async observe(options){
   observations.push(structuredClone(options));
   const fresh=calls.length>0,ref=fresh?'fresh-folder':'old-folder';
   const folder={ref,tid:prefix+';FileStorageForm;colName_'+account,label:account,
    storage_entry:{kind:'folder'},allowed_actions:['click','double_click'],interaction:{state:'point_observed'}};
   const bar={ref:'bar',tid:prefix+';NavigationBar;NavigationPanel'};
   const output={observation_id:'observation-'+(++sequence),dom_epoch:{document:'own-document',revision:fresh?12586:12560},
    workflow_ref:{tab_tid:'own-files-tab',prefix},package_identity:null,authenticated:true,
    origin:'https://app.loginom.ai/',loginom_build:'7.4.2',
    file_storage:{status:'observed',directory:opened?'/'+account:'/'},
    ui:{elements:options.rootRef==='bar'?[bar]:options.storageName||options.rootRef===ref?[folder]:[bar,folder],dialogs:[],masks:[]}};
   if(fresh&&!opened&&changed)changed(output);
   return {status:'SUCCEEDED',output};
  },
  async uiAct(action,options){
   calls.push({action,options,observations:observations.length});
   assert.equal(action.verb,'double_click');
   assert.equal(action.ref,calls.length===1?'old-folder':'fresh-folder');
   assert.equal(options.observationId,'observation-'+sequence);
   if(calls.length<=refusals)return {status:'NOT_APPLIED',phase:'preconditions',effect_possible:false,
    cleanup_complete:true,error:{code:'UI_EPOCH_CHANGED'},...receipt};
   opened=true;return {status:'SUCCEEDED',cleanup_complete:true};
  }
 };
 return {calls,observations,run:()=>verifyStaticSourceBytes({runtime,account,origin:'https://app.loginom.ai',sources:{imports:[]},
  load:path=>import(new URL('../../../packages/loginom-runtime/'+path,import.meta.url))})};
}

test('cold own folder epoch refusal observes again and retries the same gesture with a fresh ref',async()=>{
 const f=storageNavigation();
 assert.equal((await f.run()).size,0);
 assert.equal(f.calls.length,2);
 assert.ok(f.calls[1].observations>f.calls[0].observations);
 assert.notEqual(f.calls[1].options.observationId,f.calls[0].options.observationId);
 assert.notEqual(f.calls[1].options.operationId,f.calls[0].options.operationId);
 assert.equal(f.calls[1].action.ref,'fresh-folder');
});

test('cold own folder retries at most once and retains the navigation refusal',async()=>{
 const f=storageNavigation({refusals:2});
 await assert.rejects(f.run(),/COLD_SOURCE:storage navigation uncertain/);
 assert.equal(f.calls.length,2);
});

for(const receipt of [
 {error:{code:'UI_CONTROL_CHANGED'}},{status:'AMBIGUOUS'},{phase:'completed'},
 {effect_possible:true},{cleanup_complete:false}
])test('cold folder does not retry other or uncertain refusals '+JSON.stringify(receipt),async()=>{
 const f=storageNavigation({receipt});
 await assert.rejects(f.run(),/COLD_SOURCE:storage navigation uncertain/);
 assert.equal(f.calls.length,1);
});

for(const [name,changed] of Object.entries({
 document:s=>s.dom_epoch.document='foreign-document',
 origin:s=>s.origin='https://foreign.example/',
 build:s=>s.loginom_build='other-build',
 authentication:s=>s.authenticated=false,
 workflow:s=>s.workflow_ref.tab_tid='foreign-tab',
 directory:s=>s.file_storage.directory='/foreign',
 package:s=>s.package_identity={name:'foreign'},
 dialog:s=>s.ui.dialogs.push({ref:'foreign-dialog'}),
 mask:s=>s.ui.masks.push({kind:'busy'}),
 folder:s=>{for(const e of s.ui.elements)if(e.storage_entry)e.label='foreign-folder';},
 missing:s=>{s.ui.elements=s.ui.elements.filter(e=>!e.storage_entry);},
 kind:s=>{for(const e of s.ui.elements)if(e.storage_entry)e.storage_entry.kind='file';},
 gesture:s=>{for(const e of s.ui.elements)if(e.storage_entry)e.allowed_actions=['click'];}
}))test('cold folder refresh refuses a changed '+name+' before retrying',async()=>{
 const f=storageNavigation({changed});
 await assert.rejects(f.run(),/COLD_SOURCE:storage owner changed|COLD_SOURCE:storage navigation uncertain|Export file name changed/);
 assert.equal(f.calls.length,1);
});

test('cold own folder success uses just one gesture',async()=>{
 const f=storageNavigation({refusals:0});
 await f.run();assert.equal(f.calls.length,1);
});
