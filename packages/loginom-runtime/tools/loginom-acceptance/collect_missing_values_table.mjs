import * as fs from 'node:fs/promises';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {withBrowserReceipt} from '../../client/lib/executor.mjs';
import {openNewOutputTable,configureTablePrecision,prepareTableRead,restoreTablePrecision,returnFromOutputTable} from '../../client/lib/node-output-procedure.mjs';
import {makeNodeTableContextCode} from '../../client/lib/node-table-context.mjs';
import {decodeTableOutput} from '../../client/lib/table-output-values.mjs';

// Independent diagnostic read for the five-column Missing Values fixtures.
// Every row comes from the visible UI, with schema/port identity and exact numbers.
// This does not attest persistence; run a separate save/reopen audit for that.
export async function collectMissingValuesTable({outcome,prepared,execute,record,receiptNamespace,evidenceDir,targetOrigin,targetBuild,attempt=''}){
if(attempt&&!/^[a-z0-9-]{1,40}$/.test(attempt))throw Error('Invalid diagnostic attempt');
const result=outcome.output??outcome;if(result.status!=='SUCCEEDED'||result.execution.status!=='completed')throw Error('Completed execution required');
const binding={document_id:prepared.document_id,workflow_ref:prepared.workflow_ref,node:result.node};
const evidenceId=result.operation_id+'-independent-full';
const op={id:evidenceId+(attempt?'-'+attempt:''),action:{action_key:'node14.audit.table',revision:'1'},deadline:Date.now()+360000};
const channel=createNodeProcedure({operation:op,execute:execute,record:record,targetOrigin,targetBuild,preparedNodeContext:binding,maxSteps:2048,
 wrapMutation:(code,r)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:receiptNamespace,receipt_id:r.id,receipt_signature:r.signature,operation_id:r.id})});
const {table}=await openNewOutputTable(channel,0),format=await configureTablePrecision(channel,table),settings=await prepareTableRead(channel,table);
await fs.writeFile(evidenceDir+'/'+op.id+'-checkpoint.json',JSON.stringify({binding,table,format,settings}));
const rows=[];let first=null;
async function scrollRow(page,args){
 const {table,index}=args;
 const state=await page.evaluate(({table,index})=>{
  const roots=[...document.querySelectorAll('[data-tid]')].filter(e=>e.getAttribute('data-tid')===table.table_tid);if(roots.length!==1)throw Error('Table root changed');
  const grids=[...roots[0].querySelectorAll('.x-grid-view')].map(e=>({e,b:e.getBoundingClientRect()})).filter(({e,b})=>e.checkVisibility()&&b.width>20&&b.height>20&&b.x>=0&&b.y>=0&&b.y<innerHeight&&e.querySelector('table.x-grid-item')).sort((a,b)=>b.b.width-a.b.width);
  if(!grids.length)throw Error('Visible grid unavailable');const {e,b}=grids[0];
  const visible=[...e.querySelectorAll('table.x-grid-item')].map(r=>({index:Number(r.getAttribute('data-recordindex')),b:r.getBoundingClientRect()})).filter(r=>r.b.y>=b.y&&r.b.bottom<=Math.min(b.bottom,innerHeight));
  if(!visible.length)throw Error('No visible rows');
  const low=Math.min(...visible.map(r=>r.index)),high=Math.max(...visible.map(r=>r.index));
  return {x:Math.min(innerWidth-10,b.x+b.width/2),y:Math.min(innerHeight-10,b.y+b.height/2),direction:index<low?-1:index>high?1:0,low,high};
 },args);
 // A wheel can finish between the failed read and this fresh geometry sample.
 // Re-observe the cells without issuing a second wheel in that case.
 if(!state.direction)return state;
 await page.mouse.move(state.x,state.y);await page.mouse.wheel(0,state.direction*250);
 return state;
}
for(let index=0;index<=1000;index++){
 let raw;
 for(let tries=0;tries<30;tries++){
  raw=await execute(makeNodeTableContextCode(binding,table,{row_offset:index,row_limit:1,column_offset:0,column_limit:5}));
  if(raw.verified)break;
  if(!['row_not_rendered','cell_not_visible'].includes(raw.reason))throw Error('Full table read refused: '+raw.reason);
  await execute('async page=>('+scrollRow.toString()+')(page,'+JSON.stringify({table,index})+')');
 }
 if(!raw?.verified)throw Error('Full table row readiness exhausted at '+index+': '+raw?.reason);
 if(!first)first=raw;
 if(raw.schema_id!==first.schema_id||raw.row_total!==first.row_total||raw.column_total!==5||JSON.stringify(raw.segment)!==JSON.stringify(first.segment))throw Error('Full table changed');
 if(raw.rows.length!==Math.min(1,raw.row_total-index))throw Error('Incomplete row');
 if(raw.rows.length){if(raw.rows[0].index!==index)throw Error('Row identity differs');rows.push(raw.rows[0]);}
 if(index%20===0)await fs.writeFile(evidenceDir+'/'+op.id+'-progress.json',JSON.stringify({rows_read:rows.length,row_total:raw.row_total,complete:false}));
 if(index+1>=raw.row_total)break;
}
if(rows.length!==first.row_total)throw Error('Full table incomplete');
const decoded=decodeTableOutput({...first,table,rows,row_total:first.row_total,column_total:first.column_total,sample_complete:true},{formatProof:format,readSettings:settings,expectedColumns:result.output.ports[0].schema,requireExactNumbers:true});
await fs.writeFile(evidenceDir+'/'+op.id+'-raw.json',JSON.stringify({binding,format,settings,first,rows}));
const restored=await restoreTablePrecision(channel,format);const returned=await returnFromOutputTable(channel,table);
const evidence={verified:true,complete:true,node:result.node,execution_id:result.execution.execution_id,port_guid:table.port_guid,table,schema:decoded.schema,row_count:decoded.row_count,rows:decoded.sample,restored,returned};
await fs.writeFile(evidenceDir+'/'+op.id+'-progress.json',JSON.stringify({rows_read:rows.length,row_total:first.row_total,complete:true}));
await fs.writeFile(evidenceDir+'/'+evidenceId+'.json',JSON.stringify({...evidence,diagnostic_operation_id:op.id}));return evidence;

}
