// Audit public CLI tool receipts, not model text or an independently opened table.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {join} from 'node:path';
const [eventsPath,expectedDirectory,outputPath]=process.argv.slice(2);
const calls=(await readFile(eventsPath,'utf8')).trim().split('\n').map(line=>JSON.parse(line)).filter(event=>event.part?.type==='tool'&&event.part.state?.status==='completed').map(event=>({tool:event.part.tool,input:event.part.state.input,result:JSON.parse(event.part.state.output.split('\n\n')[0].replace(/(:\s*)\[redacted\](?=[,}])/g,'$1"[redacted]"')),timestamp:event.timestamp}));
const settled=id=>calls.filter(call=>call.result.operation_id===id&&call.result.status==='SUCCEEDED').at(-1);
const source=settled('sliding-base');assert(source,'Initial Sliding output missing');
const reads=[['sliding-base','base'],['sliding-changed-read','changed'],['sliding-restored-read','base'],['sliding-same-count-read','same-count']];
const executions=new Set(),evidence=[];
for(const [id,scenario] of reads){
 const call=settled(id);assert(call,'Successful public read missing: '+id);
 if(id!=='sliding-base'){
  const admitted=calls.find(call=>call.tool==='loginom_dock_node_read'&&call.input.operation_id===id);
  assert.equal(admitted?.input.source_operation_id,'sliding-base');
 }
 const result=call.result,port=result.output?.ports?.[0];assert(port,id);
 assert.equal(result.cleanup_complete,true);assert.deepEqual(result.node,source.result.node);
 assert.equal(port.port_guid,source.result.output.ports[0].port_guid);assert.equal(port.port,0);
 assert.equal(result.execution.status,'completed');assert.equal(port.execution_id,result.execution.execution_id);
 assert(!executions.has(port.execution_id),'Stale execution');executions.add(port.execution_id);
 assert.equal(port.fresh,true);assert.equal(port.filter_enabled,false);assert.equal(port.sample_complete,true);
 assert.equal(port.row_count,2);assert.equal(port.sample_rows,2);assert.equal(port.precision.numbers_verified,true);
 const expected=JSON.parse(await readFile(join(expectedDirectory,`expected-${scenario}-server.json`),'utf8'));
 assert.deepEqual(port.schema.map(c=>({name:c.name,label:c.label,type:c.type})),expected.columns);
 const values=port.sample.map(row=>Object.fromEntries(row.map((cell,index)=>{
  assert.equal(cell.type,port.schema[index].type);assert.equal(cell.is_null,cell.value===null);
  assert(cell.is_null||cell.type==='string'||cell.precision==='17_significant_digits');
  return [port.schema[index].name,cell.is_null?null:cell.type==='real'?Number(cell.value):cell.value];
 })));
 assert.deepEqual(values,expected.rows);
 assert(port.category_mapping?.length===(port.schema.length-1)/2);
 for(const mapping of port.category_mapping)for(const fact of mapping.facts){
  const field=port.schema.find(field=>field.name===fact.name);assert(field.label.startsWith(mapping.category+'|'));
 }
 evidence.push({id,scenario,timestamp:call.timestamp,node:result.node,execution_id:port.execution_id,port});
}
const configurations=calls.filter(call=>call.tool==='loginom_dock_node_apply'&&call.input.target.type==='transform.cross_table');
assert.equal(configurations.length,1,'CrossTable recreated or reconfigured');
const imports=calls.filter(call=>call.tool==='loginom_dock_node_apply'&&call.input.target.type==='imports.text');
assert.equal(imports.filter(call=>call.input.target.kind==='new').length,1);
const imported=settled(imports[0].input.operation_id).result.node;
for(const call of imports.slice(1))assert.deepEqual(call.input.target.ref,imported);
assert(calls.some(call=>call.tool==='loginom_dock_action_run'&&call.result.status==='SUCCEEDED'&&call.timestamp>evidence.at(-1).timestamp),'Save after latest public read missing');
const uploads=calls.filter(call=>call.tool==='loginom_dock_artifact_deliver'&&call.result.status==='SUCCEEDED');
assert.equal(uploads.length,3);assert(uploads.every(call=>call.result.output.upload_completion_verified===true));
await writeFile(outputPath,JSON.stringify({status:'PASS',path:'public loginom_dock_node_read',import:imported,uploads:uploads.map(call=>call.result.output),evidence},null,2)+'\n');
console.log('PASS: public 9→7 and C→D (9→9), same IDs/source operation, exact values, NULL, categories and save');
