// Explicit host/native dependency double. Receiver/controller bytes remain literal.
let factory, settled
const counters={factory:0,acquire:0,close:0,release:0}
const decode=x=>x.kind==='Error'?new Error(x.message,{cause:decode(x.cause)}):x.is_undefined?undefined:x.value
process.on('message',m=>{
  if(m.method==='fixture.factory.reject')factory.reject(decode(m.input))
  if(m.method==='fixture.factory.resolve')factory.resolve()
  if(m.method==='fixture.settled.reject')settled.reject(decode(m.input))
  if(m.method==='fixture.finish')process.send({id:m.id,result:{counters}},()=>process.exit(0))
})
export async function fixtureCreateHost(){
  counters.factory++
  process.send({fixture:'factory-entered'})
  await new Promise((resolve,reject)=>{factory={resolve,reject}})
  return {
    recoveries:new Map(),acquire:()=>{counters.acquire++;return null},
    settled:async()=>{process.send({fixture:'settled-entered'});await new Promise((resolve,reject)=>{settled={resolve,reject}})},
    close:async()=>{counters.close++},interruptAll:async()=>{},
  }
}
