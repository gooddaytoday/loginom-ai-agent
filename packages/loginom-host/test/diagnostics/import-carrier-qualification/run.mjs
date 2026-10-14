import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp,mkdir,readdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,entry,sourceValidator,rawOutput,phase]=process.argv.slice(2),out=resolve(rawOutput);
await mkdir(out,{recursive:true});const results=[];
const {validateStartInput}=await import(pathToFileURL(sourceValidator));
const selected=await import(pathToFileURL(join(product,'resources/loginom/host/fp-private-launcher.mjs')));
assert.deepEqual(Object.keys(selected),['launchFieldParametersDiagnostic']);
for(const mode of ['import-purpose','foreign-resource','foreign-export','foreign-phase','copied-owner','late-opening','pending-unknown']){
 const root=await mkdtemp(join(out,mode+'-')),node=join(product,'resources/loginom/bin/node');
 const child=fork(entry,[],{execPath:node,execArgv:['--use-system-ca'],stdio:['ignore','ignore','ignore','ipc']});
 const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal}))),messages=[];
 child.on('message',m=>messages.push(m));let n=0;
 const send=(method,input)=>new Promise(resolve=>{const id='original_'+(++n),listener=m=>{if(m.id===id){child.off('message',listener);resolve(m)}};child.on('message',listener);child.send({id,method,deadline:Date.now()+60000,input})});
 const grant={authorization:'a'.repeat(64),packagePath:'/worker/import.lgp',harness:'import-before-configure-v1'};
 if(mode==='foreign-resource')grant.resource_path='runtime/src/acceptance/foreign.mjs';
 if(mode==='foreign-export')grant.entry='foreignCapture';
 if(mode==='foreign-phase')grant.phase='configured';
 if(mode==='copied-owner')grant.owner={page:{},context:{},native_proof:true};
 if(mode==='late-opening')grant.opening={status:'completed',operation_id:'late'};
 if(mode==='pending-unknown')grant.pending={phase:'UNKNOWN'};
 try{
  const reply=await send('start',{protocol:1,root,resources:join(product,'resources/loginom'),headless:true,acceptanceCapture:grant});
  assert.equal(reply.error,'LOGINOM_HANDSHAKE_INVALID');
  const capture=await send('acceptance.capture',{run:'late_run',authorization:grant.authorization});assert.equal(capture.error,'LOGINOM_HOST_NOT_READY');
  assert.deepEqual(await readdir(root),[],'refusal precedes host FS/native/managed dispatch');
 }finally{if(child.connected)child.disconnect();assert.deepEqual(await exit,{code:0,signal:null})}
 results.push({mode,pass:true,messages,exit:await exit,provider:false,loaderDispatch:0,sampleRead:0,record:0,nativeAuthority:false});
}
for(const mode of ['import-kind','import-in-fp-phase','foreign-account','foreign-generation','expired']){
 const deadline=Date.now()+60000,binding={revision:1,harness:'import-before-configure-v1',owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'worker',admission:'own',expires:deadline,packagePath:'/worker/import.lgp'};
 const input={protocol:1,generation:1,chat:'chat',stateDir:'/own',connection:{username:'worker'},acceptanceCapture:binding};
 if(mode==='import-in-fp-phase')input.fpStartup={requestId:'original',authorization:'a'.repeat(64),harness:'field-parameters-preservation-v1',deadline,phase:'capture',binding:{...binding}};
 if(mode==='foreign-account')binding.account='foreign';if(mode==='foreign-generation')binding.generation=2;if(mode==='expired')binding.expires=Date.now()-1;
 assert.throws(()=>validateStartInput(input),/LOGINOM_START_INVALID/);results.push({mode,pass:true,provider:false,loaderDispatch:0,nativeAuthority:false});
}
const manifest=JSON.parse(await readFile(join(product,'resources/loginom/resource-manifest.json'),'utf8'));
for(const path of ['runtime/src/private-capture-resource.mjs','runtime/src/retained-capture.mjs','runtime/client/lib/import-original-opening.mjs','runtime/src/acceptance/import-preconfig-adapter-v1.mjs'])assert.equal(manifest.files.some(f=>f.path===path),false,'current common product has not received Import registration/slot '+path);
await writeFile(join(out,'results.json'),JSON.stringify({phase,pass:results.length,results,carrier:'IMPORT_ORIGINAL_PROVIDER_CREATION_PACKET_UNAVAILABLE',fullImportComposition:false,authorities:{native:false,configure:false,clean:false,close:false}},null,2)+'\n');
console.log(phase,results.length,'Import carrier ABI refusal controls PASS');
