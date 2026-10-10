import {test,expect} from 'bun:test'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const {LoginomHost}=await import(process.env.ADAPTER_SOURCE??new URL('../../../loginom-host/src/adapter.ts',import.meta.url).href)
const source=await readFile(process.env.STANDALONE_SOURCE??new URL('../../src/cli/standalone-run.ts',import.meta.url),'utf8')
const start=source.indexOf('  } finally {',source.indexOf('    const final ='))
const body=source.slice(start+'  } finally {'.length,source.lastIndexOf('\n  }\n}'))
for(const value of [Error('original refusal'),null,undefined,false,0,''])test('real caller finally retains same adapter/rejection: '+String(value),async()=>{
 let listener:any;const page={original:true},events:string[]=[]
 LoginomHost.connect({on:(_,f)=>listener=f,start(){},postMessage(m:any){queueMicrotask(()=>listener({data:{id:m.id,result:m.method==='acquire'?{generation:1}:page}}))}})
 const owner=await LoginomHost.acquire('old')
 const finish=vm.runInNewContext('async function finish(){try{}finally{'+body+'}};finish',{host:{close:async()=>{events.push('close');throw value}},cleanup:{dispose:async()=>events.push('dispose'),detach:()=>events.push('detach')},LoginomHost,signal:undefined,process:{exitCode:undefined},failure:()=>events.push('failure')})
 let caught=false,rejected;try{await finish()}catch(e){caught=true;rejected=e}
 expect(caught).toBe(true);expect(Object.is(rejected,value)).toBe(true);expect(events).toEqual(['close']);expect(await owner!.tools()).toEqual(page)
 LoginomHost.disconnect()
})
test('real caller releases transport only after successful receipt',async()=>{
 const events:string[]=[],finish=vm.runInNewContext('async function finish(){try{}finally{'+body+'}};finish',{host:{close:async()=>events.push('receipt')},cleanup:{dispose:async()=>events.push('dispose'),detach:()=>events.push('detach')},LoginomHost:{disconnect:()=>events.push('disconnect')},signal:undefined,process:{exitCode:undefined},failure:()=>events.push('failure')})
 await finish();expect(events).toEqual(['receipt','dispose','detach','disconnect'])
})
