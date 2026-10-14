import assert from'node:assert/strict';import cp from'node:child_process';import{syncBuiltinESMExports}from'node:module';import{mkdtemp,mkdir,writeFile}from'node:fs/promises';import{resolve,join}from'node:path';import{pathToFileURL}from'node:url';
const[modulePath,rawProduct,rawOut,phase]=process.argv.slice(2),product=resolve(rawProduct),out=resolve(rawOut),resources=join(product,'resources/loginom'),node=join(resources,'bin/node'),entry=join(resources,'host/node-host.mjs');await mkdir(out,{recursive:true});
const original=cp.fork;let active;cp.fork=(target,args,options)=>{
 assert.equal(target,entry);const child=original(target,args,{...options,execArgv:[...options.execArgv,'--import',pathToFileURL(resolve('loginom-ai-agent/packages/loginom-host/test/diagnostics/fp-retained-admission/host-preload.mjs')).href],env:{...options.env,FP_BOUND_RUNTIME:join(resources,'runtime'),FP_BOUND_NATIVE:pathToFileURL(resolve('loginom-ai-agent/packages/loginom-host/test/diagnostics/amount-acquired-provider/native.mjs')).href,FP_BOUND_CASE:'canonical'},stdio:['ignore','ignore','inherit','ipc']});active=child;return child;
};syncBuiltinESMExports();const m=await import(pathToFileURL(resolve(modulePath))),rows=[];
for(const mode of ['missing-provider','fake-port','input-drift','preabort']){
 const root=await mkdtemp(join(out,mode+'-'));await mkdir(join(root,'connection'),{recursive:true});await writeFile(join(root,'connection/connection.json'),JSON.stringify({generation:39,revision:1,url:'https://labelled.invalid/app/',username:'worker',secrets:{format:'loginom-cli-secrets-v1',protection:'plaintext',payload:JSON.stringify({apiKey:'labelled',password:'labelled'})}}),{mode:0o600});
 const input={node,entry,root,resources,headless:true,strictRecovery:true,environment:{}};let host;
 try{
  host=await m.launchNodeHost(input);assert(m.hasOriginalNodeHostPort(host.port));
  if(mode==='fake-port')await assert.rejects(m.acquireOriginalNodeHostOwner({...host.port},'run','session'),/PROVIDER_UNAVAILABLE/);
  else if(mode==='input-drift'){input.root+='/foreign';await assert.rejects(m.acquireOriginalNodeHostOwner(host.port,'run','session'),/OWNER_CHANGED/)}
  else if(mode==='preabort'){const controller=new AbortController();controller.abort(false);let caught=false;try{await m.acquireOriginalNodeHostOwner(host.port,'run','session',{signal:controller.signal,deadline:Date.now()+10000})}catch(value){caught=true;assert.equal(value,false)}assert(caught)}
  else{
   await assert.rejects(m.acquireOriginalNodeHostOwner(host.port,'run','session'),/ORIGINAL_HOST_REPLY_INVALID|PROVIDER_UNAVAILABLE|HOST_NOT_READY/);
   await assert.rejects(m.acquireOriginalNodeHostOwner(host.port,'run','session'),/PROVIDER_UNAVAILABLE/);
  }
  rows.push({mode,pass:true,genuineFactoryPort:true,originalSameChild:true,ownerCapabilityReturned:false,native:false});
 }finally{if(active?.connected)active.send({fixture:'bound-finish'});if(host)assert.deepEqual(await host.exited,{code:0,signal:null})}
}
cp.fork=original;syncBuiltinESMExports();await writeFile(join(out,'results.json'),JSON.stringify({phase,pass:rows.length,rows,limits:(phase==='SOURCE_FIXTURE'?'SOURCE_COMPILED original factory/source host/service':'SOURCE_COMPILED original parent factory->ACTUAL_INSTALLED host/service')+' through real Node IPC. Managed readiness SDK/Page/login/session/catalog are named doubles. Actual service currently HOST_NOT_READY; no owner capability/qualified acquired service tuple returned. No host/factory/granted-handle target replacement; not embedded parent factory/native/cleanup proof.'},null,2));
