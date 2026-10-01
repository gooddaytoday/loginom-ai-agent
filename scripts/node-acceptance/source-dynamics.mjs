// Addressed public-path reproduction. Run with the pinned candidate Node inside
// the slot's qualified headed harness. Never pass another account's connection.
import {fork} from 'node:child_process';
import {parseArgs} from 'node:util';
import {readFile,mkdir,appendFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const args=parseArgs({options:{resources:{type:'string'},connection:{type:'string'},data:{type:'string'},expected:{type:'string'},output:{type:'string'},package:{type:'string'},scenario:{type:'string',default:'width'}}}).values;

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
function verify(result,spec){
 const port=result.output.ports[0];assert.equal(result.output.status,'complete');
 assert.equal(port.fresh,true);assert.equal(port.execution_id,result.execution.execution_id);
 assert.equal(port.filter_enabled,false);assert.equal(port.sample_complete,true);assert.equal(port.precision.numbers_verified,true);
 assert.deepEqual(port.schema.map(f=>({name:f.name,label:f.label,type:f.type,data_kind:f.data_kind})),spec.fields.map(({used,...field})=>field));
 assert(port.schema.every(f=>f.data_kind_source==='fresh_native'));
 assert.deepEqual(port.sample.map(row=>row.map(c=>c.value)),spec.rows);
 assert(port.sample.every(row=>row.every((c,i)=>c.type===spec.fields[i].type&&c.is_null===(c.value===null))));
 return port;
}
try{
 await ipc('start',{protocol:1,generation:1,chat:'sliding-'+randomUUID(),stateDir:join(args.output,'state'),resources,headless:false,
  endpoint:manifest.endpoint,actionManifestUri:manifest.actionManifestUri,actionManifestSha256:manifest.actionManifestSha256,
  connection:{url:connection.url,username:connection.username,password:secrets.password,apiKey:secrets.apiKey},acceptanceCleanupPackage:args.package});
 const specifications=JSON.parse(await readFile(args.expected,'utf8'));
 assert.equal(specifications.version,'loginom-source-dynamics-v1');
 const manifestCLI=JSON.parse(await readFile(join(resources,'..','..','cli-manifest.json'),'utf8'));
 assert.equal(manifestCLI.metadata.sourceDirty,false);
 const files=await Promise.all(specifications.scenarios.map(async spec=>{const name=spec.id+'.csv',sourcePath=join(args.data,name),buffer=await readFile(sourcePath);return {sourcePath,name:'LOG-51-'+randomUUID()+'-'+name,bytes:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex'),upload:{directory:'/'+connection.username,overwrite:'reject'}};}));
 const artifacts=await ipc('admit',{userMessage:randomUUID(),files});
 const preparation=await call('dock_prepare',{intent:'new_draft'});
 const prepared=preparation.workspace;assert.equal(prepared.status,'READY');
 const common={contract_revision:'1.0.0',document_id:prepared.document_id,workflow_ref:{workflow_id:prepared.workflow_ref.workflow_id},inputs:[],finish:'execute',mode:'delimited',read:{ports:[0],sample_rows:100,require_exact_numbers:true}};
 const deliveries=[];
 for(const [i,artifact] of artifacts.entries())deliveries.push(await settled('dock_artifact_deliver',{operation_id:'deliver-'+i,artifact_id:artifact.artifact_id,upload_grant_id:artifact.upload.grant_id,budget_ms:60000}));
 let source,finalImport,final,failed;
 const observations=[];
 const apply=(index,operationID,columns)=>settled('dock_node_apply',{...common,operation_id:operationID,target:source?{kind:'existing',type:'imports.text',ref:source.node}:{kind:'new',type:'imports.text',label:'Dynamic source'},parameters:{source:{artifact_id:artifacts[index].artifact_id,upload_operation_id:deliveries[index].upload_operation_id??'deliver-'+index+':upload'},settings:{source:{source_path:artifacts[index].upload.destination},format:{null_marker:'?'},columns}}});
 for(const [index,spec] of specifications.scenarios.entries()){
  const imported=await apply(index,'import-'+spec.id,spec.fields);
  source??=imported;finalImport=imported;
  assert.deepEqual(imported.node,source.node);
  const result=index===0?source:await settled('dock_node_read',{operation_id:'original-s-'+spec.id,source_operation_id:'import-baseline',read:{ports:[0],sample_rows:100,require_exact_numbers:true}});
  assert.deepEqual(result.node,source.node);
  final=verify(result,spec);assert.equal(final.port_guid,source.output.ports[0].port_guid);
  observations.push({id:spec.id,execution:result.execution,output:final});
 }
 // A real bound wizard/source inventory refusal, followed by correction on the
 // same import. Preserve the failure; do not relaunch an uncertain operation.
 const bad=await ipc('call',{name:'dock_node_apply',arguments:{...common,operation_id:'missing-source-field',target:{kind:'existing',type:'imports.text',ref:source.node},parameters:{settings:{columns:[{name:'MissingSourceField',label:'Missing'}]}}}});
 failed=bad.result.structuredContent??JSON.parse(bad.result.content.find(c=>c.type==='text').text.split('\n\n')[0]);
 while(failed.state==='running')failed=await call('dock_node_wait',{operation_id:'missing-source-field',timeout_ms:60000});
 await writeFile(join(args.output,'failure.json'),JSON.stringify(redactor.redact(failed),null,2)+'\n');
 assert.equal(failed.status,'FAILED');assert.equal(failed.cleanup_complete,true);assert.deepEqual(failed.node,source.node);
 finalImport=await apply(3,'import-corrected',specifications.scenarios[3].fields);
 const recovered=await settled('dock_node_read',{operation_id:'original-s-recovered',source_operation_id:'import-baseline',read:{ports:[0],sample_rows:100,require_exact_numbers:true}});
 assert.deepEqual(recovered.node,source.node);final=verify(recovered,specifications.scenarios[3]);
 assert.equal(new Set([...observations.map(o=>o.execution.execution_id),recovered.execution.execution_id]).size,5);
 await call('dock_action_describe',{action_keys:['package.save_checkpoint']});
 const saved=await call('dock_action_run',{action_key:'package.save_checkpoint',operation_id:'save-after-final-read',parameters:{path:args.package,conflict_policy:'fail'}});
 assert.equal(saved.status??saved.outcome?.status,'SUCCEEDED');
 const continuation=saved.output.workflow_continuations.find(c=>c.workflow_ref.navigation_path.at(-1).label===prepared.workflow_ref.navigation_path.at(-1).label);
 assert(continuation,'Saved workflow continuation required');
 const spec=specifications.scenarios[3],readback=finalImport.configuration.readback;
 assert.deepEqual(readback.columns,spec.fields.map((f,index)=>({index,...f})));
 const oracle={version:'loginom-multi-output-v1',owner:{source_sha:manifestCLI.metadata.sourceCommit,package_path:args.package,workflow_id:source.node.workflow_id,node_id:source.node.node_id},ports:[{index:0,role:'source',guid:final.port_guid,schema:spec.fields.map((f,index)=>({index,name:f.name,label:f.label,type:f.type,data_kind:f.data_kind,null_semantics:'typed_null'})),comparator:'sequence',rules:spec.fields.map(()=>({kind:'exact'})),rows:spec.rows.map(row=>row.map((value,index)=>({type:spec.fields[index].type,is_null:value===null,value})))}],invariants:[]};
 const cold={version:'loginom-cold-scenarios-v1',package_path:args.package,scenarios:[{id:'metadata-recovered',nodes:[{type:'imports.text'}],output_node_type:'imports.text',graph:{navigation_path:continuation.workflow_ref.navigation_path.map(p=>p.label),nodes:[{id:source.node.node_id,type:'imports.text',inputs:[],outputs:[0]}],service_nodes:[{type:'bg-vendor-icon-modelvariables',count:1}],links:[]},settings:[{node_id:source.node.node_id,kind:'text-import-ui-v1',values:{source:readback.source,format:readback.format,columns:readback.columns}}],oracle}]};
 await writeFile(join(args.output,'cold-expected.json'),JSON.stringify(cold,null,2)+'\n');
 await writeFile(join(args.output,'public-result.json'),JSON.stringify({status:'PASS',source_sha:manifestCLI.metadata.sourceCommit,node:source.node,source_operation_id:'import-baseline',package_path:args.package,inputs:files.map(({sourcePath,...f})=>f),requested:specifications,observations,failure:failed,recovered,save:saved},null,2)+'\n');
}finally{await ipc('close');}
