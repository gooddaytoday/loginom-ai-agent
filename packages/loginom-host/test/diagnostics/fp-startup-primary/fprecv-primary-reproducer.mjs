import assert from 'node:assert/strict'
import {fork} from 'node:child_process'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const [node,bundle,output,phase]=process.argv.slice(2)
await mkdir(output,{recursive:true})
const source=await readFile(bundle,'utf8')
assert.equal(source.split('createLoginomHost(options).then').length,2)
const adapted=join(output,'receiver-labelled-host.mjs')
await writeFile(adapted,`import {fixtureCreateHost} from ${JSON.stringify(pathToFileURL(resolve(import.meta.dirname,'fprecv-primary-fixture.mjs')).href)};\n`+source.replace('createLoginomHost(options).then','fixtureCreateHost(options).then'))
const boxed=x=>({kind:'value',is_undefined:x===undefined,value:x===undefined?null:x})
const firstError={kind:'Error',name:'Error',message:'first accepted cancellation',cause:boxed(false)}
const laterError={kind:'Error',name:'Error',message:'later factory refusal',cause:boxed(0)}
const cases=[
 {name:'canonical-factory-false',cancel:null,settled:false,later:boxed(false),expected:boxed(false)},
 {name:'cancel-false-then-factory-error',cancel:boxed(false),settled:false,later:laterError,expected:boxed(false)},
 {name:'cancel-error-then-settled-undefined',cancel:firstError,settled:true,later:boxed(undefined),expected:firstError},
]
const rows=[]
for(const c of cases){
 const child=fork(adapted,[],{execPath:node,execArgv:[],stdio:['ignore','ignore','pipe','ipc']})
 const received=[],waiters=[];let stderr=''
 child.stderr.on('data',x=>stderr+=x)
 child.on('message',m=>{received.push(m);for(const w of [...waiters])if(w.p(m)){waiters.splice(waiters.indexOf(w),1);w.resolve(m)}})
 const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})))
 const wait=p=>{const old=received.find(p);if(old)return Promise.resolve(old);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture deadline')),5000);waiters.push({p,resolve:x=>{clearTimeout(timer);resolve(x)}})})}
 const reply=id=>wait(m=>m.id===id)
 const send=m=>child.send(m)
 try{
  const deadline=Date.now()+10000,auth='a'.repeat(64)
  send({id:'original',method:'start',deadline,input:{protocol:1,root:output,resources:output,headless:true,acceptanceCapture:{authorization:auth,packagePath:'/worker/fp.lgp',harness:'field-parameters-preservation-v1'}}})
  await wait(m=>m.fixture==='factory-entered')
  if(c.settled){send({method:'fixture.factory.resolve'});await wait(m=>m.fixture==='settled-entered')}
  if(c.cancel){send({id:'cancel',method:'readonly.preReady.cancel',input:{phase:'startup',requestId:'original',authorization:auth,harness:'field-parameters-preservation-v1',deadline,rejection:c.cancel}});assert.deepEqual((await reply('cancel')).result,{accepted:true,pending:true,nativeCancellationConfirmed:false});assert(!received.some(m=>m.id==='original'))}
  send({method:c.settled?'fixture.settled.reject':'fixture.factory.reject',input:c.later})
  const actual=await reply('original')
  send({id:'admission',method:'acquire',input:{run:'foreign',session:'new'}})
  assert((await reply('admission')).error)
  send({id:'finish',method:'fixture.finish'})
  const finish=await reply('finish'),exit=await exited
  assert.deepEqual(exit,{code:0,signal:null})
  assert.deepEqual(finish.result.counters,{factory:1,acquire:0,close:0,release:0})
  let pass=true;try{assert.deepEqual(actual.rejection,c.expected)}catch{pass=false}
  rows.push({case:c.name,pass,expected:c.expected,actual,received,counters:finish.result.counters,exit,stderr})
 }finally{
  if(child.exitCode===null){if(child.connected)send({id:'finalize',method:'fixture.finish'});await exited}
 }
}
await writeFile(join(output,'results.json'),JSON.stringify({phase,input_sha256:createHash('sha256').update(source).digest('hex'),adaptation:'one host-factory call target; original receiver/controller unchanged',native_verified:false,pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length,rows},null,2)+'\n')
console.log(phase,rows.filter(x=>x.pass).length,'PASS',rows.filter(x=>!x.pass).length,'FAIL; first accepted cancellation must survive later awaited refusal')
process.exitCode=rows.every(x=>x.pass)?0:1
