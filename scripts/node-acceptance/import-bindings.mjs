import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {matchesExpectedOutput} from './expected-outputs.mjs';
export function auditImportBindings(events,initial,final){
 const checkpoints=events.flatMap((e,index)=>e.phase==='node_checkpoint'&&e.result?.status==='SUCCEEDED'&&e.result.cleanup_complete===true?[{index,result:e.result}]:[]);
 const matches=(c,w)=>c.result.execution?.status==='completed'&&c.result.output?.ports?.some(p=>p.port===0&&p.fresh===true&&p.execution_id===c.result.execution.execution_id&&matchesExpectedOutput(p,w.outputs[0]));
 const first=checkpoints.find(c=>matches(c,initial)&&c.result.configuration?.bindings?.length===1);assert.ok(first,'IMPORT_BINDING_INITIAL');
 const b=first.result.configuration.bindings[0];
 assert.equal(b.parameter,'/settings/source/source_path');assert.equal(b.mode,'variable');assert.equal(b.variable.name,'CsvPath');assert.equal(b.variable.type,'string');assert.equal(b.variable.kind,'variables');
 assert.equal(b.source.type,'variables.user');assert.equal(b.source.output,4);assert.equal(b.verified,true);
 const patch=events.findIndex((e,i)=>i>first.index&&e.phase==='node_apply_prepared'&&e.request?.target?.type==='variables.user'&&e.request.parameters?.variables?.some(v=>v.name==='CsvPath'));
 assert.ok(patch>first.index,'IMPORT_BINDING_SOURCE_UPDATE');
 assert.equal(events[patch].request.target.ref.node_id,b.source.ref.node_id);
 const value=final.variable_inventory.outputs[0].variables.find(v=>v.name==='CsvPath').value;
 assert.deepEqual(events[patch].request.parameters.variables,[{name:'CsvPath',type:'string',value}]);
 const second=checkpoints.find(c=>c.index>patch&&c.result.node.node_id===first.result.node.node_id&&matches(c,final)&&c.result.execution.execution_id!==first.result.execution.execution_id);
 assert.ok(second,'IMPORT_BINDING_FINAL_SAME_NODE');assert.deepEqual(second.result.configuration.bindings.map(x=>[x.parameter,x.variable.name,x.variable.type,x.source.ref.node_id]),[[b.parameter,'CsvPath','string',b.source.ref.node_id]]);
 for(const c of [first,second])assert.deepEqual(c.result.output.ports[0].schema.map(f=>f.name),initial.outputs[0].columns.map(f=>f.name),'IMPORT_BINDING_FIELD_ORDER');
 for(const [index,e] of events.entries()){
  if(index<=first.index||e.phase!=='node_apply_prepared'||e.request?.target?.type!=='imports.text')continue;
  const r=e.request;assert.equal(r.target.kind,'existing','IMPORT_BINDING_SECOND_NODE');assert.equal(r.target.ref.node_id,first.result.node.node_id);
  assert.ok(r.mode==='read_existing_output'||JSON.stringify(r.parameters)==='{"settings":{}}'&&!r.inputs.length&&!r.mappings.length&&!r.variable_inputs?.length&&!r.bindings?.length,'IMPORT_BINDING_RECONFIGURED');
 }
 const source=c=>c.result.node?.node_id===b.source.ref.node_id?c.result.configuration?.readback?.variables??c.result.output?.variable_ports?.[0]?.variables:undefined;
 const before=checkpoints.filter(c=>c.index<first.index).map(source).filter(Boolean).at(-1),after=checkpoints.filter(c=>c.index>patch).map(source).find(Boolean);
 assert.ok(before&&after,'IMPORT_BINDING_SOURCE_INVENTORY');assert.deepEqual(before.map(v=>[v.id,v.index,v.name,v.type]),after.map(v=>[v.id,v.index,v.name,v.type]));
 const sentinel=v=>v.find(x=>x.name==='Sentinel');assert.ok(sentinel(before));assert.deepEqual(sentinel(before),sentinel(after));
 return {status:'PASS',node:first.result.node,binding:b,initial_execution_id:first.result.execution.execution_id,final_execution_id:second.result.execution.execution_id};
}
export async function observeImportBindingInventory({load,graph,channelFor,expected,record}){
 const {resolveImportBindingValue,importBindingInventory,readImportBindingField}=await load('client/lib/import-bindings.mjs');
 const result=[];
 for(const want of expected.binding_inventory){
  assert.equal(want.node.type,'imports.text');
  const targets=graph.nodes.filter(n=>n.type===want.node.type);assert.equal(targets.length,1,'COLD_BINDING_NODE_UNIQUE');
  const node=targets[0].ref,links=graph.variable_links.filter(l=>l.target===node.node_id&&l.kind==='variables'&&l.input===0);assert.equal(links.length,1);
  const source=graph.nodes.find(n=>n.ref.node_id===links[0].source);assert.equal(source.type,'variables.user');
  const proof=await channelFor(source.ref,'cold-import-binding-source').configureUserVariables([],'close');
  const channel=channelFor(node,'cold-import-binding');
  // Use the production readback order: restore the prepared target and settle
  // its field editor before opening W1 after the source wizard was cancelled.
  const s=await readImportBindingField(channel);
  const mapped=await channel.readVariablePortMapping({direction:'input',kind:'variables',port:0});
  assert.ok(mapped.verified&&mapped.cleanup_complete&&mapped.independent_readback);
  const value=resolveImportBindingValue(proof,want.variable.name,mapped.mapping);
  const bindings=importBindingInventory(s.wizard.import_source.fields.source_path,{...value,mapping:mapped.mapping,source,link:links[0],graph},node),b=bindings[0];
  assert.equal(b.parameter,want.parameter);assert.equal(b.mode,want.mode);
  for(const [key,value] of Object.entries(want.variable))assert.deepEqual(b.variable[key],value);
  assert.equal(b.source.type,want.source.type);assert.equal(b.source.output,want.source.output);result.push({node,bindings});
 }
 await record({phase:'cold_parameter_bindings',inventory:result,settings_applied:false});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [initial,final,events]=process.argv.slice(2).map(p=>JSON.parse(readFileSync(p,'utf8')));
 console.log(JSON.stringify(auditImportBindings(events,initial,final)));
}
