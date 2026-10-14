// Explicit host/native/connection-startup double. Product receiver code is
// retained; this dependency deliberately does not establish native authority.
import {writeFile} from 'node:fs/promises'
let pending,settling,options
const rows=[]
async function save(){await writeFile(process.env.FP_EARLY_RAW,JSON.stringify(rows,null,2))}
process.on('message',async message=>{
 if(message.method==='fixture.resolve'){
  if(message.input?.drift==='kind')options.acceptanceCapture.harness='amount-import-type-v1'
  if(message.input?.drift==='root')options.root+='-foreign'
  if(message.input?.drift==='ref')options.acceptanceCapture={...options.acceptanceCapture}
  if(message.input?.failure){pending.reject(message.input.failure);return}
  pending.resolve();return
 }
 if(message.method==='fixture.settle'){settling?.();return}
 if(message.method==='fixture.finish'){
  await save();process.send({id:message.id,result:{fixture:true,nativeCalls:0}},()=>process.exit(0))
 }
})
export async function fixtureCreateHost(input){
 options=input
 rows.push({phase:'create-host',root:input.root,grant_kind:input.acceptanceCapture?.harness,forwarded_startup_control:!!input.fpStartupControl,nativeCalls:0})
 process.send({fixture:'host-entered'})
 await new Promise((resolve,reject)=>{pending={resolve,reject}})
 rows.push({phase:'host-created'})
 return {
  recoveries:new Map(),
  acquire:()=>{rows.push({effect:"admission-dispatch"});process.send({fixture:"admission-dispatched"});return null},
  settled:async()=>{process.send({fixture:'settled-entered'});await new Promise(resolve=>{settling=resolve});rows.push({phase:'settled-finished'})},
  interruptAll:async()=>{},close:async()=>{},
 }
}
