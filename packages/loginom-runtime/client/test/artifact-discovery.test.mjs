import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {discoverArtifactAndDownload} from '../lib/artifact-discovery.mjs';
function fixture(fault) {
 const moves=[];let top=0,downloads=0;
 const prefix='MF;TF-2',name='source.csv',fileTid=prefix+';FileStorageForm;colName_'+name;
 const snapshot={authenticated:true,origin:'https://test',loginom_build:'7.4.2',workflow_ref:{prefix},dom_epoch:{document:'doc',revision:1},
  active_tab_ref:'tab',package_identity:null,file_storage:{status:'observed',directory:'/user/dock-p3'},observation_root:{ref:'nav'},ui:{elements:[],masks:[],dialogs:[]}};
 const task={snapshot,artifact:{name,upload:{directory:'/user/dock-p3'}},expected_origin:'https://test',expected_build:'7.4.2',operation_id:'verify'};
 const owner={isConnected:true,scrollHeight:2500,clientHeight:500,contains:e=>e===owner,
  getBoundingClientRect:()=>({x:0,y:100,width:800,height:500}),get scrollTop(){return top;},set scrollTop(v){moves.push(v);top=v;}};
 const state={observer:{takeRecords:()=>[]},epoch:'doc',revision:1};
 const context=vm.createContext({document:{querySelectorAll:()=>fault==='owner'?[{}]:[owner],elementFromPoint:()=>fault==='blocked'?{}:owner},getComputedStyle:()=>({display:'block',visibility:'visible'})});
 context[Symbol.for('loginom-dock.workspace-ui.identity.v1')]=state;
 const page={waitForTimeout:async()=>{},locator:()=>({count:async()=>1,isVisible:async()=>true,elementHandle:async()=>({dispose:async()=>{},evaluate:async(fn,arg)=>{
   const result=vm.runInContext('('+fn.toString()+')',context)(owner,arg);
   if(fault==='lost_scroll')throw Error('Transport lost after movement');return result;
 }})})};
 const ui=async(p,options)=>{
  const s=structuredClone(snapshot);
  if(fault==='directory'&&moves.length)s.file_storage.directory='/foreign';
  if(options.discover_roots&&top>=1400&&fault!=='absent')s.ui.elements=[{tid:fileTid,ref:'file'}];
  if(options.root_ref==='file')s.ui.elements=[{tid:fileTid,ref:'file',label:name}];
  return {status:'SUCCEEDED',output:s};
 };
 const download=async(p,t)=>{downloads++;assert.equal(t.file_ref,'file');assert.equal(t.snapshot.ui.elements[0].label,name);
  if(fault==='lost_download')throw Error('Lost downloader response');
  return {status:'SUCCEEDED',effect_possible:true,cleanup_complete:true,trace:[{event:'download_saved'}]};};
 return {run:()=>discoverArtifactAndDownload(page,task,ui,download,()=>{}),moves,get downloads(){return downloads;}};
}
test('private discovery reveals a buffered authorized row and delegates exactly one download',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.status,'SUCCEEDED');assert.deepEqual(f.moves,[700,1400]);assert.equal(f.downloads,1);
 assert.equal(r.trace.filter(e=>e.event==='artifact_discovery_scroll').length,2);assert.equal(r.trace.at(-1).event,'download_saved');
});
for(const fault of ['owner','blocked','directory','absent','lost_scroll','lost_download'])test('discovery preserves '+fault+' without another download',async()=>{
 const f=fixture(fault),r=await f.run();assert.notEqual(r.status,'SUCCEEDED');assert.ok(f.downloads<=1);
 if(['owner','blocked'].includes(fault)){assert.equal(r.effect_possible,false);assert.deepEqual(f.moves,[]);}
 if(['lost_scroll','lost_download'].includes(fault)){assert.equal(r.status,'AMBIGUOUS');assert.equal(r.cleanup_complete,false);}
});

test('host accepts a discovered reference only for the prepared document tab workflow and file',async()=>{
 const {verifiedDiscoveryReference}=await import('../lib/artifact-discovery.mjs');
 const artifact={name:'input.csv',upload:{directory:'/user/dock-p3'}};
 const binding={document:'doc',active_tab_ref:'tab',workflow_ref:{prefix:'MF;TF-2'}};
 const raw={output:{file_ref:'ui-file'},trace:[{event:'artifact_file_discovered',file_ref:'ui-file',file_tid:'MF;TF-2;FileStorageForm;colName_input.csv',
  directory:'/user/dock-p3',...binding}]};
 assert.equal(verifiedDiscoveryReference(artifact,binding,raw),'ui-file');
 for(const key of ['file_ref','file_tid','directory','document','active_tab_ref','workflow_ref']){
  const changed=structuredClone(raw);changed.trace[0][key]='foreign';assert.throws(()=>verifiedDiscoveryReference(artifact,binding,changed),/not bound/);
 }
 const duplicate=structuredClone(raw);duplicate.trace.push(duplicate.trace[0]);assert.throws(()=>verifiedDiscoveryReference(artifact,binding,duplicate));
});
