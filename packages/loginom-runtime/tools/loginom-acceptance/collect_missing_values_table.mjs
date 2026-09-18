import * as fs from 'node:fs/promises';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {withBrowserReceipt} from '../../client/lib/executor.mjs';
import {openNewOutputTable,configureTablePrecision,prepareTableRead,restoreTablePrecision,returnFromOutputTable} from '../../client/lib/node-output-procedure.mjs';
import {makeNodeTableContextCode} from '../../client/lib/node-table-context.mjs';
import {decodeTableOutput} from '../../client/lib/table-output-values.mjs';
import {readAuditRowPages} from './audit-row-pages.mjs';

// Independent diagnostic read for the five-column Missing Values fixtures.
// Every row comes from the visible UI, with schema/port identity and exact numbers.
// This does not attest persistence; run a separate save/reopen audit for that.
export async function collectMissingValuesTable(options){return collectVisibleFullTable({...options,columnCount:5});}

// Independent full-table audit. Wide tables use bound horizontal pages;
// unsupported segments and incomplete coverage must fail instead of becoming samples.
export function auditColumnOrder(columns,expected,{allowFieldReordering=false}={}){
 if(columns.length!==expected.length||new Set(columns.map(c=>c.name)).size!==columns.length||new Set(expected.map(c=>c.name)).size!==expected.length)throw Error('Audit field inventory differs');
 const actual=columns.map((c,index)=>{
  const e=allowFieldReordering?expected.find(e=>e.name===c.name):expected[index];
  if(!e||c.index!==index||['name','label','type'].some(k=>c[k]!==e[k]))throw Error('Audit field identity differs');
  return {...e,index};
 });
 return {expected:actual,reordered:columns.some((c,i)=>c.name!==expected[i].name)};
}
export async function collectVisibleFullTable({outcome,prepared,execute,record,receiptNamespace,evidenceDir,targetOrigin,targetBuild,attempt='',columnCount,port=0,allowFieldReordering=false}){
if(!Number.isInteger(columnCount)||columnCount<1||columnCount>1000)throw Error('Full visible reader requires 1–1000 columns');
if(attempt&&!/^[a-z0-9-]{1,40}$/.test(attempt))throw Error('Invalid diagnostic attempt');
const result=outcome.output??outcome;if(result.status!=='SUCCEEDED'||result.execution.status!=='completed')throw Error('Completed execution required');
const expectedPort=result.output.ports.find(p=>p.port===port);if(!expectedPort||expectedPort.schema.length!==columnCount)throw Error('Expected complete port schema required');
const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:result.node};
const evidenceId=result.operation_id+'-independent-full';
const op={id:evidenceId+(attempt?'-'+attempt:''),action:{action_key:'diagnostic.audit.table',revision:'1'},deadline:Date.now()+900000};
const channel=createNodeProcedure({operation:op,execute:execute,record:record,targetOrigin,targetBuild,preparedNodeContext:binding,maxSteps:2048,
 wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:receiptNamespace,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
const {table}=await openNewOutputTable(channel,port);let format,settings,decoded,first=null,restored,returned,nativeSchema;const rows=[];
try{
settings=await prepareTableRead(channel,table);
if(columnCount>8){
 nativeSchema=await readAuditRowPages(channel,table,{rowOffset:0,sampleRows:0});nativeSchema.verified=true;
}else{
for(let tries=0;tries<30;tries++){
 nativeSchema=await execute(makeNodeTableContextCode(binding,table,{row_offset:0,row_limit:0,column_offset:0,column_limit:columnCount}));
 if(nativeSchema.verified)break;
 if(nativeSchema.reason!=='table_masked')throw Error('Initial table schema unavailable: '+nativeSchema.reason);
 await new Promise(resolve=>setTimeout(resolve,250));
}
}
if(!nativeSchema?.verified)throw Error('Initial table schema remains masked');
auditColumnOrder(nativeSchema.columns,expectedPort.schema,{allowFieldReordering});
await fs.writeFile(evidenceDir+'/'+op.id+'-schema-before-format.json',JSON.stringify(nativeSchema));
format=await configureTablePrecision(channel,table);
await fs.writeFile(evidenceDir+'/'+op.id+'-checkpoint.json',JSON.stringify({binding,table,format,settings}));
async function scrollRow(page,args){
 const {table,index}=args;
 const state=await page.evaluate(({table,index})=>{
  const roots=[...document.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===table.table_tid);if(roots.length!==1)throw Error('Table root changed');
  const grids=[...roots[0].querySelectorAll('.x-grid-view')].map(e=>({e,b:e.getBoundingClientRect()})).filter(({e,b})=>e.checkVisibility()&&b.width>20&&b.height>20&&b.x>=0&&b.y>=0&&b.y<innerHeight&&e.querySelector('table.x-grid-item')).sort((a,b)=>b.b.width-a.b.width);
  if(!grids.length)throw Error('Visible grid unavailable');const {e,b}=grids[0];
  const visible=[...e.querySelectorAll('table.x-grid-item')].map(r=>({index:Number(r.getAttribute('data-recordindex')),b:r.getBoundingClientRect()})).filter(r=>r.b.y>=b.y&&r.b.bottom<=Math.min(b.bottom,innerHeight));
  if(!visible.length)throw Error('No visible rows');
  const low=Math.min(...visible.map(r=>r.index)),high=Math.max(...visible.map(r=>r.index));
  const direction=index<low?-1:index>high?1:0;
  const rowHeight=Math.max(1,visible.reduce((sum,r)=>sum+r.b.height,0)/visible.length);
  const distance=direction<0?low-index:direction>0?index-high:0;
  return {x:Math.min(innerWidth-10,b.x+b.width/2),y:Math.min(innerHeight-10,b.y+b.height/2),direction,
   delta:direction*Math.min(250,Math.max(1,Math.ceil(distance*rowHeight))),low,high};
 },args);
 // A wheel can finish between the failed read and this fresh geometry sample.
 // Re-observe the cells without issuing a second wheel in that case.
 if(!state.direction)return state;
 await page.mouse.move(state.x,state.y);await page.mouse.wheel(0,state.delta);
 return state;
}
// Read a visible block across horizontal pages before moving vertically. Reading
// each row separately otherwise repeats every horizontal scroll up to 300 times.
const rowBatchSize=10;
for(let index=0;index<=1000;index+=rowBatchSize){
 let raw;
 if(columnCount>8){
  raw=await readAuditRowPages(channel,table,{rowOffset:index,sampleRows:rowBatchSize,
   revealRow:row=>execute('async page=>('+scrollRow.toString()+')(page,'+JSON.stringify({table,index:row})+')')});
  raw.verified=true;
 }else{
 for(let tries=0;tries<30;tries++){
  raw=await execute(makeNodeTableContextCode(binding,table,{row_offset:index,row_limit:rowBatchSize,column_offset:0,column_limit:columnCount}));
  if(raw.verified)break;
  // Virtual scrolling can briefly load the next native page. A masked table
  // permits only another read; never scroll or accept cells through the mask.
  if(raw.reason==='table_masked'){await new Promise(resolve=>setTimeout(resolve,250));continue;}
  if(!['row_not_rendered','cell_not_visible'].includes(raw.reason))throw Error('Full table read refused: '+raw.reason);
  await execute('async page=>('+scrollRow.toString()+')(page,'+JSON.stringify({table,index:raw.row_index??index})+')');
 }
 }
 if(!raw?.verified)throw Error('Full table row readiness exhausted at '+index+': '+raw?.reason);
 if(!first)first=raw;
 if(raw.schema_id!==first.schema_id||raw.row_total!==first.row_total||raw.column_total!==columnCount||JSON.stringify(raw.segment)!==JSON.stringify(first.segment))throw Error('Full table changed');
 if(raw.rows.length!==Math.min(rowBatchSize,raw.row_total-index))throw Error('Incomplete row block');
 for(const [offset,row] of raw.rows.entries()){
  if(row.index!==index+offset||rows.some(previous=>previous.record_id===row.record_id))throw Error('Row identity differs');
  rows.push(row);
 }
 if(index%20===0)await fs.writeFile(evidenceDir+'/'+op.id+'-progress.json',JSON.stringify({rows_read:rows.length,row_total:raw.row_total,complete:false}));
 if(index+rowBatchSize>=raw.row_total)break;
}
if(rows.length!==first.row_total)throw Error('Full table incomplete');
await fs.writeFile(evidenceDir+'/'+op.id+'-raw.json',JSON.stringify({binding,format,settings,first,rows}));
const order=auditColumnOrder(first.columns,expectedPort.schema,{allowFieldReordering});
decoded=decodeTableOutput({...first,table,rows,row_total:first.row_total,column_total:first.column_total,sample_complete:true},{formatProof:format,readSettings:settings,expectedColumns:order.expected,requireExactNumbers:true});
decoded.field_order_changed=order.reordered;
}finally{
 // Restore presentation even when a later row cannot be read. An unsuccessful
 // cleanup throws and therefore cannot produce a successful audit receipt.
 try{if(format)restored=await restoreTablePrecision(channel,format);}
 finally{returned=await returnFromOutputTable(channel,table);}
}
const evidence={verified:true,complete:true,node:result.node,execution_id:result.execution.execution_id,port,port_guid:table.port_guid,table,schema:decoded.schema,field_order_changed:decoded.field_order_changed,row_count:decoded.row_count,rows:decoded.sample,restored,returned};
await fs.writeFile(evidenceDir+'/'+op.id+'-progress.json',JSON.stringify({rows_read:rows.length,row_total:first.row_total,complete:true}));
await fs.writeFile(evidenceDir+'/'+evidenceId+'.json',JSON.stringify({...evidence,diagnostic_operation_id:op.id}));return evidence;

}
