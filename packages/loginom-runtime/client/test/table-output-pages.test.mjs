import test from 'node:test';
import assert from 'node:assert/strict';
import {readTableOutputPages} from '../lib/table-output-pages.mjs';
const table={view_guid:'view',port_guid:'port',table_tid:'table'};
function fixture({count=66,rowCount=2}={}) {
 let left=0,actions=0,reads=0;
 const ch={async observe({tablePage:{page},ready}) {
  const {column_offset:o,column_limit:limit}=page,end=Math.min(count,o+limit);
  let t;
  const failed=Array.from({length:end-o},(_,i)=>o+i).find(i=>i*90<left||i*90+90>left+800);
  if(page.row_limit&&rowCount&&failed!==undefined)t={verified:false,reason:'cell_not_visible',column_index:failed,row_index:0,horizontal_window:{table,tid:'grid',left,max_left:Math.max(0,count*90-800),viewport_left:0,viewport_right:800,cell_left:failed*90-left,cell_right:failed*90+90-left,row_visible:true}};
  else t={verified:true,table,row_total:rowCount,column_total:count,segment:{index:0,size:1000000,start:0,count:rowCount},
   columns:Array.from({length:end-o},(_,i)=>({index:o+i,name:'F'+(o+i),type:'integer'})),
   rows:Array.from({length:Math.min(page.row_limit,rowCount)},(_,i)=>({index:i,record_id:String(i),cells:Array.from({length:end-o},(_,j)=>({column:o+j,is_null:false,text:String(i*100+o+j)}))})),
   page:{...page,column_returned:end-o,row_returned:Math.min(page.row_limit,rowCount),next_column_offset:end===count?null:end},value_source:'rendered_cell_and_cached_value_text'};
  t.schema_id='schema';
  const s={node_table:t,ui:{elements:[{ref:'ui-scroll',tid:'grid',table_scroller:table,horizontal_scroll:{ref:'ui-scroll',left,max_left:Math.max(0,count*90-800)},allowed_actions:['scroll_horizontal']}]}};
  ch.change?.(s,++reads);assert.equal(ready(s),true);return s;
 },async perform(step){assert.equal(step.ready(step.initialObservation),true);const a=step.resolve(step.initialObservation);assert.equal(a.ref,'ui-scroll');assert.ok(Math.abs(a.delta_x)<=1000);actions++;if(!ch.stuck)left=Math.max(0,Math.min(count*90-800,left+a.delta_x));},get actions(){return actions;}};
 return ch;
}
test('wide Table output adapts page width and retains all ordered cells',async()=>{
 const ch=fixture(),out=await readTableOutputPages(ch,table);assert.equal(out.columns.length,66);assert.equal(out.rows.length,2);
 assert.deepEqual(out.rows[1].cells.map(c=>c.text),Array.from({length:66},(_,i)=>String(100+i)));assert.ok(ch.actions>0);assert.ok(ch.actions<15);
 assert.equal(out.sample_complete,true);assert.equal(out.execution_freshness_verified,false);assert.equal(out.numeric_precision_verified,false);
});
for(const [name,options,sampleRows] of [['zero rows',{rowCount:0},10],['schema only',{rowCount:50},0],['bounded sample',{rowCount:50},10],['zero columns',{count:0,rowCount:0},10]])
 test('Table pages support '+name,async()=>{const ch=fixture(options),out=await readTableOutputPages(ch,table,{sampleRows});assert.equal(out.rows.length,Math.min(options.rowCount??2,sampleRows));assert.equal(out.sample_complete,out.rows.length===out.row_total);});
for(const [name,change] of Object.entries({schema:t=>t.schema_id='changed',count:t=>t.row_total++,record:t=>t.rows[0].record_id='other',cursor:t=>t.page.next_column_offset=5,column:t=>t.columns[0].index=0,table:t=>t.table={...table,port_guid:'other'}}))
 test('Table assembly rejects changed '+name,async()=>{const ch=fixture();ch.change=s=>{if(s.node_table.verified&&s.node_table.page.column_offset>0)change(s.node_table);};await assert.rejects(readTableOutputPages(ch,table));});
test('Table scrolling refuses a foreign native owner',async()=>{const ch=fixture();ch.change=s=>{if(!s.node_table.verified)s.ui.elements[0].table_scroller={...table,view_guid:'other'};};await assert.rejects(readTableOutputPages(ch,table),/control unavailable/);assert.equal(ch.actions,0);});
test('Table scrolling stops after an ineffective gesture',async()=>{const ch=fixture();ch.stuck=true;await assert.rejects(readTableOutputPages(ch,table),/no progress/);assert.equal(ch.actions,1);});
