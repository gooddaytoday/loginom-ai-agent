import assert from 'node:assert/strict'
import cp from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'
import {mkdir,writeFile,readFile,mkdtemp,readdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const [product,hostFile,factory,rawOut,phase,only]=process.argv.slice(2),out=resolve(rawOut),r=join(product,'resources/loginom'),kit=import.meta.dirname
await mkdir(out,{recursive:true})
const originalFork=cp.fork;let row
cp.fork=(entry,args,options)=>{
 assert.equal(entry,join(r,'host/node-host.mjs'));row.forks++
 const child=originalFork(phase==='INSTALLED'?entry:hostFile,args,{...options,execArgv:[...options.execArgv,'--import',pathToFileURL(join(kit,'host-preload.mjs')).href],env:{...options.env,FP_BOUND_CASE:row.mode,FP_BOUND_RUNTIME:join(r,'runtime'),FP_BOUND_NATIVE:pathToFileURL(join(kit,'native.mjs')).href},stdio:['ignore','ignore','inherit','ipc']})
 row.child=child;row.exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));row.messages=[];child.on('message',m=>row.messages.push(m));return child
}
syncBuiltinESMExports()
const {launchFieldParametersDiagnostic:launch}=await import(pathToFileURL(factory))
async function wait(test){for(let i=0;i<2000;i++){const m=row.messages.find(test);if(m)return m;if(row.child?.exitCode!==null)throw Error('Own host exited before receipt '+row.name);await new Promise(resolve=>setTimeout(resolve,5))}throw Error('Missing receipt '+row.name)}
async function refusal(action){try{await action();throw Error('Expected refusal')}catch(error){if(error?.message==='Expected refusal')throw error;return error}}
const results=[]
async function run(name,action,mode='canonical'){
 if(only&&name!==only)return
 row={name,mode,forks:0};const root=await mkdtemp(join(out,name+'-'));row.root=root;await mkdir(join(root,'connection'),{recursive:true,mode:0o700})
 await writeFile(join(root,'connection/connection.json'),JSON.stringify({generation:1,revision:1,url:'https://labelled.invalid/app/',username:'worker',secrets:{format:'loginom-cli-secrets-v1',protection:'plaintext',payload:JSON.stringify({apiKey:'labelled',password:'labelled'})}}),{mode:0o600})
 const controller=new AbortController(),deadline=Date.now()+(mode==='late-deadline'||mode==='expired-after-start'?8000:60000),control={signal:controller.signal,deadline},input={node:join(r,'bin/node'),entry:join(r,'host/node-host.mjs'),root,resources:r,headless:true,packagePath:'/worker/fp.lgp'}
 let host
 try{
  if(mode==='multiple-pages'){const error=await refusal(()=>launch(input,control));assert.equal(error.message,'LOGINOM_STARTUP_OWNER_CHANGED');assert(!row.messages.some(m=>m.fixture==='bound-read-entered'));row.nativeAdmission='initial retained startup owner refusal'}else{
  host=await launch(input,control);assert.equal(row.forks,1);assert.equal(launch.retained(input),host)
  assert.deepEqual(await host.request('acquire',{run:'owned-run',session:'owned-session'}),{generation:1})
  await action({host,controller,control,input,deadline})
  }
  assert.equal(row.forks,1)
  row.child.send({fixture:'bound-finish'})
  assert.deepEqual(await row.exit,{code:0,signal:null})
  const exits=row.messages.filter(m=>m.fixture==='bound-managed-exit');assert(exits.length>=1);assert(exits.every(m=>m.code===0&&m.signal===null))
  results.push({name,pass:true,nativeAdmission:row.nativeAdmission,journal:row.journal,messages:row.messages,host_exit:await row.exit,labels:'Actual fixed factory/receiver/host/HostPort/supervisor/managed/qualified owner/bridge/executor; SDK/native/Page/session/catalog service doubles only. No supplied grant, copied owner handles, model/native/prepare/Apply/Done/Close/replay/release.'})
 console.log(phase,name,'PASS')
 }finally{await writeFile(join(root,'raw-chronology.json'),JSON.stringify(row.messages??[],null,2));if(row.child?.connected)row.child.send({fixture:'bound-finish'});if(row.exit)await row.exit}
}
async function deniedAfterRead(host){for(const method of ['acceptance.capture','release'])await refusal(()=>host.request(method,method==='release'?{run:'owned-run'}:{run:'owned-run',authorization:'model-grant'}));await refusal(()=>host.capture('owned-run'));await refusal(()=>host.request('call',{run:'owned-run',name:'dock_node_apply',args:{}}));assert(!row.messages.some(m=>m.fixture==='bound-mutation'));}
await run('actual-original-qualification',async({host,control,deadline})=>{
 const result=await host.readPreReady('owned-run',control)
 assert.deepEqual([result.kind,result.ready,result.cleanupComplete],['PRE_READY_CLOSED_READ',false,false]);assert.equal(result.observation.target_state,'ready_for_prepare')
 const start=row.messages.find(m=>m.fixture==='bound-start'&&m.binding);assert(start);const b=start.binding
 assert.equal(b.harness,'field-parameters-preservation-v1');assert.equal(b.run,'owned-run');assert.equal(b.lease,b.owner+':'+b.run);assert.equal(b.generation,1);assert.equal(b.account,'worker');assert.equal(b.packagePath,'/worker/fp.lgp');assert.equal(b.expires,deadline)
 await deniedAfterRead(host)
})
await run('admission-without-native-configure',async({host})=>{
 await refusal(()=>host.capture('owned-run'))
 const reply=row.messages.find(m=>m.fixture==='bound-managed-reply'&&m.packet.result?.refused)?.packet.result
 assert(reply);assert.equal(reply.cleanupComplete,false);assert.equal(reply.refused,true);assert.equal(reply.rejectedIsUndefined,false);assert.equal(reply.rejected.name,'Error');assert.equal(reply.rejected.message,'LOGINOM_FP_DRAFT_UNKNOWN')
 await refusal(()=>host.capture('owned-run'));await refusal(()=>host.request('release',{run:'owned-run'}))
 const files=(await readdir(join(row.root,'recovery'))).filter(f=>f.endsWith('.json'));assert.equal(files.length,1);const journals=JSON.parse(await readFile(join(row.root,'recovery',files[0]),'utf8'));assert.equal(journals.generation,1);assert.equal(journals.chat,row.messages.find(m=>m.fixture==='bound-start'&&m.binding).binding.chat)
 row.nativeAdmission='UNKNOWN: no original configure/editor/store/context; actual bridge/executor refuses before private component/mutation';row.journal= journals
})
for(const field of ['signal','deadline'])await run('foreign-control-'+field,async({host,control})=>{
 const changed={...control,...(field==='signal'?{signal:new AbortController().signal}:{deadline:control.deadline+1000})};const e=await refusal(()=>host.readPreReady('owned-run',changed));assert.equal(e.message,'LOGINOM_HANDSHAKE_INVALID');assert(!row.messages.some(m=>m.fixture==='bound-read-entered'))
})
for(const authorization of ['foreign','',null,undefined])await run('missing-or-foreign-grant-'+String(authorization),async({host})=>{await refusal(()=>host.request('readonly.preReady',{run:'owned-run',authorization}));assert(!row.messages.some(m=>m.fixture==='bound-read-entered'))})
await run('foreign-run',async({host,control})=>{await refusal(()=>host.readPreReady('foreign-run',control));assert(!row.messages.some(m=>m.fixture==='bound-read-entered'))})
await run('expired-after-start',async({host,control})=>{await new Promise(resolve=>setTimeout(resolve,Math.max(1,control.deadline-Date.now()+5)));const e=await refusal(()=>host.readPreReady('owned-run',control));assert.equal(e.message,'LOGINOM_PRE_READY_READ_EXPIRED');assert(!row.messages.some(m=>m.fixture==='bound-read-entered'))},'expired-after-start')
for(const field of ['signal','deadline'])await run('replaced-original-control-'+field,async({host,control})=>{if(field==='signal')control.signal=new AbortController().signal;else control.deadline++;const e=await refusal(()=>host.readPreReady('owned-run',control));assert.equal(e.message,'LOGINOM_HANDSHAKE_INVALID');assert(!row.messages.some(m=>m.fixture==='bound-read-entered'))})
await run('replaced-original-input',async({host,input,control})=>{input.packagePath='/worker/replaced.lgp';const e=await refusal(()=>host.readPreReady('owned-run',control));assert.equal(e.message,'LOGINOM_HANDSHAKE_INVALID');assert(!row.messages.some(m=>m.fixture==='bound-read-entered'))})
await run('preabort-before-read',async({host,controller,control})=>{controller.abort(false);assert.equal(await refusal(()=>host.readPreReady('owned-run',control)),false);assert(!row.messages.some(m=>m.fixture==='bound-read-entered'))})
for(const key of ['owner','page','context','account','generation','chat','metadata','session','document','workflow','storage','ready'])await run('foreign-original-'+key,async({host,control})=>{
 // Instantiate the actual chat using the ordinary read-only listing route.
 await host.request('call',{run:'owned-run',name:'dock_diagnostics',args:{},userMessage:'Bounded read-only diagnostic'})
 row.child.send({fixture:'bound-drift',key});await wait(m=>m.fixture==='bound-drifted'&&m.key===key)
 await refusal(()=>host.readPreReady('owned-run',control));assert(!row.messages.some(m=>m.fixture==='bound-read-entered'));await deniedAfterRead(host)
})
for(const mode of ['closed-page','multiple-pages'])await run(mode,async({host,control})=>{await refusal(()=>host.readPreReady('owned-run',control));assert(!row.messages.some(m=>m.fixture==='bound-read-entered'));await deniedAfterRead(host)},mode)
for(const mode of ['abort','late-page','late-metadata','late-deadline','lost','late-false','late-zero','late-undefined','late-error'])await run(mode,async({host,control,controller})=>{
 const attempt=refusal(()=>host.readPreReady('owned-run',control));await wait(m=>m.fixture==='bound-read-entered')
 if(mode==='abort')controller.abort(0)
 row.child.send({fixture:'bound-resolve'});const error=await attempt
 if(mode==='abort'||mode==='late-zero')assert.equal(error,0)
 if(mode==='late-false')assert.equal(error,false)
 if(mode==='late-undefined')assert.equal(error,undefined)
 if(mode==='late-error'){assert.equal(error.message,'labelled read');assert.equal(error.cause,0)}
 if(mode==='lost'){assert.equal(error.message,'labelled transport lost');assert.equal(error.cause,false)}
 if(mode==='late-deadline')assert.equal(error.message,'LOGINOM_PRE_READY_READ_EXPIRED')
 const original=row.messages.find(m=>m.fixture==='bound-managed-request'&&m.operation==='readonly.preReady');assert(original);await wait(m=>m.fixture==='bound-managed-reply'&&m.packet.id===original.requestId)
 await deniedAfterRead(host)
},mode)
cp.fork=originalFork;syncBuiltinESMExports()
await writeFile(join(out,'results.json'),JSON.stringify({phase,cases:results.length,results,native_verified:false},null,2));console.log(phase,results.length,'actual retained qualification/admission controls PASS')
