import test from 'node:test';
import assert from 'node:assert/strict';
import {readTableFormatDefinitions,revealTableFormatField} from '../lib/table-format-pages.mjs';
const table={view_guid:'v',port_guid:'p',table_tid:'t'};
function fixture(count=66) {
 const fields=Array.from({length:count},(_,index)=>({index,source_index:index,name_key:'Field'+index,label:'Field'+index,type:'integer',record_id:String(index)}));
 let top=0,reads=0,actions=0;
 const ch={async observe({tableFormatPage,ready}) {
  const {offset,limit}=tableFormatPage,end=Math.min(count,offset+limit),start=Math.floor(top/24),stop=Math.min(count,start+13);
  const rendered=fields.slice(offset,end).filter(f=>f.index>=start&&f.index<stop).map(f=>({...f,status:'observed'}));
  const s={table_settings:{status:'observed',kind:'format',format:{page:{schema_id:'schema',status:rendered.length===end-offset?'complete_definition_page':'rendered_definition_window',offset,limit,total_columns:count,next_offset:end===count?null:end,rendered_start:start,rendered_end:stop},metadata_fields:structuredClone(fields.slice(offset,end)),fields:rendered,definition_scroll_ref:'scroll'}},
    ui:{elements:[{ref:'scroll',scroll:{ref:'scroll',top,max_top:(count-13)*24},allowed_actions:['scroll'],bounding_box:{height:312}}]}};
  ch.mutate?.(s,++reads);assert.equal(ready(s),true);return s;
 },async perform(step){assert.equal(step.ready(step.initialObservation),true);const a=step.resolve(step.initialObservation);assert.equal(a.verb,'scroll');assert.equal(a.ref,'scroll');assert.ok(Math.abs(a.delta_y)<=1000);actions++;if(!ch.stuck)top=Math.max(0,Math.min((count-13)*24,top+a.delta_y));},get actions(){return actions;}};
 return {ch,fields};
}
test('Table metadata assembles unrendered fields and reveals last then first without changing identity',async()=>{
 const {ch,fields}=fixture(),definition=await readTableFormatDefinitions(ch,table);
 assert.equal(definition.fields.length,66);assert.equal(ch.actions,0);
 let s=await revealTableFormatField(ch,table,definition,fields.at(-1));assert.equal(s.table_settings.format.fields.at(-1).index,65);
 s=await revealTableFormatField(ch,table,definition,fields[0]);assert.equal(s.table_settings.format.fields[0].index,0);assert.ok(ch.actions<10);
});
for(const [name,mutate] of Object.entries({schema:s=>s.table_settings.format.page.schema_id='changed',count:s=>s.table_settings.format.page.total_columns=67,
 cursor:s=>s.table_settings.format.page.next_offset=3,record:s=>s.table_settings.format.metadata_fields[0].record_id='0',
 source:s=>s.table_settings.format.metadata_fields[0].source_index=0,key:s=>s.table_settings.format.metadata_fields[0].name_key='Field0'}))
 test('Table metadata rejects changing '+name,async()=>{const {ch}=fixture();ch.mutate=(s,n)=>{if(n===2)mutate(s);};await assert.rejects(readTableFormatDefinitions(ch,table));assert.equal(ch.actions,0);});
test('Table field reveal stops when native scrolling does not move',async()=>{
 const {ch,fields}=fixture(),d=await readTableFormatDefinitions(ch,table);ch.stuck=true;
 await assert.rejects(revealTableFormatField(ch,table,d,fields.at(-1)),/no progress/);assert.equal(ch.actions,1);
});
test('Table field reveal rejects a changed record before scrolling',async()=>{
 const {ch,fields}=fixture(),d=await readTableFormatDefinitions(ch,table);fields[65]={...fields[65],record_id:'new-record'};
 await assert.rejects(revealTableFormatField(ch,table,d,d.fields[65]),/field changed/);assert.equal(ch.actions,0);
});
