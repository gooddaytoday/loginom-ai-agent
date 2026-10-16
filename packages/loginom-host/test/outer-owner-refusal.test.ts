import {test,expect} from 'bun:test'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const base=process.env.OUTER_OWNER_SOURCE_ROOT??new URL('../src/',import.meta.url)
const {loginomHostPort}=await import(new URL('host-port.ts',base).href)
const source=await readFile(new URL('node-entry.ts',base),'utf8')
for(const refusal of ['refusal','persistence','throw'])test('node-entry retains original admission/IPC: '+refusal,async()=>{
 const events:string[]=[],page={},runtime={page},failure=Error(refusal),state:any={host:{interruptAll:async()=>{},close:async()=>{throw failure}},port:{close:async()=>events.push('port-close')}}
 const process:any={connected:true,send:(v:any,cb:any)=>{events.push(v.error??'reply');cb()},disconnect:()=>{process.connected=false;events.push('disconnect')},on:()=>{}}
 const stop=source.slice(source.indexOf('function stop() {'),source.indexOf('function reply('))
 const reply=source.slice(source.indexOf('function reply(')).replace('value: unknown','value').replace('value as object','value')
 const a=vm.runInNewContext(stop+reply+';({stop,reply})',{state,operations:new Set(),events:{emit:(s:string)=>events.push(s)},process,Promise,Error})
 const first=a.stop();expect(a.stop()).toBe(first);await expect(first).rejects.toThrow('LOGINOM_HOST_CLEANUP_FAILED')
 a.reply({error:'LOGINOM_HOST_CLEANUP_FAILED'})
 expect(state.closed).not.toBe(true);expect(process.connected).toBe(true);expect(events).toEqual(['LOGINOM_HOST_CLEANUP_FAILED']);expect(runtime.page).toBe(page)
 state.host.close=async()=>events.push('receipt');await a.stop()
 expect(events).toEqual(['LOGINOM_HOST_CLEANUP_FAILED','receipt','port-close','close']);expect(state.closed).toBe(true)
})
test('SIGTERM disconnect is success-only',()=>{
 const signal=source.slice(source.indexOf('process.on("SIGTERM"'),source.indexOf('async function dispatch'))
 expect(signal).toContain('.then(() =>');expect(signal).not.toContain('.finally(')
})
test('generation removal follows confirmed child close',async()=>{
 const s=await readFile(new URL('host.ts',base),'utf8')
 const begin=s.indexOf('async close() {',s.indexOf('async prepare(connection)'))
 const chunk=s.slice(begin,s.indexOf('\n          },',begin)).replace('async close() {','async function close() {')+'\n}'
 const owner={},generations=new Map([[1,owner]]),generation={children:new Map([['own',Promise.resolve({close:async()=>{throw Error('refused')}})]])},connection={generation:1}
 const close=vm.runInNewContext(chunk+';close',{generations,generation,connection,Promise,Error})
 await expect(close()).rejects.toThrow('LOGINOM_RUNTIME_CLEANUP_FAILED');expect(generations.get(1)).toBe(owner)
 generation.children.set('own',Promise.resolve({close:async()=>{}}));await close();expect(generations.has(1)).toBe(false)
})
test('actual port refuses pending shutdown without releasing old run; same client resumes',async()=>{
 const listeners=new Map(),replies:any[]=[],page={},runtime={page},pending:string[]=[];let released=0,inspect=0
 const service:any={recoveries:new Map(),journal:{pending:()=>pending,settle:async()=>{},admit:async()=>({id:'op'})},acquire:()=>({generation:1,release:()=>released++}),retireRuntime:async()=>{},resetRestarts:()=>{},runtime:async()=>({request:async()=>{inspect++;return runtime.page}})}
 const port=loginomHostPort({on:(n,f)=>listeners.set(n,f),postMessage:v=>replies.push(v),start:()=>{}},service)
 const send=async(data:any)=>{listeners.get('message')({data});await Bun.sleep(5);return replies.at(-1)}
 await send({id:'acquire',method:'acquire',input:{run:'own',session:'own'}})
 pending.push('op');await expect(port.close()).rejects.toThrow('LOGINOM_RECOVERY_REQUIRED');expect(released).toBe(0)
 pending.length=0
 // Same original run still has admission; tools uses its original runtime.
 await send({id:'inspect',method:'tools',input:{run:'own'}})
 expect(inspect).toBe(1);expect(runtime.page).toBe(page);expect(replies.at(-1).error).toBeUndefined()
 await port.close();expect(released).toBe(1)
})
