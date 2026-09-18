import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createArtifactStore} from '../lib/artifacts.mjs';
import {validateTextExportParameters,validateExportDestination,validateNativeExportFormat} from '../lib/text-export-parameters.mjs';
import {compactNodeRequestFailure} from '../lib/user-results.mjs';
const binding={session_id:'session',document_id:'document',workflow_id:'workflow',node_id:'node',execution_id:'execution',destination:'/test-2/test.csv'};
const parameters={destination:'/test-2/test.csv',encoding:'UTF-8',delimiter:';',header:'names',bom:false,line_ending:'LF',decimal_separator:'.',null_marker:'?',text_qualifier:'"'};
test('export request refusals identify each invalid contract path and permit correction without effects',()=>{
 const base={operation_id:'export-invalid',target:{kind:'new',type:'exports.text'},read:{ports:[]},inputs:[{}],mappings:[]};
 for(const [path,change,mode] of [
  ['mode',{},'fixed'],['read.ports',{read:{ports:[0]}},'delimited'],
  ['mappings',{mappings:[{direction:'output',port:0}]},'delimited'],
  ['inputs',{inputs:[]},'delimited'],['inputs',{inputs:[{},{}]},'delimited'],
  ['read.sample_rows',{read:{ports:[],sample_rows:1}},'delimited'],
  ['read.require_exact_numbers',{read:{ports:[],require_exact_numbers:true}},'delimited']]){
  const request={...base,...change};let failure;
  try{validateTextExportParameters(parameters,mode,request);}catch(error){failure=compactNodeRequestFailure({error:{message:error.message},effect_possible:false},request);}
  assert.ok(failure);assert.equal(failure.error.parameter_path,path);
  assert.equal(failure.effect_possible,false);assert.equal(failure.cleanup_complete,true);
  assert.equal(failure.status,'NOT_APPLIED');assert.ok(failure.next_step);
  assert.doesNotThrow(()=>validateTextExportParameters(parameters,'delimited',{...base,operation_id:'export-corrected'}));
 }
});
test('export validation refuses unsafe destinations and unsupported formats before effect',()=>{
 for(const destination of ['/test-1/test.csv','/test-2/../x.csv','/test-2/a/../../x.csv','/test-2/a%2fb.csv','https://host/x.csv','/test-2/.hidden.csv','/test-2/file.xlsx'])assert.throws(()=>validateExportDestination(destination));
 const r={target:{kind:'new'},read:{ports:[]},inputs:[{}],mappings:[]};
 assert.doesNotThrow(()=>validateTextExportParameters(parameters,'delimited',r));
 for(const unknown of ['settings','format','columns','toString'])assert.throws(
  ()=>validateTextExportParameters({...parameters,[unknown]:{}},'delimited',r),
  error=>error.message.includes('parameters.parameters.'+unknown+': unknown text export parameter'));
 for(const p of [{...parameters,encoding:'ANSI'},{...parameters,delimiter:'.'},{...parameters,bom:'false'},{...parameters,overwrite:'yes'},{...parameters,extra:true}])assert.throws(()=>validateTextExportParameters(p,'delimited',r));
 assert.throws(()=>validateTextExportParameters(parameters,'delimited',{...r,read:{ports:[0]}}));
 for(const read of [{ports:[],sample_rows:1},{ports:[],require_exact_numbers:true}])assert.throws(()=>validateTextExportParameters(parameters,'delimited',{...r,read}));
 assert.throws(()=>validateTextExportParameters({overwrite:'replace'},'delimited',{...r,target:{kind:'existing'}}));
});
test('existing export patches reject unsupported retained formats before finish',()=>{
 const values=Object.fromEntries(Object.entries({encoding:65001,delimiter:';',header:1,line_ending:0,bom:false}).map(([k,value])=>[k,{value}]));
 assert.doesNotThrow(()=>validateNativeExportFormat(values));
 for(const [key,value] of Object.entries({encoding:1251,delimiter:' ',header:3,line_ending:2,bom:0}))assert.throws(()=>validateNativeExportFormat({...values,[key]:{value}}));
});
test('native output lease never becomes an input/upload grant and verifies real bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dock-export-'));try{
  const store=await createArtifactStore({directory:dir,sessionId:'session'}),lease=await store.stageOutput(binding);
  await assert.rejects(lease.verify('test.csv',0));
  await writeFile(lease.path,'id;text\n1;Привет\n');const bytes=Buffer.byteLength('id;text\n1;Привет\n');
  await assert.rejects(lease.verify('other.csv',bytes));await assert.rejects(lease.verify('test.csv',bytes-1));
  const descriptor=await lease.verify('test.csv',bytes);assert.equal(descriptor.bytes,bytes);assert.match(descriptor.sha256,/^[a-f0-9]{64}$/);assert.equal(descriptor.execution_id,'execution');
  await lease.retain();assert.deepEqual(store.list(),[]);assert.throws(()=>store.getUploadGrant(descriptor.artifact_id,'fake'));await assert.rejects(store.resolve(descriptor.artifact_id));
  assert.equal((await store.resolveOutput(descriptor.artifact_id)).buffer.toString(),'id;text\n1;Привет\n');
  await writeFile(lease.path,'changed');await assert.rejects(store.resolveOutput(descriptor.artifact_id));
  await lease.release();await assert.rejects(store.resolveOutput(descriptor.artifact_id));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('output lease rejects foreign session, substituted file and oversized bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dock-export-negative-'));try{
  const store=await createArtifactStore({directory:dir,sessionId:'session',maxBytes:20});
  await assert.rejects(store.stageOutput({...binding,session_id:'foreign'}));await assert.rejects(store.stageOutput({...binding,destination:'/test-1/x.csv'}));
  const lease=await store.stageOutput(binding),outside=join(dir,'unrelated');await writeFile(outside,'x');await symlink(outside,lease.path);
  await assert.rejects(lease.verify('test.csv',1));await lease.release();
  const second=await store.stageOutput(binding);await writeFile(second.path,'x'.repeat(21));await assert.rejects(second.verify('test.csv',21));await second.release();
  await store.releaseUploads();await assert.rejects(store.stageOutput(binding));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('native output staging reserves capacity and shutdown drains pending allocations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dock-export-capacity-'));try{
  const store=await createArtifactStore({directory:dir,sessionId:'session'});
  const pending=Array.from({length:8},()=>store.stageOutput(binding));
  await assert.rejects(store.stageOutput(binding));
  const drained=store.releaseUploads(),leases=await Promise.all(pending);
  assert.ok((await drained).every(r=>r.status==='fulfilled'));
  for(const lease of leases)await assert.rejects(lease.verify('test.csv',0));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('export continuation keeps only an unchanged acknowledged execution boundary',async()=>{
 const {exportContinuationSurface,verifyExportContinuation}=await import('../lib/text-export-continuation.mjs');
 const node={document_id:'doc',workflow_id:'wf',node_id:'node'},context={...node,verified:true,surface:'graph'};
 const surface={dom_epoch:{document:'doc',revision:3},prepared_node_context:context,wizard:{status:'absent'},node_processes:{verified:true,inventory_complete:true,show_completed:true,node_context:context,root_id:'root',processes:[{parent_id:null,process_id:'process',record_id:'record',error:false,state:'completed'}]}};
 const finish={verified:true,cleanup_complete:true,mode:'execute',settings_applied:true,execution_started:true,execution_id:'run',execution_group:{execution_id:'run',node,root_id:'root',group_id:'process',group_record_id:'record'},continuation_surface:exportContinuationSurface(surface)};
 assert.equal(verifyExportContinuation({node,finish,surface}),true);
 for(const change of [s=>s.dom_epoch.revision++,s=>s.prepared_node_context.node_id='foreign',s=>s.node_processes.processes[0].record_id='new',s=>s.node_processes.processes[0].error=true,s=>s.wizard.status='observed']){
  const other=structuredClone(surface);change(other);assert.equal(verifyExportContinuation({node,finish,surface:other}),false);
 }
 assert.equal(verifyExportContinuation({node,finish,surface,checkpoint:{phase:'read',read_only:true,cleanup_complete:true,execution_id:'run'}}),false);
});
