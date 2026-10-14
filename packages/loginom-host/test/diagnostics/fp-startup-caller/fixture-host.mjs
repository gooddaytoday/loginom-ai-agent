// Host/native/connection startup dependency double. No qualification authority.
import {createHash} from 'node:crypto'
let resolveHost
process.on('message',m=>{
 if(m.method==='fixture.resolve')resolveHost?.()
 if(m.method==='fixture.finish')process.send({fixture:'finished'},()=>process.exit(0))
})
export async function fixtureCreateHost(input){
 process.send({fixture:'host-entered',root:input.root,grant:{harness:input.acceptanceCapture?.harness,bytes:input.acceptanceCapture?.authorization.length,sha256:createHash('sha256').update(input.acceptanceCapture?.authorization??'').digest('hex')},forwarded_control:!!input.fpStartupControl})
 await new Promise(resolve=>{resolveHost=resolve})
 return {settled:async()=>{},recoveries:new Map(),acquire:()=>null,interruptAll:async()=>{},close:async()=>{}}
}
