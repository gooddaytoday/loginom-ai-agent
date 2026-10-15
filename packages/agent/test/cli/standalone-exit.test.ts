import {test,expect} from 'bun:test'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const {LoginomHost}=await import(process.env.ADAPTER_SOURCE??new URL('../../../loginom-host/src/adapter.ts',import.meta.url).href)
const source=await readFile(process.env.ENTRY_SOURCE??new URL('../../src/standalone.ts',import.meta.url),'utf8')
const tail=source.slice(source.indexOf('\n  .',source.indexOf('\n})'))).replace('(error: unknown)','(error)').replaceAll('Promise<void>','Promise')
for(const original of [Error('LOGINOM_RECOVERY_REQUIRED'),null,undefined,false,0,''])test('product exit preserves refusal '+String(original),async()=>{
 let listener:any,exitCalls=0,seen:any,observed=false,closed=0
 const page={original:true,generation:1}
 LoginomHost.connect({on:(_,f)=>listener=f,start(){},postMessage(m:any){queueMicrotask(()=>listener({data:{id:m.id,result:m.method==='acquire'?{generation:1}:page}}))},close(){closed++}})
 const owner=await LoginomHost.acquire('original-client')
 class ObservedPromise extends Promise<any>{catch(fn:any){return super.catch((e)=>{observed=true;seen=e;return fn(e)})}}
 const stream={write(_s:any,done?:()=>void){done?.();return true}}
 const process={stdout:stream,stderr:stream,exitCode:undefined,exit(){exitCalls++}}
 await vm.runInNewContext('Promise.reject(original)'+tail,{Promise:ObservedPromise,original,process,Error})
 expect(observed).toBe(true);expect(Object.is(seen,original)).toBe(true);expect(exitCalls).toBe(0)
 expect(await owner!.tools()).toEqual(page);expect(closed).toBe(0)
 LoginomHost.disconnect()
})
test('resolved cleanup and startup without owner retain normal exit',async()=>{
 const events:string[]=[]
 const stream={write(_s:any,done?:()=>void){events.push('flush');done?.();return true}}
 await vm.runInNewContext('Promise.resolve()'+tail,{Promise,Error,process:{stdout:stream,stderr:stream,exitCode:0,exit(){events.push('exit')}}})
 expect(events).toEqual(['flush','flush','exit'])
})
