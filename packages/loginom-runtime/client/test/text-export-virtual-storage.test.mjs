import test from 'node:test';
import assert from 'node:assert/strict';
import {findNativeStorageRow,waitForExportStorageObservation} from '../lib/text-export-output.mjs';
function fixture({start=0,at=1500,end=3000,stuck=false,changeFolder=false,changeOwner=false,delayed=false,outside=false,invalid,settle=true}={}){
 let top=start,moves=0,settled=true;const trace=[],sleeps=[];
 const workflow_ref={prefix:'MF;TF-1',tab_tid:'tab'},tid=workflow_ref.prefix+';FileStorageForm;colName_wanted.csv';
 const snapshot=elements=>({dom_epoch:{document:moves&&invalid==='document'?'foreign':'doc'},active_tab_ref:moves&&invalid==='tab'?'foreign':'tab',workflow_ref:moves&&invalid==='workflow'?{...workflow_ref,prefix:'MF;TF-2'}:workflow_ref,file_storage:{status:'observed',directory:moves&&(changeFolder||invalid==='directory')?'/other':'/test-2',rendered_window_ready:moves&&invalid==='missing'?undefined:settled},ui:{elements,dialogs:[],masks:[]}});
 const discovery=elements=>{const s=snapshot(elements);delete s.active_tab_ref;delete s.file_storage;s.observation_kind='roots';return s;};
 const anchor=()=>({ref:'anchor',tid:workflow_ref.prefix+';FileStorageForm;colName_anchor',scroll:{ref:moves&&(changeOwner||invalid==='owner')?'other':'owner',top,max_top:end},allowed_actions:outside&&!settled?[]:['scroll'],interaction:{state:outside&&!settled?'outside_viewport':'point_observed'}});
 const target=()=>({ref:'target',tid,label:'wanted.csv'});
 const read=async o=>o.storage_name?discovery(top>=at&&settled?[{...target(),label:''}]:[]):{...snapshot(o.root_ref==='target'?[target()]:moves&&invalid==='empty'?[]:[anchor()]),observation_root:{ref:moves&&invalid==='root'?'foreign':o.root_ref,identity:{anchor_tid:o.root_ref==='target'?tid:workflow_ref.prefix+';FileStorageForm;pnlFileStorage;tbl'}}};
 return {trace,sleeps,args:{name:'wanted.csv',read,roots:async()=>discovery([{ref:'table',tid:workflow_ref.prefix+';FileStorageForm;pnlFileStorage;tbl'}]),ready:(observe,condition)=>waitForExportStorageObservation({observe,condition,guard:()=>{},quiet:()=>true,sleep:async ms=>{sleeps.push(ms);if(settle)settled=true;}}),guard:()=>{},act:async(s,e,v,extra)=>{assert.equal(v,'scroll');assert.ok(Math.abs(extra.delta_y)<=1000);trace.push(extra.delta_y);moves++;if(delayed)settled=false;if(!stuck)top+=extra.delta_y;}}};
}
test('virtual file search renders a missing row with bounded scrolling',async()=>{const f=fixture();const r=await findNativeStorageRow(f.args);assert.equal(r.ui.elements[0].label,'wanted.csv');assert.deepEqual(f.trace,[1000,1000]);});
test('already rendered exact file needs no gesture',async()=>{const f=fixture({at:0});await findNativeStorageRow(f.args);assert.deepEqual(f.trace,[]);});
test('search resets an existing scroll before traversing',async()=>{const f=fixture({start:500,at:1500});await findNativeStorageRow(f.args);assert.deepEqual(f.trace,[-500,1000,1000]);});
for(const [label,options,error] of [['stuck',{stuck:true},/did not advance/],['folder',{changeFolder:true},/folder changed/],['owner',{changeOwner:true},/owner changed/],['end',{at:4000},{code:'STORAGE_ENTRY_UNAVAILABLE',storage_entry:{name:'wanted.csv',directory:'/test-2',reason:'folder_end'}}],['budget',{at:50000,end:50000},/budget exhausted/]])test('virtual search refuses '+label,async()=>{const f=fixture(options);await assert.rejects(findNativeStorageRow(f.args),error);assert.ok(f.trace.length<=12);});
test('cancelled search performs no gesture',async()=>{const f=fixture();f.args.guard=()=>{throw Error('cancelled');};await assert.rejects(findNativeStorageRow(f.args),/cancelled/);assert.deepEqual(f.trace,[]);});

test('search waits for the scrolled native window before finding the exact target',async()=>{const f=fixture({at:1000,delayed:true});const r=await findNativeStorageRow(f.args);assert.equal(r.ui.elements[0].label,'wanted.csv');assert.deepEqual(f.trace,[1000]);});

test('all outside name rows wait on their existing owner without another gesture',async()=>{const f=fixture({at:1000,delayed:true,outside:true});await findNativeStorageRow(f.args);assert.deepEqual(f.trace,[1000]);assert.deepEqual(f.sleeps,[100]);});

test('invalid pending bindings refuse before passive waiting',async()=>{for(const invalid of ['document','workflow','tab','directory','owner','root','empty','missing']){const f=fixture({delayed:true,invalid});await assert.rejects(findNativeStorageRow(f.args),/changed|unavailable|no_scroll_owner/,invalid);assert.deepEqual(f.trace,[1000],invalid);assert.deepEqual(f.sleeps,[],invalid);}});

test('unchanged complete window scrolls without waiting and pending timeout keeps existing bounds',async()=>{const complete=fixture();await findNativeStorageRow(complete.args);assert.deepEqual(complete.sleeps,[]);const pending=fixture({delayed:true,settle:false});await assert.rejects(findNativeStorageRow(pending.args),/did not settle/);assert.deepEqual(pending.trace,[1000]);assert.equal(pending.sleeps.length,100);assert.ok(pending.sleeps.every(ms=>ms===100));});

test('cancellation during pending readiness is guarded before the next sample',async()=>{const f=fixture({delayed:true,settle:false});f.args.guard=()=>{if(f.sleeps.length===1)throw Error('cancelled pending');};await assert.rejects(findNativeStorageRow(f.args),/cancelled pending/);assert.deepEqual(f.trace,[1000]);assert.deepEqual(f.sleeps,[100]);});

test('roots without tab or storage metadata bind to their actual detailed table',async()=>{
 const f=fixture({at:1000,delayed:true});
 const result=await findNativeStorageRow(f.args);
 assert.equal(result.ui.elements[0].label,'wanted.csv');assert.deepEqual(f.trace,[1000]);
});
