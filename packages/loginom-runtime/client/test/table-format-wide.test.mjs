import test from 'node:test';
import assert from 'node:assert/strict';
import {configureTablePrecision} from '../lib/node-output-procedure.mjs';
import {validateTableFormatSelection,selectTableFormatPage} from '../lib/table-format-selection.mjs';
import {makeWorkspaceUiCode,uiActionSchema} from '../lib/workspace-ui.mjs';

function fixture({count=130,heterogeneous=false,mixedTypes=false,virtualized=true,viewportRows=13,fault,deadline=900000}={}){
 const table={table_tid:'table',view_guid:'view',port_guid:'port'};
 const defaults={formatting:true,custom:true,format_string:'',thousands:false,scientific:false,decimal_digits:'0',currency:''};
 const stored=Array.from({length:count},(_,i)=>({...defaults,...(heterogeneous?{format_string:i%3===0?'0.00':'',custom:i%3!==0}:{}),...(heterogeneous&&i===5?{formatting:false}:{} )}));
 const baseline=structuredClone(stored),selection=new Set();let draft,offset=0,open=true,clock=0,top=0;
 const counts={ordinary:0,group:0,mask:0,apply:0,scrolls:0,originalSelections:[]},transactions=[];
 const id=i=>({index:i,source_index:i,name_key:'F'+i,type:mixedTypes&&i%2?'real':'integer',record_id:'r'+i});
 const fields=()=>stored.map((v,i)=>({...id(i),status:'observed',label_ref:'f'+i,selected:selection.has(i),format_string:v.format_string}));
 const painted=()=>fields().slice(offset,offset+8).filter(f=>!virtualized||f.index>=Math.floor(top/24)&&f.index<Math.floor(top/24)+viewportRows);
 const controls=s=>Object.fromEntries(Object.entries(s).map(([k,value])=>[k,{status:'observed',value,input_ref:k,display_ref:k}]));
 const control=(ref,extra={})=>({ref,tid:ref,allowed_actions:['click','fill','press','set_checked'],interaction:{state:'point_observed'},...extra});
 const state=()=>{
  const selected=[...selection].sort((a,b)=>a-b),common=selected.length?{...controls(draft),...(selected.length===1?{source_index:selected[0],name_key:'F'+selected[0]}:{fields:selected.map(id)})}:null;
  if(fault==='unobserved_original'&&selected.length===1&&selected[0]===12)common.currency={status:'unobserved'};
  return {table_settings:{status:'observed',kind:'format',view_key:'table',format:{
   page:{status:'complete_definition_page',schema_id:'schema',offset,limit:8,total_columns:count,next_offset:offset+8<count?offset+8:null,rendered_start:Math.floor(top/24),rendered_end:Math.min(count,Math.floor(top/24)+viewportRows)},
   metadata_fields:fields().slice(offset,offset+8),fields:painted(),definition_scroll_ref:'scroll',selection:{complete:true,fields:selected.map(id)},
   ...(selected.length===1?{selected_numeric:common}:selected.length>1?{selected_group:common}:{})}},
   ui:{dialogs:open?['format']:[],elements:[control('scroll',{allowed_actions:['scroll'],scroll:{ref:'scroll',top,max_top:Math.max(0,(count-viewportRows)*24)},bounding_box:{height:viewportRows*24}}),...painted().map(f=>control('f'+f.index,{table_field:{...f,view_key:'table'}})),...Object.keys(defaults).map(k=>control(k)),control('table;ModalWindow_BrowseFormat;btnApply')]},
   node_outputs:{tables:[{active:true,view_guid:'view'}]}};
 };
 const tick=cost=>{clock+=cost;if(clock>=deadline)throw Error('original procedure budget exhausted');};
 const commit=()=>{if(draft)for(const i of selection)stored[i]={...draft,...(fault==='corrupt_stored'&&i===12?{format_string:'wrong'}:{})};};
 const choose=indices=>{commit();selection.clear();indices.forEach(i=>selection.add(i));draft={...stored[indices[0]]};};
 const channel={observe:async o=>{tick(500);offset=o.tableFormatPage?.offset??offset;const s=state();assert.equal(o.ready(s),true,o.condition);return s;},
  perform:async o=>{tick(1000);const s=state();assert.equal(o.ready(s),true,o.condition);const a=o.resolve(s);
   if(a.verb==='scroll'){top=Math.max(0,Math.min((count-viewportRows)*24,top+a.delta_y));counts.scrolls++;}
   else if(/^f\d+$/.test(a.ref)){const i=Number(a.ref.slice(1));counts.ordinary++;counts.originalSelections.push(i);choose([i]);}
   else if(a.verb==='fill'){counts.mask++;draft.format_string=a.text;}
   else if(a.verb==='set_checked')draft[a.ref]=a.checked;
   else if(a.ref.endsWith('btnApply')){commit();open=false;counts.apply++;}
  },selectTableFormatGroup:async(t,refs,reset)=>{
   tick(1000);assert.deepEqual(t,table);assert.ok(refs.length<=8);const s=state();validateTableFormatSelection(s,t,refs,reset);
   const indices=refs.map(r=>Number(r.slice(1)));transactions.push({indices,reset});const next=reset?indices:[...selection,...indices];choose(next);counts.group++;
   if(fault==='foreign_selection'&&counts.mask>0)selection.add(count+1);
   if(fault==='original_drift'&&counts.group===1)draft.currency='$';
   return {verified:true,cleanup_complete:true};
  }};
 return {table,channel,stored,baseline,counts,transactions,reopen:()=>{open=true;selection.clear();draft=undefined;},clock:()=>clock};
}

test('130 numeric fields preserve individual originals and restore within the unchanged 900000 cost-model budget',async t=>{
 const x=fixture(),p=await configureTablePrecision(x.channel,x.table,{alreadyOpen:true});
 assert.equal(p.grouped_numeric,true);assert.equal(p.original_formats.length,130);
 assert.deepEqual(p.original_formats.map(f=>f.settings),x.baseline);
 assert.deepEqual(x.counts.originalSelections.slice(0,130),Array.from({length:130},(_,i)=>i));
 assert.ok(x.stored.every(f=>f.format_string==='0'));assert.equal(p.numeric_formats.length,130);
 assert.ok(x.transactions.every(t=>t.indices.length<=8));assert.equal(x.counts.mask,1);
 x.reopen();const r=await configureTablePrecision(x.channel,x.table,{alreadyOpen:true,restore:p.original_formats});
 assert.equal(r.restored,true);assert.deepEqual(x.stored,x.baseline);assert.equal(x.counts.mask,2);assert.equal(x.counts.apply,2);
 assert.ok(x.clock()<900000);assert.ok(x.counts.group<=68);assert.ok(x.counts.ordinary<=134);
 t.diagnostic(JSON.stringify({cost_model_elapsed_ms:x.clock(),budget_ms:900000,ordinary_selections:x.counts.ordinary,page_selections:x.counts.group,scrolls:x.counts.scrolls,mask_edits:x.counts.mask,applies:x.counts.apply,native_timing_claimed:false}));
});
test('heterogeneous originals form separate cohorts and restore their own flags',async()=>{
 const x=fixture({count:24,heterogeneous:true}),p=await configureTablePrecision(x.channel,x.table,{alreadyOpen:true});
 assert.deepEqual(p.original_formats.map(f=>f.settings),x.baseline);assert.equal(x.counts.mask,3);
 x.reopen();await configureTablePrecision(x.channel,x.table,{alreadyOpen:true,restore:p.original_formats});assert.deepEqual(x.stored,x.baseline);
});
for(const fault of ['unobserved_original','corrupt_stored'])test('wide formats refuse '+fault+' without Apply',async()=>{
 const x=fixture({fault});await assert.rejects(configureTablePrecision(x.channel,x.table,{alreadyOpen:true}),/unavailable|mask differs|format differs/);assert.equal(x.counts.apply,0);
 if(fault==='unobserved_original'){assert.equal(x.counts.mask,0);assert.deepEqual(x.stored,x.baseline);}
});
test('incomplete or duplicate restore is refused before any format edit',async()=>{
 for(const duplicate of [false,true]){
  const x=fixture();const originals=x.baseline.map((settings,index)=>({index,key:'F'+index,type:'integer',settings}));
  if(duplicate)originals[12]={...originals[0]};else originals.pop();
  await assert.rejects(configureTablePrecision(x.channel,x.table,{alreadyOpen:true,restore:originals}),/original numeric format/i);assert.equal(x.counts.mask,0);assert.equal(x.counts.ordinary,0);
 }
});
test('fixed selection is private; public actions and read options gain no modifier',()=>{
 assert.equal(uiActionSchema.properties.modifiers,undefined);
 assert.throws(()=>makeWorkspaceUiCode({mode:'act',table_format_modifier:true}),/private/);
});

test('page selector refuses partial effect, changed membership, foreign identity and late read without replay',async()=>{
 for(const fault of ['none','not_applied','ambiguous','membership','identity','late','cleanup','throw']){
  const x=fixture({count:16});await x.channel.perform({condition:'select',ready:()=>true,resolve:()=>({verb:'click',ref:'f0'})});
  const snapshot=await x.channel.observe({tableFormatPage:{offset:0,limit:8},ready:()=>true});const refs=['f1','f2'];
  const plan=validateTableFormatSelection(snapshot,x.table,refs,true),task={snapshot,table:x.table,refs,plan,deadline:Date.now()+15000,operation_id:'select'};
  let calls=0;
  const cap=async(page,t)=>{
   calls++;if(fault==='throw')throw Error('lost gesture call');const out=structuredClone(t.snapshot);const field=plan.fields[calls-1];
   out.table_settings.format.selection.fields=calls===1?[field]:[...out.table_settings.format.selection.fields,field];
   if(fault==='membership')out.table_settings.format.selection.fields=[];
   if(fault==='identity')out.table_settings.format.page.schema_id='foreign';
   if(fault==='late')task.deadline=Date.now()-1;
   return {status:fault==='not_applied'?'NOT_APPLIED':fault==='ambiguous'?'AMBIGUOUS':'SUCCEEDED',effect_possible:fault!=='not_applied',cleanup_complete:fault!=='cleanup',output:out,trace:[]};
  };
  const r=await selectTableFormatPage({},task,cap,undefined,async()=>({verified:true,surface:'views',tables:[{...x.table,active:true}]}));
  assert.equal(r.status,fault==='none'?'SUCCEEDED':fault==='not_applied'?'NOT_APPLIED':'AMBIGUOUS');assert.equal(calls,fault==='none'?2:1);if(fault==='throw')assert.equal(r.cleanup_complete,false);
 }
});


test('130 interleaved integer/real fields use distinct masks and preserve exact originals',async()=>{
 const x=fixture({mixedTypes:true}),p=await configureTablePrecision(x.channel,x.table,{alreadyOpen:true});
 assert.equal(x.counts.mask,2);assert.ok(x.stored.every((f,i)=>f.format_string===(i%2?'0.################E+00':'0')));
 x.reopen();await configureTablePrecision(x.channel,x.table,{alreadyOpen:true,restore:p.original_formats});assert.deepEqual(x.stored,x.baseline);assert.ok(x.clock()<900000);
});
test('original flags drifting after capture refuse mask editing',async()=>{
 const x=fixture({fault:'original_drift'});await assert.rejects(configureTablePrecision(x.channel,x.table,{alreadyOpen:true}),/original format changed/);assert.equal(x.counts.mask,0);assert.equal(x.counts.apply,0);
});
test('changed individual stored mask refuses restoration before any edit',async()=>{
 const x=fixture(),p=await configureTablePrecision(x.channel,x.table,{alreadyOpen:true});x.reopen();x.stored[12].format_string='external';
 const before=x.counts.mask;await assert.rejects(configureTablePrecision(x.channel,x.table,{alreadyOpen:true,restore:p.original_formats}),/changed before restoration/);assert.equal(x.counts.mask,before);assert.equal(x.stored[12].format_string,'external');
});


test('a viewport smaller than eight rows selects bounded partial batches and restores every original',async()=>{
 const x=fixture({count:24,viewportRows:4}),p=await configureTablePrecision(x.channel,x.table,{alreadyOpen:true});
 assert.ok(x.transactions.every(t=>t.indices.length<=4));x.reopen();await configureTablePrecision(x.channel,x.table,{alreadyOpen:true,restore:p.original_formats});assert.deepEqual(x.stored,x.baseline);assert.ok(x.clock()<900000);
});
