import test from 'node:test';
import assert from 'node:assert/strict';
import {compactNodeResult,userResultSchema} from '../lib/user-results.mjs';
import {budgetUserPreview,previewWireSize} from '../lib/user-preview-budget.mjs';
import {nodeResultReply} from '../lib/node-result-reply.mjs';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv';
const real=value=>({type:'real',value,decimal:value.toExponential(16).toUpperCase(),display_text:value.toExponential(16).toUpperCase().replace('.',','),precision:'17_significant_digits',representation:'binary64',is_null:false});
const integer=value=>({type:'integer',value:String(value),precision:'exact_integer',representation:'decimal_integer',is_null:false});
const string=value=>({type:'string',value,precision:'display_text',representation:'cached_display_text',is_null:false});
const raw=sample=>({operation_id:'preview',state:'settled',outcome:{status:'SUCCEEDED',effect_possible:true,cleanup_complete:true,output:{output:{ports:[{port:0,row_count:sample.length,sample,sample_rows:sample.length,sample_complete:true,schema:sample[0].map((c,index)=>({index,name:'field'+index,label:'Field '+index,type:c.type})),precision:{numbers_verified:true}}]}}}});
test('actual MCP delivery budgets both copies of the 72-row retention preview without losing the whole result',()=>{
 const sample=Array.from({length:72},(_,i)=>[real((i+1)/101*100),string('Cohort_'+(i%6+1)),integer(i%12+1),integer(101),real(i+1)]);
 const source=raw(sample),before=JSON.stringify(source),reply=nodeResultReply(source,{userProfile:true});
 assert.equal(reply.isError,undefined);assert.ok(Buffer.byteLength(JSON.stringify(reply),'utf8')<=46000);
 assert.deepEqual(JSON.parse(reply.content[0].text),reply.structuredContent);
 const value=reply.structuredContent,port=value.output.ports[0];
 assert.equal(new AjvJsonSchemaValidator().getValidator(userResultSchema)(value).valid,true);
 assert.ok(port.sample_rows>0&&port.sample_rows<72);assert.equal(port.row_count,72);assert.equal(port.sample_complete,false);
 assert.equal(port.sample_rows,port.sample.length);assert.equal(JSON.stringify(source),before);
 assert.ok(value.limitations.some(item=>item.includes('only '+port.sample_rows+' of 72 rows')));
 assert.ok(value.limitations.some(item=>item.includes('omitted '+(72-port.sample_rows)+' already-read rows')));
 for(let i=0;i<port.sample.length;i++)for(let j=0;j<5;j++){
  const original=sample[i][j],cell=port.sample[i][j];
  assert.equal(cell.type,original.type);assert.equal(cell.precision,original.precision);assert.equal(cell.is_null,false);
  if(cell.decimal)assert.ok(Object.is(Number(cell.decimal),original.value));else assert.equal(cell.value,original.value);
 }
});
test('actual MCP delivery preserves whole long, Cyrillic and JSON-escaped cells while returning a bounded prefix',()=>{
 for(const text of ['x'.repeat(3000),'Выручка'.repeat(180),'"\\\n\u0001😀'.repeat(180)]){
  const source=raw(Array.from({length:100},(_,i)=>[string(String(i)+':'+text)]));
  source.outcome.error={code:'READ_PARTIAL',message:'Получена только часть результата'};
  source.outcome.next_step={tool:'dock_operation_inspect',arguments:{operation_id:'preview'}};
  const admitted=JSON.stringify(source),reply=nodeResultReply(source,{userProfile:true});
  assert.equal(reply.isError,undefined);assert.ok(Buffer.byteLength(JSON.stringify(reply),'utf8')<=46000);
  assert.deepEqual(JSON.parse(reply.content[0].text),reply.structuredContent);
  const value=reply.structuredContent,port=value.output.ports[0];
  assert.equal(value.operation_id,'preview');assert.equal(value.status,'SUCCEEDED');
  assert.deepEqual(value.error,source.outcome.error);assert.deepEqual(value.next_step,source.outcome.next_step);
  assert.ok(port.sample_rows>0&&port.sample_rows<100);assert.equal(port.row_count,100);assert.equal(port.sample_complete,false);
  assert.ok(value.limitations.some(item=>item.includes('only '+port.sample_rows+' of 100 rows')));
  assert.ok(value.limitations.some(item=>item.includes('omitted '+(100-port.sample_rows)+' already-read rows')));
  port.sample.forEach((row,index)=>assert.equal(row[0].value,String(index)+':'+text));
  assert.equal(JSON.stringify(source),admitted);
 }
});
test('actual MCP preview budget includes recalculated row, zero and NULL limitations',()=>{
 const source=raw(Array.from({length:100},(_,i)=>[integer(0),{type:'integer',is_null:true,precision:'unverified'},string(i+':'+'x'.repeat(1500))]));
 const before=JSON.stringify(source),reply=nodeResultReply(source,{userProfile:true});
 assert.equal(reply.isError,undefined);assert.ok(Buffer.byteLength(JSON.stringify(reply),'utf8')<=46000);
 const value=reply.structuredContent,port=value.output.ports[0];
 assert.ok(port.sample_rows>0&&port.sample_rows<100);assert.equal(port.sample_complete,false);
 assert.ok(value.limitations.some(item=>item.includes('only '+port.sample_rows+' of 100 rows')));
 assert.ok(value.limitations.some(item=>item.includes(port.sample_rows+' returned numeric cells contain explicit zero')));
 assert.ok(value.limitations.some(item=>item.includes('every returned cell is NULL in ["field1"]')&&item.includes('only the '+port.sample_rows+' returned rows')));
 assert.equal(JSON.stringify(source),before);
});
test('actual MCP delivery refuses native full-table overflow without reducing its evidence or retained receipt',()=>{
 // Delivery-only fixture; native evidence provenance is verified by the reader.
 const source=raw([[string('x'.repeat(24000))]]),port=source.outcome.output.output.ports[0];
 port.exact_table={rows:[['x'.repeat(24000)]],complete:true};port.read_coverage={table_complete:true};
 const before=JSON.stringify(source),reply=nodeResultReply(source,{userProfile:true});
 assert.equal(reply.isError,true);assert.equal(JSON.parse(reply.content[0].text).error.code,'USER_RESPONSE_BUDGET');
 assert.equal(JSON.parse(reply.content[0].text).original_operation_id,'preview');assert.equal(JSON.stringify(source),before);
 assert.equal(port.sample_rows,1);assert.equal(port.sample_complete,true);assert.equal(port.exact_table.rows.length,1);
});
test('complete 72-row retention preview stays below spillover with every exact value preserved',()=>{
 const sample=Array.from({length:72},(_,i)=>[real((i+1)/101*100),string('Cohort_'+(i%6+1)),integer(i%12+1),integer(101),real(i+1)]);
 const source=raw(sample),before=JSON.stringify(source),reply=compactNodeResult(source),port=reply.output.ports[0];
 assert.equal(JSON.stringify(source),before);assert.equal(port.sample.length,72);assert.equal(port.sample_complete,true);
 assert.ok(previewWireSize(reply)<45000);assert.equal(new AjvJsonSchemaValidator().getValidator(userResultSchema)(reply).valid,true);
 for(let i=0;i<72;i++)for(let j=0;j<5;j++){
  const original=sample[i][j],cell=port.sample[i][j];assert.equal(cell.type,original.type);assert.equal(cell.precision,original.precision);assert.equal(cell.is_null,false);
  if(cell.decimal)assert.ok(Object.is(Number(cell.decimal),original.value));else assert.equal(cell.value,original.value);
 }
});
test('large strings trim whole rows explicitly without truncating cell contents or changing source',()=>{
 const source=raw(Array.from({length:100},(_,i)=>[string(String(i)+':'+ 'x'.repeat(3000))])),before=JSON.stringify(source),reply=compactNodeResult(source),port=reply.output.ports[0];
 assert.ok(previewWireSize(reply)<50000);assert.ok(port.sample_rows>0&&port.sample_rows<100);assert.equal(port.row_count,100);assert.equal(port.sample_complete,false);
 assert.equal(port.sample[0][0].value,source.outcome.output.output.ports[0].sample[0][0].value);assert.equal(JSON.stringify(source),before);
 assert.ok(reply.limitations.some(s=>s.includes('only '+port.sample_rows+' of 100')));assert.ok(reply.limitations.some(s=>s.includes('response budget omitted')));
});
test('Cyrillic preview fits the backend UTF-8 budget and retains continuation diagnostics',()=>{
 const source=raw(Array.from({length:100},(_,i)=>[string(String(i)+':'+ 'Выручка'.repeat(60))]));
 source.outcome.error={code:'READ_PARTIAL',message:'Получена только часть результата'};
 source.outcome.next_step={tool:'dock_operation_inspect',arguments:{operation_id:'preview'}};
 const reply=compactNodeResult(source);
 assert.ok(Buffer.byteLength(JSON.stringify(reply),'utf8')<50*1024);
 assert.deepEqual(reply.error,source.outcome.error);
 assert.deepEqual(reply.next_step,source.outcome.next_step);
 assert.equal(reply.operation_id,'preview');
 assert.ok(reply.output.ports[0].sample_rows>0);
 assert.equal(reply.output.ports[0].sample[0][0].value,source.outcome.output.output.ports[0].sample[0][0].value);
});
test('six-column retention keeps all rows with shorter round-trip decimals',()=>{
 const sample=Array.from({length:72},(_,i)=>[real((i+1)/101*100),real((i+1)/101),real(i+1),integer(101),string('Cohort_'+(i%6+1)),integer(i%12+1)]);
 const source=raw(sample),before=JSON.stringify(source),reply=compactNodeResult(source),port=reply.output.ports[0];
 assert.equal(JSON.stringify(source),before);assert.equal(port.sample_rows,72);assert.equal(port.sample_complete,true);
 assert.ok(previewWireSize(reply)<50000);
 for(let i=0;i<72;i++)for(let j=0;j<6;j++){
  const cell=port.sample[i][j],original=sample[i][j];
  assert.equal(cell.type,original.type);assert.equal(cell.precision,original.precision);
  if(cell.decimal)assert.ok(Object.is(Number(cell.decimal),original.value));else assert.equal(cell.value,original.value);
 }
});
test('large integers, NULL, unverified variants, mismatched decimals and negative zero retain their meaning',()=>{
 const special=[integer('9223372036854775807'),{type:'integer',is_null:true,precision:'unverified'},
  {type:'variant',is_null:false,display_text:'001',precision:'unverified',representation:'formatted_display'},
  {...real(1),decimal:'2E+00'}, {...real(-0),decimal:'-0E+00',display_text:'-0E+00'}];
 const reply=compactNodeResult(raw([special,...Array.from({length:99},()=>special.map(c=>structuredClone(c)))]));
 const cells=reply.output.ports[0].sample[0];assert.equal(cells[0].value,'9223372036854775807');assert.deepEqual(cells[1],special[1]);assert.deepEqual(cells[2],special[2]);assert.deepEqual(cells[3],special[3]);
 assert.ok(Object.is(Number(cells[4].decimal),-0));
});
test('native full-table evidence is never reduced or downgraded by the legacy preview budget',()=>{
 const reply={output:{ports:[{exact_table:{rows:Array(50).fill('x'.repeat(2000)),complete:true},sample:[],sample_rows:0,read_coverage:{table_complete:true}}]},limitations:[]};
 const before=structuredClone(reply);assert.ok(previewWireSize(reply)>50000);budgetUserPreview(reply);assert.deepEqual(reply,before);
});
