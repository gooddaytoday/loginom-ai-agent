import test from 'node:test';
import assert from 'node:assert/strict';
import {readAuditRowPages} from './audit-row-pages.mjs';
const table={view_guid:'view',port_guid:'port',table_tid:'table'};
function fixture(){
 let visible=false,left=0;
 const ch={async observe({tablePage:{page},ready}){
  const {column_offset:offset,column_limit:limit,row_offset:row,row_limit:count}=page,end=Math.min(12,offset+limit);
  let t;
  if(count&&!visible)t={verified:false,reason:'row_not_rendered'};
  else {
   const failed=Array.from({length:end-offset},(_,i)=>offset+i).find(i=>i*90<left||i*90+90>left+800);
   if(count&&failed!==undefined)t={verified:false,reason:'cell_not_visible',schema_id:'schema',column_index:failed,row_index:row,
    horizontal_window:{table,tid:'grid',left,max_left:280,viewport_left:0,viewport_right:800,cell_left:failed*90-left,cell_right:failed*90+90-left,row_visible:true}};
   else t={verified:true,table,schema_id:'schema',row_total:120,column_total:12,segment:{index:0,start:0,count:120},
    columns:Array.from({length:end-offset},(_,i)=>({index:offset+i,name:'F'+(offset+i),type:'integer'})),
    rows:Array.from({length:count},(_,r)=>({index:row+r,record_id:'row-'+(row+r),cells:Array.from({length:end-offset},(_,i)=>({column:offset+i,is_null:false,text:String((row+r)*100+offset+i)}))})),
    page:{...page,column_returned:end-offset,row_returned:count,next_column_offset:end===12?null:end}};
  }
  ch.change?.(t);
  const s={node_table:t,ui:{elements:[{ref:'scroll',tid:'grid',table_scroller:table,horizontal_scroll:{ref:'scroll',left,max_left:280},allowed_actions:['scroll_horizontal']}]}};
  assert.equal(ready(s),true);return s;
 },async perform(step){const action=step.resolve(step.initialObservation);left+=action.delta_x;},async revealRow(row){assert.equal(row,37);visible=true;}};
 return ch;
}
test('wide audit retains absolute row 37 and every horizontal cell after vertical reveal',async()=>{
 const ch=fixture(),out=await readAuditRowPages(ch,table,{rowOffset:37,revealRow:ch.revealRow});
 assert.equal(out.rows[0].index,37);assert.equal(out.rows[0].record_id,'row-37');
 assert.deepEqual(out.rows[0].cells.map(c=>c.text),Array.from({length:12},(_,i)=>String(3700+i)));
 assert.equal(out.sample_complete,false);assert.equal(out.segment.count,120);
});
test('wide audit rejects replacement of a row between horizontal slices',async()=>{
 const ch=fixture();ch.change=t=>{if(t.verified&&t.page.column_offset>0)t.rows[0].record_id='other';};
 await assert.rejects(readAuditRowPages(ch,table,{rowOffset:37,revealRow:ch.revealRow}),/records changed/);
});
test('wide schema-only audit has no rows or implicit completeness claim',async()=>{
 const out=await readAuditRowPages(fixture(),table,{sampleRows:0});
 assert.equal(out.columns.length,12);assert.equal(out.rows.length,0);assert.equal(out.sample_complete,false);
});
test('wide ten-row block preserves every row across horizontal slices',async()=>{
 const ch=fixture(),out=await readAuditRowPages(ch,table,{rowOffset:37,sampleRows:10,revealRow:ch.revealRow});
 assert.equal(out.rows.length,10);
 for(const [i,row] of out.rows.entries()){
  assert.equal(row.index,37+i);assert.equal(row.record_id,'row-'+(37+i));
  assert.deepEqual(row.cells.map(c=>c.text),Array.from({length:12},(_,column)=>String((37+i)*100+column)));
 }
});
test('wide block rejects a replaced later row as well as the first row',async()=>{
 const ch=fixture();ch.change=t=>{if(t.verified&&t.page.column_offset>0)t.rows[7].record_id='other';};
 await assert.rejects(readAuditRowPages(ch,table,{rowOffset:37,sampleRows:10,revealRow:ch.revealRow}),/records changed/);
});
