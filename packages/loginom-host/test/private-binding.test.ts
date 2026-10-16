import {test,expect} from 'bun:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {launchNodeHost} from '../src/node-client'
test('actual private entry and client forward binding and reject invalid bindings',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'private-binding-'))
 const entry=join(dir,'entry.mjs'),node=process.env.LOGINOM_AI_AGENT_TEST_NODE!
 const built=await Bun.build({entrypoints:[resolve('src/node-entry.ts')],target:'node',format:'esm',plugins:[{name:'host-consumer-fixture',setup(b){b.onLoad({filter:/\/src\/host\.ts$/},()=>({loader:'ts',contents:`export async function createLoginomHost(options){return {api:{status:()=>({binding:options.acceptanceCleanupPackage??null})},settled:async()=>{},interruptAll:async()=>{},close:async()=>{},journal:{pending:()=>[]}}}`}))}}]})
 expect(built.success).toBe(true);await Bun.write(entry,built.outputs[0])
 try {
  for(const binding of [undefined,'/own/result.lgp']){
   const host=await launchNodeHost({node,entry,root:dir,resources:dir,headless:true,acceptanceCleanupPackage:binding})
   expect(await host.request('connection.status',{})).toEqual({binding:binding??null});await host.close()
  }
  for(const binding of ['', '/own/../result.lgp','relative.lgp',false,0,null]){
   await expect(launchNodeHost({node,entry,root:dir,resources:dir,headless:true,acceptanceCleanupPackage:binding as any})).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
  }
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('deferred prompt release retains exact run; confirmed release restores guard',async()=>{
 const {LoginomHost}=await import('../src/adapter')
 let listener:any;const messages:any[]=[],owner={deferRelease:true,leases:new Set<{release():Promise<void>}>()}
 LoginomHost.connect({on:(_,f)=>listener=f,start(){},postMessage(m:any){messages.push(m);queueMicrotask(()=>listener({data:{id:m.id,result:m.method==='acquire'?{generation:7}:{samePage:true}}}))}},owner)
 const lease=await LoginomHost.acquire('original')
 try {
  await lease!.release();expect(messages.some(m=>m.method==='release')).toBe(false)
  expect(await lease!.call('inspect',{},'original')).toEqual({samePage:true})
  expect(messages[0].input.run).toBe(messages.at(-1).input.run)
  const abort=new AbortController();abort.abort();await expect(lease!.call('inspect',{},'original',abort.signal)).rejects.toThrow('LOGINOM_RUN_ABORTED')
  owner.deferRelease=false;await lease!.release();expect(owner.leases.size).toBe(0)
  await expect(lease!.call('inspect',{},'original')).rejects.toThrow('LOGINOM_RUN_ABORTED')
 }finally{LoginomHost.disconnect()}
})
