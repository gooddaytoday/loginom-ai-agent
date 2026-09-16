import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {adaptCell,adaptRead,proposedUserPort,temporalProfile} from './adapter.mjs';
const observed=JSON.parse(readFileSync(new URL('./observed.json',import.meta.url)));
const options={dateProfile:temporalProfile};
const all=observed.flatMap(x=>x.cells);
function fixture(n=15){
 // Synthetic single-column projection of saved live bytes; no live full-table claim.
 const raw={read_id:'r1',method:321,interface:116,port:0,document_id:'d',workflow_id:'w',package_id:'pkg',node_id:'n',port_guid:'p',source:{owner:0,object:9},execution:{status:'completed',execution_id:'d:1:2'},schema:[{name:'Values',label:'Values',type:6}],row_count:n,owner_rechecked:true,cache_identity_rechecked:true,
 cells:observed[0].cells.slice(0,n).map((c,row)=>({...structuredClone(c),row,column:0,message_id:100+row}))};
 return {raw,context:{...options,expected:structuredClone(raw),lifecycle:{id:'r1',status:'completed',published:true,pending:0,retired:false,requests:raw.cells.length,releasedRequests:raw.cells.length,releasedResponses:raw.cells.length},consistency:{kind:'observed_local',changed:false,exclusive_operation:true,stability_basis:'owned_static_completed_fixture'}}};
}
test('38 observed native payloads serialize with exact tag and significant scalar bytes',()=>{
 assert.equal(all.length,38);
 for(const c of all){const cell=JSON.parse(JSON.stringify(adaptCell(c,{type:'variant'},options)));
  assert.equal(cell.native.tag,c.tag);
  if([20,5,7].includes(c.tag))assert.equal(cell.native.bytes_le,Buffer.from(c.payload.slice(2,10)).toString('hex'));
  if(c.tag===8)assert.equal(cell.value,Buffer.from(cell.native.utf8_hex,'hex').toString('utf8'));
  if(c.tag===11)assert.equal(cell.native.bytes_le,c.payload[2]?'01':'00');
  if(c.tag===20)assert.equal(BigInt(cell.value),Buffer.from(c.payload).readBigInt64LE(2));
  if(c.tag===5){const b=Buffer.alloc(8);b.writeDoubleLE(Number(cell.value));assert.equal(b.toString('hex'),cell.native.bytes_le);}
  if(c.tag===7){assert.equal(cell.value,Buffer.from(c.payload.slice(2)).toString('hex'));assert.equal(cell.native.epoch_verified,false);assert.equal(cell.native.civil_time_verified,false);}
 }
});
test('same display integer1 / real1 / string1 remains distinct; Null differs from empty and bool',()=>{
 const c=observed[0].cells.map(c=>adaptCell(c,{type:'variant'},options));
 assert.deepEqual([c[3].cell_type,c[4].cell_type,c[2].cell_type],['integer','real','string']);
 assert.equal(c[3].value,c[4].value);assert.equal(c[4].value,c[2].value);
 assert.equal(c[5].value,null);assert.equal(c[7].value,'');assert.equal(c[1].value,true);assert.equal(c[6].value,false);
});
test('table completeness and public 10-row sample are separate after JSON roundtrip',()=>{
 const f=fixture();const t=adaptRead(f.raw,f.context),u=JSON.parse(JSON.stringify(proposedUserPort(t)));
 assert.equal(t.coverage.table_complete,true);assert.equal(u.sample_complete,false);assert.equal(u.sample_rows,10);assert.equal(u.read_coverage.cells_read,15);assert.equal(u.exact_table.rows.length,15);assert.equal(u.exact_table.complete,true);
 assert.equal(u.sample[3][0].cell_type,'integer');assert.equal(u.sample[4][0].native.tag,5);
 assert.equal(u.read_consistency.atomic_snapshot,false);assert.equal(u.read_consistency.unobserved_aba_excluded,false);
});
test('only scalar column of a four-column table is partial; DataTypes absence is irrelevant',()=>{
 const f=fixture();f.raw.schema=observed[2].schema;f.raw.cells=observed[2].cells;f.context.expected=structuredClone(f.raw);
 const t=adaptRead(f.raw,f.context);assert.equal(t.coverage.table_complete,false);assert.equal(proposedUserPort(t).sample_rows,0);
});
test('empty complete schema and results larger than bound cannot be confused',()=>{
 const f=fixture(0);assert.equal(adaptRead(f.raw,f.context).coverage.table_complete,true);
 const g=fixture();g.raw.row_count=51;g.context.expected.row_count=51;assert.equal(adaptRead(g.raw,g.context).coverage.table_complete,false);
});
for(const [name,change] of [
 ['foreign execution',f=>f.raw.execution.execution_id='d:1:9'],['foreign owner',f=>f.raw.source.object=10],
 ['stale cache',f=>f.raw.cache_identity_rechecked=false],['observed change',f=>f.context.consistency.changed=true],
 ['missing exclusion',f=>f.context.consistency.exclusive_operation=false],['deadline',f=>f.context.lifecycle.status='deadline_exceeded'],
 ['pending',f=>f.context.lifecycle.pending=1],['late status from another read',f=>f.context.lifecycle.id='other'],
 ['missing cell',f=>f.raw.cells.pop()],['duplicate cell',f=>f.raw.cells[1].row=0],['duplicate reply',f=>f.raw.cells[1].message_id=100],
 ['unsupported tag32',f=>f.raw.cells[0].tag=3],['unknown datetime semantics',f=>f.context.dateProfile='browser-epoch'],
 ['tag differs from bytes',f=>f.raw.cells[0].tag=5],['trailing payload',f=>f.raw.cells[0].payload.push(0)],
 ['invalid byte',f=>f.raw.cells[0].payload[0]=256],['unknown schema',f=>{f.raw.schema[0].type=99;f.context.expected=structuredClone(f.raw);}],
 ])test('fail closed: '+name,()=>{const f=fixture();change(f);assert.throws(()=>adaptRead(f.raw,f.context));});
test('source metadata and cached decoded/display values cannot change scalar identity',()=>{
 const c=structuredClone(observed[0].cells[3]);c.decoded={type:'string',value:'1'};c.display_text='false';c.Names='S';c.DataTypes=5;
 assert.equal(adaptCell(c,{type:'variant'},options).cell_type,'integer');
});

test('unused Null/boolean/string slot bytes never escape into user-v1',()=>{
 for(const i of [1,2,5]){const c=structuredClone(observed[0].cells[i]),original=adaptCell(c,{type:'variant'},options);for(let j=c.tag===11?3:2;j<10;j++)c.payload[j]=255;assert.deepEqual(adaptCell(c,{type:'variant'},options),original);}
});

test('missing workflow identity and unknown dataset stability cannot grant exact read',()=>{
 const a=fixture();delete a.raw.workflow_id;delete a.context.expected.workflow_id;assert.throws(()=>adaptRead(a.raw,a.context));
 const b=fixture();b.context.consistency.stability_basis='external_live_query';assert.throws(()=>adaptRead(b.raw,b.context));
});
test('50-row/8-column read bounds are enforced independently of row count',()=>{
 const f=fixture();f.raw.row_count=51;f.raw.cells=Array.from({length:51},(_,i)=>({...f.raw.cells[3],row:i,column:0,message_id:i}));f.context.expected=structuredClone(f.raw);Object.assign(f.context.lifecycle,{requests:51,releasedRequests:51,releasedResponses:51});assert.throws(()=>adaptRead(f.raw,f.context),/row read bound/);
 const g=fixture();g.raw.schema=Array.from({length:9},(_,i)=>({name:'c'+i,label:'c'+i,type:6}));g.context.expected=structuredClone(g.raw);assert.throws(()=>adaptRead(g.raw,g.context),/table bounds/);
});
test('full projection refuses oversized serialization rather than silently truncating',()=>{
 const f=fixture();const t=adaptRead(f.raw,f.context);t.cells=t.cells.map(c=>({...c,value:'x'.repeat(100000)}));assert.throws(()=>proposedUserPort(t),/serialized output limit/);
});
