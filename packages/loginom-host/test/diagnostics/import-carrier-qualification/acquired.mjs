import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {mkdir,mkdtemp,writeFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,sourceHost,factory,rawOutput,phase]=process.argv.slice(2),out=resolve(rawOutput),r=join(product,'resources/loginom'),kit=import.meta.dirname;
await mkdir(out,{recursive:true});const original=cp.fork;let row;const results=[];
cp.fork=(entry,args,options)=>{
 assert.equal(entry,join(r,'host/node-host.mjs'));
 const child=original(phase==='INSTALLED'?entry:sourceHost,args,{...options,execArgv:[...options.execArgv,'--import',pathToFileURL(join(kit,'../fp-retained-admission/host-preload.mjs')).href],env:{...options.env,FP_BOUND_RUNTIME:join(r,'runtime'),FP_BOUND_NATIVE:pathToFileURL(join(kit,'../fp-retained-admission/native.mjs')).href,FP_BOUND_CASE:'canonical'},stdio:['ignore','ignore','inherit','ipc']});
 row.child=child;row.exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.on('message',m=>row.messages.push(m));return child;
};syncBuiltinESMExports();
try{
 const {launchFieldParametersDiagnostic:launch}=await import(pathToFileURL(factory));
 for(const mode of ['foreign-import-route-on-actual-lease','json-creation-packet-on-actual-lease']){
  row={mode,messages:[]};const root=await mkdtemp(join(out,mode+'-'));await mkdir(join(root,'connection'),{recursive:true,mode:0o700});
  await writeFile(join(root,'connection/connection.json'),JSON.stringify({generation:1,revision:1,url:'https://labelled.invalid/app/',username:'worker',secrets:{format:'loginom-cli-secrets-v1',protection:'plaintext',payload:JSON.stringify({apiKey:'labelled',password:'labelled'})}}),{mode:0o600});
  try{
   const control={signal:new AbortController().signal,deadline:Date.now()+60000},input={node:join(r,'bin/node'),entry:join(r,'host/node-host.mjs'),root,resources:r,headless:true,packagePath:'/worker/fp.lgp'};
   const host=await launch(input,control);assert.equal(launch.retained(input),host);assert.deepEqual(await host.request('acquire',{run:'actual-run',session:'actual-session'}),{generation:1});
   const request={run:'actual-run',authorization:'model-import-token',harness:'import-before-configure-v1'};
   if(mode==='json-creation-packet-on-actual-lease')request.creation={owner:'copied',generation:1,account:'worker',page:{},context:{},bridge:{},client:{},opening:{status:'completed'},native_proof:true,clean_verified:true};
   for(let attempt=0;attempt<2;attempt++)await assert.rejects(host.request('acceptance.capture',request),/LOGINOM_METHOD_INVALID/);
   assert.equal(row.messages.filter(m=>m.fixture==='bound-start').length,1,'no acquired Import/FP chat is dispatched from copied Import facts');
   assert(!row.messages.some(m=>m.fixture==='bound-read-entered'));
   assert.deepEqual(await readdir(join(root,'recovery')),[],'no capture/evidence journal before qualified route');
   results.push({mode,pass:true,realHostServiceLeaseIPCFS:true,importDispatch:0,sampleRead:0,evidenceRecord:0,messages:row.messages,authority:false});
  }finally{if(row.child?.connected)row.child.send({fixture:'bound-finish'});if(row.exit)assert.deepEqual(await row.exit,{code:0,signal:null});assert(row.messages.filter(m=>m.fixture==='bound-managed-exit').every(m=>m.code===0&&m.signal===null));await writeFile(join(root,'chronology.json'),JSON.stringify(row.messages,null,2)+'\n')}
 }
}finally{cp.fork=original;syncBuiltinESMExports()}
await writeFile(join(out,'results.json'),JSON.stringify({phase,results,pass:results.length,compatibleImportProvider:false,nativeAuthority:false,labels:'Actual fixed FP factory/host/service/lease; Import route NOT_SUPPORTED. SDK/Page/native/session/catalog doubles only; no supplied grant or provider, no Import sample/result/Close acceptance.'},null,2)+'\n');
console.log(phase,results.length,'genuine acquired-lease Import route refusal controls PASS');
