import assert from 'node:assert/strict'
import {fork} from 'node:child_process'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const [node,bundle,rawOut,phase]=process.argv.slice(2)
const out=resolve(rawOut)
await mkdir(out,{recursive:true})
const bytes=await readFile(bundle,'utf8')
const call=/createLoginomHost\(options\)\.then/g
assert.equal([...bytes.matchAll(call)].length,1)
const module=join(out,'receiver-with-labelled-host.mjs')
await writeFile(module,`import{fixtureCreateHost}from${JSON.stringify(pathToFileURL(resolve(import.meta.dirname,'fixture-host.mjs')).href)};\n`+bytes.replace(call,'fixtureCreateHost(options).then'))
const rows=[]
const auth='a'.repeat(64)
const encoded=value=>({kind:'value',is_undefined:value===undefined,value:value===undefined?null:value})
async function scenario(name,action){
 const raw=join(out,name+'.json'),child=fork(module,[],{execPath:node,execArgv:[],stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,FP_EARLY_RAW:raw}})
 const received=[],waiters=[];let stderr=''
 child.stderr.on('data',x=>{stderr+=x})
 child.on('message',m=>{received.push(m);for(const w of [...waiters])if(w.match(m)){waiters.splice(waiters.indexOf(w),1);w.resolve(m)}})
 const exit=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})))
 const wait=match=>{const found=received.find(match);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(name+' fixture wait expired '+JSON.stringify(received))),5000);waiters.push({match,resolve:m=>{clearTimeout(timer);resolve(m)}})})}
 const reply=id=>wait(m=>m.id===id)
 const send=m=>child.send(m)
 const deadline=Date.now()+(name==='expiry-during-start'?1500:10000)
 const start=(overrides={})=>send({id:'original-start',method:'start',deadline,input:{protocol:1,root:out,resources:out,headless:true,acceptanceCapture:{authorization:auth,packagePath:'/worker/fp.lgp',harness:'field-parameters-preservation-v1'},...overrides}})
 const cancel=(overrides={})=>send({id:'cancel',method:'readonly.preReady.cancel',input:{phase:'startup',harness:'field-parameters-preservation-v1',requestId:'original-start',authorization:auth,deadline,rejection:encoded(false),...overrides}})
 try{await action({start,cancel,send,wait,reply,deadline,received});send({id:'owned-fixture-finish',method:'fixture.finish',input:{}});await reply('owned-fixture-finish');assert.deepEqual(await exit,{code:0,signal:null});rows.push({name,received,raw:JSON.parse(await readFile(raw,'utf8')),exit:await exit,stderr})}
 finally{if(child.exitCode===null){if(child.connected)send({id:'finalize-fixture',method:'fixture.finish',input:{}});await exit}}
}
await scenario('canonical-before-acquire',async({start,send,wait,reply})=>{start();await wait(m=>m.fixture==='host-entered');send({method:'fixture.resolve',input:{}});await wait(m=>m.fixture==='settled-entered');send({method:'fixture.settle'});assert.equal((await reply('original-start')).result.ready,true)})
for(const [name,overrides]of [['foreign-ID',{requestId:'foreign'}],['wrong-authorization',{authorization:'b'.repeat(64)}],['wrong-kind',{harness:'amount-import-type-v1'}],['changed-deadline',{deadline:0}]])await scenario(name,async({start,cancel,send,wait,reply})=>{start();await wait(m=>m.fixture==='host-entered');cancel(overrides);assert((await reply('cancel')).error);send({method:'fixture.resolve',input:{}});await wait(m=>m.fixture==='settled-entered');send({method:'fixture.settle'});assert.equal((await reply('original-start')).result.ready,true)})
for(const value of [undefined,null,false,0,''])await scenario('original-'+String(value),async({start,cancel,send,wait,reply,received})=>{start();await wait(m=>m.fixture==='host-entered');cancel({rejection:encoded(value)});assert.deepEqual((await reply('cancel')).result,{accepted:true,pending:true,nativeCancellationConfirmed:false});assert(!received.some(m=>m.id==='original-start'));send({method:'fixture.resolve',input:{drift:'kind'}});const result=await reply('original-start');assert.deepEqual(result.rejection,encoded(value));assert(!result.result)})
for(const drift of ['kind','root','ref'])await scenario('late-'+drift,async({start,send,wait,reply})=>{start();await wait(m=>m.fixture==='host-entered');send({method:'fixture.resolve',input:{drift}});assert.equal((await reply('original-start')).rejection.message,'LOGINOM_HANDSHAKE_INVALID')})
await scenario('late-cancel-no-other-owner',async({start,cancel,send,wait,reply})=>{start();await wait(m=>m.fixture==='host-entered');send({method:'fixture.resolve',input:{}});await wait(m=>m.fixture==='settled-entered');send({method:'fixture.settle'});assert((await reply('original-start')).result.ready);cancel();assert((await reply('cancel')).error)})
await scenario('expiry-before-effect',async({send,reply,received})=>{send({id:'expired',method:'start',deadline:Date.now()-1,input:{protocol:1,root:out,resources:out,headless:true,acceptanceCapture:{authorization:auth,packagePath:'/worker/fp.lgp',harness:'field-parameters-preservation-v1'}}});assert((await reply('expired')).error);assert(!received.some(m=>m.fixture))})
await scenario('expiry-during-start',async({start,send,wait,reply,deadline})=>{start();await wait(m=>m.fixture==='host-entered');await new Promise(resolve=>setTimeout(resolve,Math.max(0,deadline-Date.now())+25));send({method:'fixture.resolve',input:{}});assert.equal((await reply('original-start')).rejection.message,'LOGINOM_PRE_READY_READ_EXPIRED')})
await scenario('original-Error-cause',async({start,cancel,send,wait,reply})=>{const rejection={kind:'Error',name:'Error',message:'original',cause:encoded(false)};start();await wait(m=>m.fixture==='host-entered');cancel({rejection});assert.equal((await reply('cancel')).result.nativeCancellationConfirmed,false);send({method:'fixture.resolve',input:{drift:'root'}});assert.deepEqual((await reply('original-start')).rejection,rejection)})
await scenario('after-settled-await-drift',async({start,send,wait,reply})=>{start();await wait(m=>m.fixture==='host-entered');send({method:'fixture.resolve',input:{}});await wait(m=>m.fixture==='settled-entered');send({method:'fixture.resolve',input:{drift:'kind'}});send({method:'fixture.settle'});assert.equal((await reply('original-start')).rejection.message,'LOGINOM_HANDSHAKE_INVALID')})
await scenario('ordinary-compatibility',async({start,send,wait,reply})=>{start({acceptanceCapture:undefined});await wait(m=>m.fixture==='host-entered');send({method:'fixture.resolve',input:{}});await wait(m=>m.fixture==='settled-entered');send({method:'fixture.settle'});assert.equal((await reply('original-start')).result.ready,true)})
await writeFile(join(out,'results.json'),JSON.stringify({phase,cases:rows.length,rows,installed_input_sha256:createHash('sha256').update(bytes).digest('hex'),adaptation:'single host factory call target substituted; all receiver/start/cancel/guard defining bytes retained; real Node child IPC/FS',nativeCancellationConfirmed:false,host_forwarding_verified:false},null,2))
console.log(phase,rows.length,'early receiver cases PASS; host forwarding NOT_VERIFIED')
