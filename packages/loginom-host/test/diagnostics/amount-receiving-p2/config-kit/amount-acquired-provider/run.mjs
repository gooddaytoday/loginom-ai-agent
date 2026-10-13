import assert from 'node:assert/strict'
import cp from 'node:child_process'
import {syncBuiltinESMExports} from 'node:module'
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const [rawProduct,factory,rawOut,phase]=process.argv.slice(2),product=resolve(rawProduct),out=resolve(rawOut),kit=import.meta.dirname,resources=join(product,'resources/loginom')
await mkdir(out,{recursive:true})
const originalFork=cp.fork;let current
cp.fork=(entry,args,options)=>{
 assert.equal(entry,join(resources,'host/node-host.mjs'))
 const child=originalFork(entry,args,{...options,execArgv:[...options.execArgv,'--import',pathToFileURL(join(kit,'../fp-retained-admission/host-preload.mjs')).href],env:{...options.env,FP_BOUND_RUNTIME:join(resources,'runtime'),FP_BOUND_NATIVE:pathToFileURL(join(kit,'native.mjs')).href,FP_BOUND_CASE:current.mode},stdio:['ignore','ignore','inherit','ipc']})
 current.child=child;current.exit=new Promise(r=>child.once('exit',(code,signal)=>r({code,signal})))
 child.on('message',m=>current.events.push(m));return child
}
syncBuiltinESMExports()
const {launchAmountDiagnostic:launch}=await import(pathToFileURL(factory)),rows=[]
async function wait(test){for(let i=0;i<2000;i++){const m=current.events.find(test);if(m)return m;if(current.child?.exitCode!==null&&current.child)throw Error('fixture child exited');await new Promise(r=>setTimeout(r,5))}throw Error('fixture receipt missing')}
for(const mode of ['owned-config-error','owned-config-late-false','owned-config-late-undefined']){
 current={mode,events:[]};const root=await mkdtemp(join(out,mode+'-')),controller=new AbortController(),control={signal:controller.signal,deadline:Date.now()+60000,operation:'config-op-'+root.split('/').at(-1),request:'config-req-'+root.split('/').at(-1)}
 const input={node:join(resources,'bin/node'),entry:join(resources,'host/node-host.mjs'),root,resources,headless:true,packagePath:'/worker/amount.lgp'}
 await mkdir(join(root,'connection'),{mode:0o700})
 await writeFile(join(root,'connection/connection.json'),JSON.stringify({generation:1,revision:1,url:'https://labelled.invalid/app/',username:'worker',secrets:{format:'loginom-cli-secrets-v1',protection:'plaintext',payload:JSON.stringify({apiKey:'labelled',password:'labelled'})}}),{mode:0o600})
 try{
  const host=await launch(input,control);let settled=false
  const acquisition=host.acquire('original-run','original-session').then(value=>{settled=true;return{value}},error=>{settled=true;return{error,rejected:true}})
  await wait(m=>m.fixture==='owned-config-pending');assert.equal(settled,false);assert.equal(launch.retained(input,control).pending,true)
  if(mode.includes('late-')){
   controller.abort(false)
   await wait(m=>m.fixture==='bound-managed-reply'&&m.packet?.result?.accepted===true)
   assert.equal(settled,false);assert.equal(launch.retained(input,control).pending,true)
  }
  current.child.send({fixture:'owned-config-reject'})
  const result=await acquisition,retained=launch.retained(input,control)
  assert.equal(result.rejected,true);assert.equal(retained.pending,false)
  const packets=current.events.filter(m=>m.fixture==='bound-managed-reply'&&'rejection' in (m.packet??{})).map(m=>m.packet)
  const checks=[]
  if(mode==='owned-config-error'){
   checks.push(['first Error/cause0 survives',result.error?.message==='labelled owned browser config'&&result.error?.cause===0])
   checks.push(['owned read attributed as await',packets[0]?.rejectionOrigin==='await'])
  }else{
   checks.push(['original false remains primary',result.error===false&&retained.primaryFailurePresent&&retained.primaryFailure===false])
   checks.push(['genuine owned late rejection has presence',retained.secondaryFailurePresent===true])
   checks.push(['genuine late value preserved',retained.secondaryFailure===(mode.endsWith('false')?false:undefined)])
   checks.push(['raw producer carries secondary',packets[0]&&'secondaryRejection' in packets[0]])
  }
  assert.equal(current.events.filter(m=>m.fixture==='bound-read-entered').length,0)
  assert.equal(retained.evidenceSettled,false);assert.equal(retained.cleanupSettled,false);assert.equal(retained.acknowledged,false)
  rows.push({mode,pass:checks.every(x=>x[1]),checks,actual:{primaryFailurePresent:retained.primaryFailurePresent,primaryValue:result.error instanceof Error?{message:result.error.message,cause:result.error.cause}:result.error,secondaryFailurePresent:retained.secondaryFailurePresent,secondaryIsUndefined:retained.secondaryFailure===undefined,producerPackets:packets},native:false})
 }finally{
  if(current.child?.connected)current.child.send({fixture:'bound-finish'})
  if(current.exit)assert.deepEqual(await current.exit,{code:0,signal:null})
  await writeFile(join(out,mode+'-chronology.json'),JSON.stringify(current.events,null,2))
 }
}
cp.fork=originalFork;syncBuiltinESMExports()
await writeFile(join(out,'results.json'),JSON.stringify({phase,rows,pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,scope:'real exact factory/host/service/lease/managed/FS/IPC; only browserConfig owned read rejection and native/Page/SDK fixtures are doubles; no native authority'},null,2))
console.log(phase,rows.filter(x=>x.pass).length,'PASS',rows.filter(x=>!x.pass).length,'FAIL')
process.exitCode=rows.every(x=>x.pass)?0:1
