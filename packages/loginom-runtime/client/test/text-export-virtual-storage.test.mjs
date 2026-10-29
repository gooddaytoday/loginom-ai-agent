import test from 'node:test';
import assert from 'node:assert/strict';
import {findNativeStorageRow,waitForExportStorageObservation} from '../lib/text-export-output.mjs';
function fixture({start=0,at=1500,end=3000,stuck=false,changeFolder=false,changeOwner=false,delayed=false,outside=false,invalid,settle=true}={}){
 let top=start,moves=0,settled=true;const trace=[],sleeps=[],observations=[];
 const workflow_ref={prefix:'MF;TF-1',tab_tid:'tab'},tid=workflow_ref.prefix+';FileStorageForm;colName_wanted.csv';
 const snapshot=elements=>({dom_epoch:{document:moves&&invalid==='document'?'foreign':'doc',revision:observations.length},active_tab_ref:moves&&invalid==='tab'?'foreign':'tab',workflow_ref:moves&&invalid==='workflow'?{...workflow_ref,prefix:'MF;TF-2'}:workflow_ref,file_storage:{status:'observed',directory:moves&&(changeFolder||invalid==='directory')?'/other':'/test-2',rendered_window_ready:moves&&invalid==='missing'?undefined:settled},ui:{elements,dialogs:[],masks:[]}});
 const discovery=elements=>{const s=snapshot(elements);delete s.active_tab_ref;delete s.file_storage;s.observation_kind='roots';return s;};
 const anchor=()=>({ref:'anchor',tid:workflow_ref.prefix+';FileStorageForm;colName_anchor',scroll:moves&&invalid==='scroll'?undefined:{ref:moves&&(changeOwner||invalid==='owner')?'other':'owner',top,max_top:end},allowed_actions:invalid==='actions'||outside&&!settled?[]:['scroll'],interaction:{state:invalid==='outside'||outside&&!settled?'outside_viewport':'point_observed'}});
 const target=()=>({ref:'target',tid,label:'wanted.csv'});
 const read=async o=>{const output=o.storage_name?discovery(top>=at&&settled?[{...target(),label:''}]:[]):{...snapshot(o.root_ref==='target'?[target()]:moves&&invalid==='empty'?[]:[anchor()]),observation_root:{ref:moves&&invalid==='root'?'foreign':o.root_ref,identity:{anchor_tid:o.root_ref==='target'?tid:workflow_ref.prefix+';FileStorageForm;pnlFileStorage;tbl'}}};observations.push({options:o,output});return output;};
 return {trace,sleeps,observations,args:{name:'wanted.csv',read,roots:async()=>discovery([{ref:'table',tid:workflow_ref.prefix+';FileStorageForm;pnlFileStorage;tbl'}]),ready:(observe,condition)=>waitForExportStorageObservation({observe,condition,guard:()=>{},quiet:()=>true,sleep:async ms=>{sleeps.push(ms);if(settle)settled=true;}}),guard:()=>{},act:async(s,e,v,extra)=>{assert.equal(v,'scroll');assert.ok(Math.abs(extra.delta_y)<=1000);trace.push(extra.delta_y);moves++;if(delayed)settled=false;if(!stuck)top+=extra.delta_y;}}};
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

test('empty scrolled table retains its exact failure sample without more browser work',async()=>{
 const f=fixture({invalid:'empty'}),error=await findNativeStorageRow(f.args).catch(e=>e);
 assert.equal(error.code,'STORAGE_ENTRY_UNAVAILABLE');assert.deepEqual(error.storage_entry,{name:'wanted.csv',directory:'/test-2',reason:'no_scroll_owner'});
 assert.equal(error.exportStorageFailure?.table,f.observations.at(-1).output);assert.equal(error.exportStorageFailure.name_lookup,null);
 assert.equal(error.exportStorageFailure.stack,error.stack);assert.match(error.stack,/findNativeStorageRow/);
 assert.deepEqual(f.observations.map(x=>x.options),[{discover_roots:true,storage_name:'wanted.csv'},{root_ref:'table'},{discover_roots:true,storage_name:'wanted.csv'},{root_ref:'table'}]);
 assert.deepEqual(f.trace,[1000]);assert.deepEqual(f.sleeps,[]);
});

test('missing first-row scroll retains its own sample before waiting',async()=>{
 const f=fixture({invalid:'scroll',delayed:true}),error=await findNativeStorageRow(f.args).catch(e=>e);
 assert.equal(error.code,'STORAGE_ENTRY_UNAVAILABLE');assert.deepEqual(error.storage_entry,{name:'wanted.csv',directory:'/test-2',reason:'no_scroll_owner'});
 assert.equal(error.exportStorageFailure.table,f.observations.at(-1).output);assert.equal(error.exportStorageFailure.name_lookup,null);
 assert.equal(f.observations.length,4);assert.deepEqual(f.trace,[1000]);assert.deepEqual(f.sleeps,[]);
});

test('accepted table without a scroll action retains its separate exact-name lookup',async()=>{
 const f=fixture({invalid:'actions'}),error=await findNativeStorageRow(f.args).catch(e=>e);
 assert.equal(error.code,'STORAGE_ENTRY_UNAVAILABLE');assert.deepEqual(error.storage_entry,{name:'wanted.csv',directory:'/test-2',reason:'no_scroll_owner'});
 assert.equal(error.exportStorageFailure.table,f.observations.at(-2).output);assert.equal(error.exportStorageFailure.name_lookup,f.observations.at(-1).output);
 assert.equal(error.exportStorageFailure.table.observation_root.ref,'table');assert.equal(error.exportStorageFailure.name_lookup.observation_kind,'roots');
 assert.notDeepEqual(error.exportStorageFailure.table.dom_epoch,error.exportStorageFailure.name_lookup.dom_epoch);
 assert.equal(f.observations.length,3);assert.deepEqual(f.trace,[]);assert.deepEqual(f.sleeps,[]);
});

test('accepted outside-viewport table retains its lookup without a gesture',async()=>{
 const f=fixture({invalid:'outside'}),error=await findNativeStorageRow(f.args).catch(e=>e);
 assert.equal(error.storage_entry.reason,'no_scroll_owner');assert.equal(error.exportStorageFailure.table,f.observations.at(-2).output);
 assert.equal(error.exportStorageFailure.name_lookup,f.observations.at(-1).output);assert.equal(f.observations.length,3);assert.deepEqual(f.trace,[]);assert.deepEqual(f.sleeps,[]);
});

test('folder end retains its table and lookup with the existing refusal',async()=>{
 const f=fixture({at:4000}),error=await findNativeStorageRow(f.args).catch(e=>e);
 assert.equal(error.code,'STORAGE_ENTRY_UNAVAILABLE');assert.deepEqual(error.storage_entry,{name:'wanted.csv',directory:'/test-2',reason:'folder_end'});
 assert.equal(error.exportStorageFailure.table,f.observations.at(-2).output);assert.equal(error.exportStorageFailure.name_lookup,f.observations.at(-1).output);
 assert.equal(f.observations.length,9);assert.deepEqual(f.trace,[1000,1000,1000]);assert.deepEqual(f.sleeps,[]);
});
