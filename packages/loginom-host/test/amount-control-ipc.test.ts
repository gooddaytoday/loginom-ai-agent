import {test,expect} from 'bun:test'
import {fork} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {retainAmountCaller,runAmountCaller,settleAmountCaller} from '../src/amount-caller-control'
const node='/home/user/.cache/loginom-bootstrap/node/node-v24.19.0-linux-x64/bin/node'
const entry=fileURLToPath(new URL('../../loginom-runtime/test/fixtures/amount-control-ipc-child.mjs',import.meta.url))
for(const stage of ['success','preabort','read','record','foreign'])test('fixture-owned retained root -> real child IPC -> fixed Amount '+stage,async()=>{
 const c=new AbortController(),input={signal:c.signal,deadline:Date.now()+50000,operation:'op',request:'req-'+stage,owner:'own',run:'run',lease:'own:run',generation:1,chat:'chat',account:'test-2'}
 const grant=retainAmountCaller(input);let child:any,abort:()=>void=()=>{},tuple:any,result:any
 let exited!:Promise<any>
 const returned=await runAmountCaller(grant,input,async original=>{
  expect(original.signal).toBe(c.signal);expect(original.deadline).toBe(input.deadline)
  tuple=Object.fromEntries(['operation','request','owner','run','lease','generation','chat','account'].map(k=>[k,(original as any)[k]]))
  child=fork(entry,[],{execPath:node,execArgv:['--experimental-test-module-mocks'],env:process.env,stdio:['ignore','ignore','ignore','ipc']})
  exited=new Promise(resolve=>child.once('exit',(code:any,signal:any)=>resolve({code,signal})))
  abort=()=>child.send({kind:'cancel',tuple,reason:0});original.signal.addEventListener('abort',abort,{once:true})
  return await new Promise(resolve=>{
   child.on('message',(frame:any)=>{
    if(frame.kind==='paused'){
     if(stage==='foreign')child.send({kind:'cancel',tuple:{...tuple,request:'foreign'},reason:0})
     else c.abort(0)
     child.send({kind:'continue',tuple})
    }
    if(frame.kind==='result'){result=frame;resolve(frame)}
   })
   child.send({kind:'start',tuple,deadline:original.deadline,stage:stage==='foreign'?'read':stage,preabort:stage==='preabort'})
  })
 }).catch(error=>{expect(['read','record']).toContain(stage);expect(error).toBe(0);return result})
 const exit=await exited;input.signal.removeEventListener('abort',abort)
 expect(exit).toEqual({code:0,signal:null});expect(returned.deadline).toBe(input.deadline)
 if(['success','foreign'].includes(stage)){expect(returned.failed).toBe(false);expect(returned.cancel).toBe(true)}
 else {expect(returned.failed).toBe(true);expect(returned.presence).toBe(true);expect(returned.value).toBe(0);expect(returned.events.includes('cancel')).toBe(false)}
 settleAmountCaller(grant,true,true)
})
