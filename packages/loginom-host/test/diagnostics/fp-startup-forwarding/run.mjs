import assert from 'node:assert/strict'
import fs from 'node:fs'
import cp from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const [product,hostFile,runtimeDir,clientFile,rawOut,phase]=process.argv.slice(2),out=resolve(rawOut)
await fs.promises.mkdir(out,{recursive:true})
const kit=import.meta.dirname,resources=join(product,'resources/loginom'),selected=join(resources,'host/node-host.mjs')
const native=pathToFileURL(join(kit,'fixture-native.mjs')).href
const managed=join(runtimeDir,'managed-entry.mjs'),raw=await fs.promises.readFile(managed,'utf8')
let derived=raw.replace(/from "\.\/resources.mjs"/,`from ${JSON.stringify(native)}`).replace(/from "\.\/connection-check.mjs"/,`from ${JSON.stringify(native)}`).replace(/from "\.\.\/client\/lib\/session.mjs"/,`from ${JSON.stringify(native)}`).replace(/from "\.\.\/client\/lib\/bridge.mjs"/,`from ${JSON.stringify(native)}`)
derived=derived.replace('const require = createRequire(new URL("../client/package.json", import.meta.url))',`import {fixtureRequire} from ${JSON.stringify(native)}; const require=fixtureRequire`)
derived=derived.replace(/from "(\.\.?\/[^\"]+)"/g,(_,p)=>`from ${JSON.stringify(pathToFileURL(resolve(runtimeDir,p)).href)}`)
const managedDerived=join(out,'managed-with-labelled-native.mjs');await fs.promises.writeFile(managedDerived,derived)
const hostRaw=await fs.promises.readFile(hostFile,'utf8'),hostDerived=join(out,'host-with-managed-preload.mjs')
await fs.promises.writeFile(hostDerived,`import ${JSON.stringify(pathToFileURL(join(kit,'preload.mjs')).href)};\n`+hostRaw)
const map=join(out,'private-fixture-map.json');await fs.promises.writeFile(map,JSON.stringify({managed:join(resources,'runtime/src/managed-entry.mjs'),derived:managedDerived}))
const originalFork=cp.fork
let row
cp.fork=(entry,args,options)=>{assert.equal(entry,selected);row.forks++;const stderr=fs.openSync(join(out,'host-stderr.log'),'a');const child=originalFork(hostDerived,args,{...options,stdio:['ignore','ignore',stderr,'ipc'],env:{...options.env,FP_FIXTURE_MAP:map}});fs.closeSync(stderr);row.child=child;row.messages=[];const send=child.send.bind(child);child.send=(m,...args)=>{if(m.method==='start')row.startId=m.id;return send(m,...args)};row.exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));child.on('message',m=>row.messages.push(m));return child}
syncBuiltinESMExports()
const {launchFieldParametersDiagnostic:launch}=await import(pathToFileURL(clientFile))
async function wait(predicate){for(let i=0;i<1000;i++){const m=row.messages.find(predicate);if(m)return m;await new Promise(resolve=>setTimeout(resolve,5))}throw Error(row.name+' missing fixture response')}
const results=[]
async function run(name,action,expected,budget=10000,mode){
 await fs.promises.writeFile(map,JSON.stringify({managed:join(resources,'runtime/src/managed-entry.mjs'),derived:managedDerived,mode}));
 row={name,forks:0,messages:[]};const root=join(out,name);await fs.promises.mkdir(join(root,'connection'),{recursive:true,mode:0o700});await fs.promises.writeFile(join(root,'connection','connection.json'),JSON.stringify({generation:1,revision:1,url:'https://labelled.invalid/',username:'worker',secrets:{format:'loginom-cli-secrets-v1',protection:'plaintext',payload:JSON.stringify({apiKey:'labelled',password:'labelled'})}}),{mode:0o600})
 const controller=new AbortController(),deadline=Date.now()+budget,input={node:join(resources,'bin/node'),entry:selected,root,resources,headless:true,packagePath:'/worker/fp.lgp'}
 let accepted=false,error;const attempt=launch(input,{signal:controller.signal,deadline}).then(()=>accepted=true,e=>error=e)
 try{
  if(mode==='hold-resources'){await wait(m=>m.fixture==='resource-entered')}else{const entered=await wait(m=>m.fixture==='native-entered');assert.equal(entered.deadline,deadline);assert.equal(entered.chat,'readiness');assert.equal(entered.generation,1)}
  await action({controller,attempt})
  await attempt
  if(mode==='hold-resources'){await wait(m=>m.fixture==='resource-settled');assert(!row.messages.some(m=>m.fixture==='native-entered'))}else await wait(m=>m.fixture==='native-settled')
  if(mode==='drop-start-reply'){await wait(m=>m.fixture==='dropped-start-reply');row.child.send({fixture:'deliver-late'})}
  const originalReply=await wait(m=>m.id===row.startId)
  if(name==='abort-false-original-pending'){assert.equal(originalReply.rejection.value,false);assert.equal(originalReply.secondaryRejection.kind,"Error");assert.deepEqual(originalReply.secondaryRejection.cause,{kind:"value",value:0,is_undefined:false})}
  assert.equal(accepted,expected.accepted)
  if('reason' in expected)assert.deepEqual(error,expected.reason)
  if(expected.cause!==undefined){assert(error instanceof Error);assert.equal(error.cause,expected.cause)}
  if(!accepted){assert(launch.retained(input).alive);await assert.rejects(launch(input,{signal:controller.signal,deadline}),/RECOVERY_REQUIRED/);assert.equal(row.forks,1)}
  assert(!row.messages.some(m=>m.fixture==='native-close-called'))
  const files=await fs.promises.readdir(root,{recursive:true});assert(!files.some(x=>x.endsWith('managed-shutdown.json')))
  row.child.send({fixture:'finish'});await wait(m=>m.fixture==='managed-exit');assert.deepEqual(await row.exit,{code:0,signal:null})
  results.push({name,accepted,error:error instanceof Error?{message:error.message,cause:error.cause}:error,forks:row.forks,messages:row.messages,own_exit:await row.exit})
 }finally{await fs.promises.writeFile(join(root,'diagnostic-final.json'),JSON.stringify({messages:row.messages,accepted,error:error instanceof Error?{message:error.message,cause:error.cause}:error},null,2));if(row.child?.exitCode===null){if(row.child.connected)row.child.send({fixture:'finish'});await row.exit}}
}
await run('canonical-ready',async()=>row.child.send({fixture:'resolve'}),{accepted:true})
await run('abort-false-original-pending',async({controller,attempt})=>{controller.abort(false);await wait(m=>m.fixture==='native-aborted');assert.equal(row.messages.filter(m=>m.fixture==='native-aborted').length,1);row.child.send({fixture:'resolve',rejection:{kind:'Error',message:'late native',cause:0}})},{accepted:false,reason:false})
await run('native-zero-first',async()=>row.child.send({fixture:'resolve',rejection:{kind:'value',value:0}}),{accepted:false,reason:0})
await run('late-owner-chat',async()=>{row.child.send({fixture:'drift-owner'});row.child.send({fixture:'resolve'})},{accepted:false})
await run('late-session-identity',async()=>{row.child.send({fixture:'resolve'});await wait(m=>m.fixture==='managed-late-await');row.child.send({fixture:'drift-session'})},{accepted:false})
await run('wrong-native-cancel-tuple',async()=>{row.child.send({fixture:'wrong-cancel'});const refusal=await wait(m=>m.fixture==='wrong-cancel-result');assert.equal(refusal.error,'LOGINOM_HANDSHAKE_INVALID');assert(!row.messages.some(m=>m.fixture==='native-aborted'));row.child.send({fixture:'resolve'})},{accepted:true})
for(const value of [undefined,null,false,''])await run('native-'+(value===undefined?'undefined':value===null?'null':value===false?'false':'empty'),async()=>row.child.send({fixture:'resolve',rejection:{kind:'value',value}}),{accepted:false,reason:value})
await run('native-error-cause-false',async()=>row.child.send({fixture:'resolve',rejection:{kind:'Error',message:'native primary',cause:false}}),{accepted:false,cause:false})
await run('original-deadline-during-native-await',async()=>{await wait(m=>m.fixture==='native-aborted');row.child.send({fixture:'resolve'})},{accepted:false},1200)
await run('abort-false-first-resource-await',async({controller})=>{controller.abort(false);await new Promise(resolve=>setTimeout(resolve,50));assert(!row.messages.some(m=>m.id===row.startId));row.child.send({fixture:'resolve-resources'})},{accepted:false,reason:false},10000,'hold-resources')
await run('lost-startup-reply-late-delivery',async()=>row.child.send({fixture:'resolve'}),{accepted:false},1200,'drop-start-reply')
await run('foreign-authenticated-context',async()=>row.child.send({fixture:'resolve',foreignContext:true}),{accepted:false})
cp.fork=originalFork;syncBuiltinESMExports()
await fs.promises.writeFile(join(out,'results.json'),JSON.stringify({phase,cases:results.length,results,host_sha256:createHash('sha256').update(hostRaw).digest('hex'),managed_sha256:createHash('sha256').update(raw).digest('hex'),labels:'actual factory/receiver/host/store/connection/supervisor/managed startup; Page/native/session/bridge/MCP and resource verifier dependencies labelled; real FS/Node/child IPC; no native/qualification/admission authority'},null,2))
console.log(phase,results.length,'actual startup forwarding controls PASS')
