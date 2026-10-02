// Addressed public-path reproduction. Run with the pinned candidate Node inside
// the slot's qualified headed harness. Never pass another account's connection.
import {fork} from 'node:child_process';
import {parseArgs} from 'node:util';
import {readFile,mkdir,appendFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const args=parseArgs({options:{resources:{type:'string'},connection:{type:'string'},data:{type:'string'},expected:{type:'string'},output:{type:'string'},package:{type:'string'},scenario:{type:'string',default:'width'}}}).values;
assert(['width','same-count'].includes(args.scenario));
for(const key of ['resources','connection','data','expected','output','package'])assert(args[key],key+' required');
process.umask(0o077);
await mkdir(args.output,{recursive:false,mode:0o700});
const resources=resolve(args.resources),manifest=JSON.parse(await readFile(join(resources,'resource-manifest.json'),'utf8'));
const connection=JSON.parse(await readFile(args.connection,'utf8'));
const secrets=JSON.parse(connection.secrets.payload);
const {createRedactor}=await import(join(resources,'runtime/client/lib/redact.mjs'));
const redactor=createRedactor([secrets.apiKey,secrets.password].filter(Boolean));
const child=fork(join(resources,'runtime/src/managed-entry.mjs'),[],{stdio:['ignore','ignore','pipe','ipc']});
child.stderr.on('data',buffer=>process.stderr.write(redactor.text(buffer.toString())));
const pending=new Map();
child.on('message',message=>{const pair=pending.get(message.id);if(!pair)return;pending.delete(message.id);message.error?pair.reject(Error(message.error)):pair.resolve(message.result);});
child.on('exit',()=>{for(const pair of pending.values())pair.reject(Error('Managed runtime exited'));pending.clear();});
const ipc=(operation,input)=>new Promise((resolve,reject)=>{const id=randomUUID();pending.set(id,{resolve,reject});child.send({id,operation,input});});
async function call(name,parameters){
 const envelope=await ipc('call',{name,arguments:parameters});
 const result=envelope.result.structuredContent??JSON.parse(envelope.result.content.find(c=>c.type==='text').text.split('\n\n')[0]);
 await appendFile(join(args.output,'public-calls.jsonl'),JSON.stringify(redactor.redact({name,parameters,result}))+'\n');
 if(envelope.result.isError)throw Error(JSON.stringify(result));
 return result;
}
async function settled(name,parameters){
 let result=await call(name,parameters);
 while(result.state==='running')result=await call(name==='dock_artifact_deliver'?'dock_artifact_delivery_wait':'dock_node_wait',{operation_id:parameters.operation_id,timeout_ms:60000});
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));assert.equal(result.cleanup_complete,true);
 return result;
}
function verify(result,expected){
 assert.equal(result.output.status,'complete');
 const port=result.output.ports[0];assert.equal(port.fresh,true);assert.equal(port.execution_id,result.execution.execution_id);
 assert.equal(port.filter_enabled,false);assert.equal(port.sample_complete,true);assert.equal(port.precision.numbers_verified,true);
 assert.equal(port.row_count,2);assert.equal(port.sample.length,2);assert.equal(port.schema.length,expected.columns.length);
 assert.deepEqual(port.schema.map(c=>({name:c.name,label:c.label,type:c.type})),expected.columns.map(c=>({name:c.name,label:c.label??c.name,type:c.type})));
 assert.deepEqual(port.sample.map(row=>Object.fromEntries(row.map((cell,i)=>[port.schema[i].name,cell.is_null?null:cell.type==='real'?Number(cell.value):cell.value]))),expected.rows);
 for(const row of port.sample)for(const cell of row)assert(cell.is_null||cell.type==='string'||cell.precision==='17_significant_digits');
 return port;
}
try{
 await ipc('start',{protocol:1,generation:1,chat:'sliding-'+randomUUID(),stateDir:join(args.output,'state'),resources,headless:false,
  endpoint:manifest.endpoint,actionManifestUri:manifest.actionManifestUri,actionManifestSha256:manifest.actionManifestSha256,
  connection:{url:connection.url,username:connection.username,password:secrets.password,apiKey:secrets.apiKey},acceptanceCleanupPackage:args.package});
 const names=['base.csv',args.scenario==='width'?'changed.csv':'same-count.csv'];
 const files=await Promise.all(names.map(async name=>{const sourcePath=resolve(args.data,name),buffer=await readFile(sourcePath);return {sourcePath,name:'sliding-'+randomUUID()+'-'+name,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex'),upload:{directory:'/'+connection.username,overwrite:'reject'}};}));
 const artifacts=await ipc('admit',{userMessage:randomUUID(),files});
 const preparation=await call('dock_prepare',{intent:'new_draft'});
 const prepared=preparation.workspace;assert.equal(prepared.status,'READY');
 const common={contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:{workflow_id:prepared.workflow_ref.workflow_id},inputs:[],finish:'execute'};
 const deliveries=[];
 for(const [i,artifact] of artifacts.entries()){
  const delivery=await settled('dock_artifact_deliver',{operation_id:'deliver-'+i,artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:60000});
  assert.equal(delivery.output.upload_completion_verified,true);deliveries.push(delivery);
 }
 const imported=await settled('dock_node_apply',{...common,operation_id:'import-base',target:{kind:'new',type:'imports.text',label:'CSV'},mode:'delimited',parameters:{source:{artifact_id:artifacts[0].artifact_id,upload_operation_id:deliveries[0].upload_operation_id??'deliver-0:upload'},settings:{source:{source_path:artifacts[0].upload.destination},format:{null_marker:'?'},columns:[{name:'Region',type:'string'},{name:'Category',type:'string'},{name:'Amount',type:'real'},{name:'Quantity',type:'integer'}]}}});
 const source=await settled('dock_node_apply',{...common,operation_id:'sliding-base',target:{kind:'new',type:'transform.cross_table',label:'Sliding'},inputs:[{source:imported.node,output:0,input:0}],mode:'pivot',parameters:{rows:[{kind:'input_field',name:'Region'}],column:{kind:'input_field',name:'Category'},facts:['Amount','Quantity'].map(name=>({field:{kind:'input_field',name},functions:['sum']})),columns:{mode:'sliding',min_values:0}},read:{ports:[0],sample_rows:100,require_exact_numbers:true}});
 const baseExpected=JSON.parse(await readFile(join(args.expected,'expected-base-server.json'),'utf8'));
 const first=verify(source,baseExpected);
 const changed=await settled('dock_node_apply',{...common,operation_id:'import-changed',target:{kind:'existing',type:'imports.text',ref:imported.node},mode:'delimited',parameters:{source:{artifact_id:artifacts[1].artifact_id,upload_operation_id:deliveries[1].upload_operation_id??'deliver-1:upload'},settings:{source:{source_path:artifacts[1].upload.destination}}}});
 assert.deepEqual(changed.node,imported.node);
 const reread=await settled('dock_node_read',{operation_id:'sliding-changed-read',source_operation_id:'sliding-base',read:{ports:[0],sample_rows:100,require_exact_numbers:true}});
 assert.deepEqual(reread.node,source.node);assert.notEqual(reread.execution.execution_id,source.execution.execution_id);
 const expected=JSON.parse(await readFile(join(args.expected,args.scenario==='width'?'expected-changed-server.json':'expected-same-count-server.json'),'utf8'));
 const final=verify(reread,expected);assert.equal(final.port_guid,first.port_guid);
 await call('dock_action_describe',{action_keys:['package.save_checkpoint']});
 const saved=await call('dock_action_run',{action_key:'package.save_checkpoint',operation_id:'save-after-read',parameters:{path:args.package,conflict_policy:'fail'}});
 assert.equal(saved.status??saved.outcome?.status,'SUCCEEDED',JSON.stringify(saved));
 await writeFile(join(args.output,'public-result.json'),JSON.stringify({status:'PASS',scenario:args.scenario,node:source.node,import:imported.node,source_operation_id:'sliding-base',package_path:args.package,source_execution:source.execution.execution_id,final_execution:reread.execution.execution_id,output:final},null,2)+'\n');
}finally{await ipc('close');}
