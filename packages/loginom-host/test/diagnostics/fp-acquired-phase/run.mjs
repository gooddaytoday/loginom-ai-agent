import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {mkdir,writeFile,mkdtemp,readdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [product,sourceHost,factory,rawOutput,phase]=process.argv.slice(2),output=resolve(rawOutput),resources=join(product,'resources/loginom'),kit=import.meta.dirname;
await mkdir(output,{recursive:true});let row;
const original=cp.fork;
cp.fork=(entry,args,options)=>{
 assert.equal(entry,join(resources,'host/node-host.mjs'));
 const child=original(phase==='INSTALLED'?entry:sourceHost,args,{...options,execArgv:[...options.execArgv,'--import',pathToFileURL(join(kit,'../fp-retained-admission/host-preload.mjs')).href],env:{...options.env,FP_BOUND_RUNTIME:join(resources,'runtime'),FP_BOUND_NATIVE:pathToFileURL(join(kit,'native.mjs')).href,FP_BOUND_CASE:row.mode},stdio:['ignore','ignore','inherit','ipc']});
 row.child=child;row.exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.on('message',m=>row.messages.push(m));return child;
};syncBuiltinESMExports();
const {launchFieldParametersDiagnostic:launch}=await import(pathToFileURL(factory));
const results=[];
const rejected=async promise=>{try{await promise;throw Error('EXPECTED_REFUSAL')}catch(e){if(e?.message==='EXPECTED_REFUSAL')throw e;return e}};
const wait=async predicate=>{for(let i=0;i<1500;i++){const found=row.messages.find(predicate);if(found)return found;await new Promise(resolve=>setTimeout(resolve,5))}throw Error('FIXTURE_REPLY_MISSING')};
try{
 for(const mode of ['canonical-phase','foreign-grant','missing-run','preabort-capture','phase-held-false','phase-held-undefined']){
  row={mode,messages:[]};const root=await mkdtemp(join(output,mode+'-'));
  await mkdir(join(root,'connection'),{recursive:true,mode:0o700});await writeFile(join(root,'connection/connection.json'),JSON.stringify({generation:1,revision:1,url:'https://labelled.invalid/app/',username:'worker',secrets:{format:'loginom-cli-secrets-v1',protection:'plaintext',payload:JSON.stringify({apiKey:'labelled',password:'labelled'})}}),{mode:0o600});
  const controller=new AbortController(),deadline=Date.now()+(mode.startsWith('phase-held')?2500:60000),control={signal:controller.signal,deadline};
  const input={node:join(resources,'bin/node'),entry:join(resources,'host/node-host.mjs'),root,resources,headless:true,packagePath:'/worker/fp.lgp'};
  try{
   const host=await launch(input,control);assert.equal(launch.retained(input),host);
   assert.deepEqual(await host.request('acquire',{run:'original-run',session:'original-session'}),{generation:1});
   if(mode==='foreign-grant')await rejected(host.request('acceptance.capture',{run:'original-run',authorization:'foreign'}));
   else if(mode==='missing-run')await rejected(host.capture('foreign-run'));
   else if(mode==='preabort-capture'){controller.abort(false);assert.equal(await rejected(host.capture('original-run')),false)}
   else {
    const attempt=rejected(host.capture('original-run'));
    if(mode.startsWith('phase-held')){
     await wait(m=>m.fixture==='phase-login-pending');
     await new Promise(resolve=>setTimeout(resolve,Math.max(1,deadline-Date.now()+40)));
     const ready=row.messages.find(m=>m.fixture==='bound-start'&&m.binding);assert(ready);
     assert(!row.messages.some(m=>m.fixture==='bound-managed-reply'&&m.packet.id===ready.requestId),'original reply stays pending until owned login await settles');
     row.child.send({fixture:'bound-resolve'});
    }
    await attempt;
    const ready=row.messages.find(m=>m.fixture==='bound-start'&&!m.binding),capture=row.messages.find(m=>m.fixture==='bound-start'&&m.binding);assert(ready&&capture);
    assert.equal(capture.startup.phase,'capture');assert.deepEqual(capture.startup.binding,capture.binding);
    for(const key of ['requestId','authorization','harness','deadline'])assert.equal(capture.startup[key],ready.startup[key]);
    assert.equal(capture.deadline,deadline);assert.equal(capture.binding.run,'original-run');assert.equal(capture.binding.lease,capture.binding.owner+':original-run');assert.equal(capture.binding.account,'worker');
    if(mode==='canonical-phase'){
     const reply=row.messages.find(m=>m.fixture==='bound-managed-reply'&&m.packet.result?.refused)?.packet.result;assert(reply);assert.equal(reply.rejected.message,'LOGINOM_FP_DRAFT_UNKNOWN');assert.equal(reply.cleanupComplete,false);
    }else{
     const reply=await wait(m=>m.fixture==='bound-managed-reply'&&m.packet.id===capture.requestId);assert.equal(reply.packet.rejectionOrigin,'control');
     assert.equal(reply.packet.secondaryRejection.kind,'value');assert.equal(reply.packet.secondaryRejection.is_undefined,mode==='phase-held-undefined');assert.equal(reply.packet.secondaryRejection.value,mode==='phase-held-undefined'?null:false);
    }
    const files=(await readdir(join(root,'recovery'))).filter(x=>x.endsWith('.json'));
    if(mode==='canonical-phase'){assert.equal(files.length,1);row.journal=JSON.parse(await readFile(join(root,'recovery',files[0]),'utf8'))}
    else{assert.equal(files.length,0,'failed startup precedes capture journal admission');row.journal=null}
    await rejected(host.request('release',{run:'original-run'}));
   }
   if(['foreign-grant','missing-run','preabort-capture'].includes(mode))assert.equal(row.messages.filter(m=>m.fixture==='bound-start').length,1,'no acquired-chat dispatch');
   results.push({mode,pass:true,journal:row.journal,nativeAuthority:false,messages:row.messages});
  }finally{
   if(row.child?.connected)row.child.send({fixture:'bound-finish'});
   if(row.exit)assert.deepEqual(await row.exit,{code:0,signal:null});
   const exits=row.messages.filter(m=>m.fixture==='bound-managed-exit');assert(exits.every(m=>m.code===0&&m.signal===null));
   await writeFile(join(root,'raw-chronology.json'),JSON.stringify(row.messages,null,2)+'\n');
  }
  console.log(phase,mode,'PASS');
 }
}finally{cp.fork=original;syncBuiltinESMExports()}
await writeFile(join(output,'results.json'),JSON.stringify({phase,cases:results.length,results,native_verified:false,capture_proxy_complete:false},null,2)+'\n');
