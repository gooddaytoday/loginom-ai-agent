import assert from 'node:assert/strict'
import cp from 'node:child_process'
import fs from 'node:fs'
import {syncBuiltinESMExports} from 'node:module'
import {createHash} from 'node:crypto'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const [product,clientModule,rawOut,phase]=process.argv.slice(2),out=resolve(rawOut)
const read=fs.promises.readFile,fork=cp.fork
await fs.promises.mkdir(out,{recursive:true})
const node=join(product,'resources/loginom/bin/node'),entry=join(product,'resources/loginom/host/node-host.mjs'),resources=join(product,'resources/loginom')
const source=await read(entry,'utf8');assert.equal(source.split('createLoginomHost(options).then').length,2)
const receiver=join(out,'receiver-with-labelled-host.mjs')
await fs.promises.writeFile(receiver,`import{fixtureCreateHost}from${JSON.stringify(pathToFileURL(join(import.meta.dirname,'fixture-host.mjs')).href)};\n`+source.replace('createLoginomHost(options).then','fixtureCreateHost(options).then'))
let current
fs.promises.readFile=async(...args)=>{const result=await read(...args);if(current && String(args[0])===join(resources,'resource-manifest.json') && !current.inventoryHook){current.inventoryHook=true;await current.hook?.()}return result}
cp.fork=(selected,args,opts)=>{
 assert.equal(selected,entry);current.forks++
 const row=current,child=fork(receiver,args,opts);row.child=child;row.messages=[];row.sent=[]
 const send=child.send.bind(child);child.send=(m,...rest)=>{row.sent.push(JSON.parse(JSON.stringify(m)));return send(m,...rest)}
 child.on('message',m=>row.messages.push(m));row.exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));return child
}
syncBuiltinESMExports()
const {launchFieldParametersDiagnostic:launch}=await import(pathToFileURL(clientModule))
const rows=[]
async function waitFor(row,p){for(let i=0;i<500;i++){const m=row.messages.find(p);if(m)return m;await new Promise(resolve=>setTimeout(resolve,5))}throw Error(row.name+' fixture response missing')}
async function scenario(name,configure,afterDispatch,expect){
 const row=current={name,forks:0,messages:[],sent:[]},controller=new AbortController()
 const input={node,entry,resources,root:join(out,name),headless:true,packagePath:'/worker/fp.lgp'},control={signal:controller.signal,deadline:Date.now()+10000}
 configure?.({row,input,control,controller})
 let value,error,accepted=false
 const attempt=launch(input,control).then(x=>{value=x;accepted=true},x=>{error=x})
 try{
  if(afterDispatch){await waitFor(row,m=>m.fixture==='host-entered');await afterDispatch({row,input,control,controller});row.child.send({method:'fixture.resolve'})}
  await attempt
  assert.equal(accepted,expect.accepted)
  if('error' in expect)assert.deepEqual(error,expect.error)
  if(expect.forks!==undefined)assert.equal(row.forks,expect.forks)
  if(row.child){
   const original=row.sent.find(m=>m.method==='start');assert.equal(original.deadline,control.deadline)
   if(accepted){assert.equal(typeof value.capture,'function');assert.equal(launch.retained(input).port,value.port);assert.equal(original.input.acceptanceCapture.harness,'field-parameters-preservation-v1')}
   else {assert.equal(launch.retained(input).port.postMessage instanceof Function,true);assert.equal(launch.retained({...input}),undefined)}
   const cancellation=row.sent.find(m=>m.method==='readonly.preReady.cancel')
   if(expect.cancel){assert.equal(cancellation.input.requestId,original.id);assert.equal(cancellation.input.authorization,original.input.acceptanceCapture.authorization);assert.equal(cancellation.input.deadline,original.deadline);assert.deepEqual(cancellation.input.rejection,{kind:'value',is_undefined:false,value:0})}
   row.child.send({method:'fixture.finish'});assert.deepEqual(await row.exit,{code:0,signal:null})
  }
  rows.push({name,accepted,forks:row.forks,error:error instanceof Error?{message:error.message}:error,owned_exit:row.child?await row.exit:null,start:row.sent?.filter(m=>m.method==='start').map(m=>({id:m.id,deadline:m.deadline,root:m.input.root,grant_bytes:m.input.acceptanceCapture.authorization.length,grant_sha256:createHash('sha256').update(m.input.acceptanceCapture.authorization).digest('hex')})),cancel:row.sent?.filter(m=>m.method==='readonly.preReady.cancel').map(m=>({id:m.id,requestId:m.input.requestId,phase:m.input.phase,deadline:m.input.deadline,rejection:m.input.rejection})),messages:row.messages})
 }finally{if(row.child?.exitCode===null){if(row.child.connected)row.child.send({method:'fixture.finish'});await row.exit}}
}
await scenario('preabort-false',({controller})=>controller.abort(false),null,{accepted:false,error:false,forks:0})
await scenario('expired-before-inventory',({control})=>control.deadline=Date.now()-1,null,{accepted:false,forks:0})
await scenario('root-drift-inventory',({row,input})=>row.hook=()=>{input.root+='-foreign'},null,{accepted:false,forks:0})
await scenario('control-drift-inventory',({row,control})=>row.hook=()=>{control.signal=new AbortController().signal},null,{accepted:false,forks:0})
await scenario('abort-false-inventory',({row,controller})=>row.hook=()=>controller.abort(false),null,{accepted:false,error:false,forks:0})
await scenario('fixed-factory-canonical',null,()=>{},{accepted:true,forks:1})
await scenario('abort-zero-after-dispatch',null,async({row,controller})=>{controller.abort(0);await waitFor(row,m=>m.result?.accepted===true&&m.result.pending===true);assert(!row.messages.some(m=>m.id===row.sent.find(x=>x.method==='start').id));},{accepted:false,error:0,forks:1,cancel:true})
await scenario('root-drift-after-dispatch',null,({input})=>{input.root+='-foreign'},{accepted:false,forks:1})
await scenario('expiry-inventory',({row,control})=>{control.deadline=Date.now()+1500;row.hook=async()=>{await new Promise(resolve=>setTimeout(resolve,Math.max(0,control.deadline-Date.now())+25))}},null,{accepted:false,forks:0})
await scenario('submitted-capability',({input})=>input.acceptanceCapture={authorization:'submitted'},null,{accepted:false,forks:0})
cp.fork=fork;fs.promises.readFile=read;syncBuiltinESMExports()
await fs.promises.writeFile(join(out,'results.json'),JSON.stringify({phase,cases:rows.length,rows,node_host_sha256:createHash('sha256').update(source).digest('hex'),client_sha256:createHash('sha256').update(await read(clientModule)).digest('hex'),native_verified:false,host_forwarding_verified:false,labels:'actual factory/transport/receiver; single host dependency target substitution; real child IPC/FS; host/native/qualification not verified'},null,2))
console.log(phase,rows.length,'caller snapshot/start cases PASS')
