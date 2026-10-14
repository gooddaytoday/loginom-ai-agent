import assert from 'node:assert/strict'
import cp from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'
import {readFile,writeFile,mkdir,mkdtemp,realpath} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const [product,modulePath,out,phase]=process.argv.slice(2)
assert(product && modulePath && out && phase)
await mkdir(out,{recursive:true})
const manifest=JSON.parse(await readFile(join(product,'cli-manifest.json'),'utf8'))
const bundle='resources/loginom/host/fp-private-launcher.mjs'
const metadata='resources/loginom/host/fp-launcher-build-inputs.json'
const pins={}
for(const path of [bundle,metadata]){
 const entries=manifest.files.filter(x=>x.path===path)
 assert.equal(entries.length,1)
 assert.equal(await realpath(join(product,path)),join(product,path))
 const bytes=await readFile(join(product,path))
 assert.equal(createHash('sha256').update(bytes).digest('hex'),entries[0].sha256)
 pins[path]={bytes:bytes.length,sha256:entries[0].sha256}
}
const meta=JSON.parse(await readFile(join(product,metadata),'utf8'))
assert(Object.keys(meta.inputs).some(x=>x.endsWith('/src/fp-private-launcher-entry.ts')||x==='src/fp-private-launcher-entry.ts'))
assert(Object.keys(meta.inputs).some(x=>x.endsWith('/src/node-client.ts')||x==='src/node-client.ts'))
const childPath=join(out,'labelled-native-boundary.mjs')
await writeFile(childPath,`import{writeFile}from'node:fs/promises';import{createHash}from'node:crypto';const rows=[];process.on('message',async m=>{const cap=m.input?.acceptanceCapture;rows.push({id:m.id,method:m.method,deadline:m.deadline??null,grant:cap?{harness:cap.harness,packagePath:cap.packagePath,length:cap.authorization.length,sha256:createHash('sha256').update(cap.authorization).digest('hex')}:null,authorization_match:!!cap||m.input?.authorization===rows[0]?.privateAuthorization});if(cap)rows[0].privateAuthorization=cap.authorization;await writeFile(process.env.FP_ENTRY_RECEIPT,JSON.stringify(rows.map(({privateAuthorization,...r})=>r),null,2));if(m.method==='start')process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}});if(m.method==='readonly.preReady')process.send({id:m.id,result:{phase:'PRE_READY_CLOSED_READ',ready:false,cleanupComplete:false,labels:'Page/native qualification double'}});if(m.method==='close')process.send({id:m.id,result:{closed:true}},()=>process.exit(0))});`)
const actualFork=cp.fork
let child,outcome,forks=0
cp.fork=(entry,args,options)=>{
 forks++
 assert.equal(entry,join(product,'resources/loginom/host/node-host.mjs'))
 child=actualFork(childPath,[],{...options,env:{...options.env,FP_ENTRY_RECEIPT:join(out,'raw-ipc.json')}})
 outcome=new Promise(res=>child.once('exit',(code,signal)=>res({code,signal})))
 return child
}
syncBuiltinESMExports()
const fixed=await import(pathToFileURL(modulePath))
assert.deepEqual(Object.keys(fixed),['launchFieldParametersDiagnostic'])
const original=new AbortController(),deadline=Date.now()+30000
const input={node:join(product,'resources/loginom/bin/node'),entry:join(product,'resources/loginom/host/node-host.mjs'),root:await mkdtemp(join(out,'owner-')),resources:join(product,'resources/loginom'),headless:true,packagePath:'/worker/fp.lgp'}
// This control is intentionally supplied as the proposed startup ABI. Current
// factory has no such ABI: do not claim that successful startup consumed it.
const host=await fixed.launchFieldParametersDiagnostic(input,{signal:original.signal,deadline})
try{
 assert.equal(forks,1)
 assert.equal(typeof host.readPreReady,'function')
 assert.equal(typeof host.capture,'function')
 const read=await host.readPreReady('fixed-entry-run',{signal:original.signal,deadline})
 assert.deepEqual([read.phase,read.ready,read.cleanupComplete],['PRE_READY_CLOSED_READ',false,false])
 await host.close()
 assert.deepEqual(await outcome,{code:0,signal:null})
 const raw=JSON.parse(await readFile(join(out,'raw-ipc.json'),'utf8'))
 assert.deepEqual(raw.map(x=>x.method),['start','readonly.preReady','close'])
 assert.equal(raw[0].grant.harness,'field-parameters-preservation-v1')
 assert.equal(raw[0].grant.length,64)
 assert.equal(raw[1].authorization_match,true)
 assert.equal(raw[1].deadline,deadline)
 // Explicit remaining ABI gap. This is a diagnostic assertion, not a passing
 // original-startup-control assertion: startup has no upstream deadline.
 assert.equal(raw[0].deadline,null)
 await writeFile(join(out,'results.json'),JSON.stringify({phase,checks:8,pins,exports:Object.keys(fixed),raw,exit:await outcome,defining_module:resolve(modulePath),startup_control_verified:false,startup_gap:'start envelope has no original absolute deadline; factory ignores startup control argument',native_verified:false,labels:'real installed bundle or explicit source compilation; builtin fork replaced with real child IPC/FS and labelled host/Page/native reply'},null,2))
 console.log(`${phase}: 8 boundary checks PASS; startup authority NOT_VERIFIED`)
}finally{cp.fork=actualFork;syncBuiltinESMExports();if(child && child.exitCode===null){if(child.connected)child.send({id:'owned-stop',method:'close',input:{}});await outcome}}
