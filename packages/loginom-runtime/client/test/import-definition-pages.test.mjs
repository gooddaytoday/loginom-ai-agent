import test from 'node:test';
import assert from 'node:assert/strict';
import {readImportDefinitionPages,readOutputDefinitionPages} from '../lib/import-definition-pages.mjs';
function fixture(count=12){const reads=[];return {reads,channel:{observe:async options=>{
 reads.push(options.importColumnPage.offset);const {offset,limit}=options.importColumnPage;
 const fields=Array.from({length:Math.min(limit,count-offset)},(_,i)=>({index:offset+i,status:'observed',name:'Field'+(offset+i)}));
 return {wizard:{stage:'text_import_format',import_columns:{fields,page:{status:'complete_definition_page',schema_id:'schema-1',offset,limit,returned:fields.length,total_columns:count,next_offset:offset+fields.length<count?offset+fields.length:null}}}};
 }}};}
test('assemble every addressed field without an eight-column limit or output claims',async()=>{
 const f=fixture(21),r=await readImportDefinitionPages(f.channel,{expectedCount:21});
 assert.deepEqual(f.reads,[0,8,16]);assert.equal(r.fields.length,21);assert.equal(r.definition_complete,true);
 assert.equal(r.settings_applied,false);assert.equal(r.source_schema_verified,false);
});
for(const [name,change] of Object.entries({identity:p=>{p.schema_id='other'},count:p=>{p.total_columns=13},cursor:p=>{p.next_offset=8},address:p=>{p.offset=0},partial:p=>{p.status='unverified'}}))
 test('reject changed or malformed later page: '+name,async()=>{const f=fixture(),observe=f.channel.observe;
 f.channel.observe=async o=>{const state=await observe(o);if(o.importColumnPage.offset===8)change(state.wizard.import_columns.page);return state};
 await assert.rejects(readImportDefinitionPages(f.channel));assert.deepEqual(f.reads,[0,8]);
 });
test('expected count is a precondition and does not accept a truncated prefix',async()=>{
 const f=fixture();await assert.rejects(readImportDefinitionPages(f.channel,{expectedCount:8}),/count differs/);assert.deepEqual(f.reads,[0]);
});
test('read stops before repeating a failed page',async()=>{
 const f=fixture(),observe=f.channel.observe;f.channel.observe=async o=>{if(o.importColumnPage.offset===8)throw Error('document changed');return observe(o)};
 await assert.rejects(readImportDefinitionPages(f.channel),/document changed/);assert.deepEqual(f.reads,[0]);
});

test('output definitions use their own page contract and cover the last row',async()=>{
 const f=fixture(21),old=f.channel.observe;
 f.channel.observe=async o=>{assert.ok(o.outputColumnPage);assert.equal(o.importColumnPage,undefined);const s=await old({importColumnPage:o.outputColumnPage});return {wizard:{stage:'output_mapping',output_columns:s.wizard.import_columns}};};
 const r=await readOutputDefinitionPages(f.channel,{expectedCount:21});assert.equal(r.fields.length,21);assert.equal(r.fields.at(-1).index,20);assert.deepEqual(f.reads,[0,8,16]);
});

function windowFixture({change=false,boundary=false}={}) {
 let moved=false;const actions=[];
 const make=offset=>{const visible=offset<8||moved,count=12;
  const fields=visible?Array.from({length:Math.min(8,count-offset)},(_,i)=>({index:offset+i,status:'observed',name:'F'+(offset+i)})):[];
  return {wizard:{stage:'output_mapping',output_columns:{definition_scroll_ref:'body',fields,page:{
    status:visible?'complete_definition_page':'rendered_definition_window',schema_id:moved&&change?'changed':'stable',offset,limit:8,
    total_columns:count,returned:fields.length,next_offset:offset+Math.min(8,count-offset)<count?8:null,rendered_start:0,rendered_end:8}}},
    ui:{elements:[{ref:'body',scroll:{ref:'body',top:boundary?100:0,max_top:100},allowed_actions:['scroll']}]}};};
 return {actions,channel:{observe:async o=>make(o.outputColumnPage.offset),perform:async o=>{
   assert.equal(o.ready(o.initialObservation),true);actions.push(o.resolve(o.initialObservation));moved=true;
 }}};
}
test('output paging reveals the missing tail through the exact native scroll owner',async()=>{
 const f=windowFixture(),r=await readOutputDefinitionPages(f.channel,{expectedCount:12});
 assert.equal(r.fields.length,12);assert.deepEqual(f.actions,[{verb:'scroll',ref:'body',delta_y:500}]);
});
test('output paging refuses schema drift caused during scrolling',async()=>{
 const f=windowFixture({change:true});await assert.rejects(readOutputDefinitionPages(f.channel),/changed during scroll/);
 assert.equal(f.actions.length,1);
});
test('output paging refuses an exhausted scroll boundary without a gesture',async()=>{
 const f=windowFixture({boundary:true});await assert.rejects(readOutputDefinitionPages(f.channel),/boundary reached/);
 assert.equal(f.actions.length,0);
});

test('an addressed but clipped output field is scrolled into view before interaction',async()=>{
 const {observeOutputDefinitionPage}=await import('../lib/import-definition-pages.mjs');
 for(const fault of ['none','stalled','schema','lost']){
  let top=500,calls=0;
  const make=()=>({wizard:{stage:'output_mapping',output_columns:{definition_scroll_ref:'grid',fields:[{index:0,name:'A',label:'A',name_ref:'cell'}],page:{status:'complete_definition_page',schema_id:fault==='schema'&&calls?'other':'schema',offset:0,total_columns:80}}},ui:{elements:[
   {ref:'grid',scroll:{ref:'grid',top,max_top:1500},bounding_box:{y:200,height:600},allowed_actions:['scroll']},
   {ref:'cell',bounding_box:{y:201-top,height:23},allowed_actions:top<=100?['click']:[]}
  ]}});
  const channel={observe:async()=>make(),perform:async o=>{assert.equal(o.ready(o.initialObservation),true);const a=o.resolve();assert.deepEqual(a,{verb:'scroll',ref:'grid',delta_y:-400});calls++;if(fault==='lost')throw Error('lost');if(fault!=='stalled')top=100;}};
  const request=observeOutputDefinitionPage(channel,{offset:0,schemaId:'schema',total:80,field:{index:0,name:'A',label:'A'}});
  if(fault==='none'){const s=await request;assert.ok(s.ui.elements[1].allowed_actions.includes('click'));}else await assert.rejects(request);
  assert.equal(calls,1);
 }
});
