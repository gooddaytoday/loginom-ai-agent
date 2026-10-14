import {test,expect} from 'bun:test'
import {standaloneRunControl,standaloneCancellation,withStandaloneCancellation} from '../../src/cli/standalone-cancellation'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const source=await readFile(new URL('../../src/cli/standalone-cancellation.ts',import.meta.url),'utf8')
const compiled=await Bun.build({entrypoints:[new URL('../../src/cli/standalone-cancellation.ts',import.meta.url).pathname],target:'node'})
const text=await compiled.outputs[0]!.text()
function driver(code:string){let clock=1000,fire:()=>void=()=>{},cleared=false;const listeners=new Set<()=>void>()
 const c=vm.createContext({AbortController,Error,Object,Math,Date:{now:()=>clock},setTimeout(fn:()=>void,delay:number){fire=fn;expect(delay).toBe(7200_000);return 7},clearTimeout(id:number){expect(id).toBe(7);cleared=true},process:{on(_:string,fn:()=>void){listeners.add(fn)},off(_:string,fn:()=>void){listeners.delete(fn)}}})
 vm.runInContext(code.slice(0,code.lastIndexOf('export {'))+';globalThis.api={standaloneRunControl,standaloneCancellation,withStandaloneCancellation}',c)
 return{api:c.api,tick(){clock+=99},expire(){clock+=7200_000;fire()},cleared:()=>cleared,listeners}
}
test('actual compiled root producer owns same signal/absolute deadline before and through awaits',async()=>{
 const d=driver(text),a=d.api;let original:any
 await a.withStandaloneCancellation(async(signal:AbortSignal)=>{original=a.standaloneRunControl();expect(original.signal).toBe(signal);expect(a.standaloneCancellation()).toBe(signal);expect(original.deadline).toBe(7201000);expect(Object.isFrozen(original)).toBe(true)
  d.tick();await Promise.resolve();expect(a.standaloneRunControl()).toBe(original);expect(original.deadline).toBe(7201000);d.expire();expect(signal.aborted).toBe(true);expect(a.standaloneRunControl()).toBe(original)
 },true);expect(a.standaloneRunControl()).toBeUndefined();expect(d.cleared()).toBe(true);expect(d.listeners.size).toBe(0)
})
for(const value of [false,0,null,undefined,'',new Error('first',{cause:0})])test('compiled raw root rejection '+String(value)+' does not become cleanup success',async()=>{
 const d=driver(text);let failed=false,caught;try{await d.api.withStandaloneCancellation(async()=>{throw value},true)}catch(e){failed=true;caught=e}
 expect(failed).toBe(true);expect(Object.is(caught,value)).toBe(true);expect(d.api.standaloneRunControl()).toBeUndefined();expect(d.cleared()).toBe(true);expect(d.listeners.size).toBe(0)
})
test('concurrent original control cannot replace foreground root; non-run has no deadline',async()=>{
 await withStandaloneCancellation(async(signal)=>{const original=standaloneRunControl();expect(original?.signal).toBe(signal)
  await expect(withStandaloneCancellation(async()=>{},true)).rejects.toThrow('CLI_RUN_CONTROL_ACTIVE');expect(standaloneRunControl()).toBe(original)
 },true)
 await withStandaloneCancellation(async(signal)=>{expect(standaloneCancellation()).toBe(signal);expect(standaloneRunControl()).toBeUndefined()})
})
test('actual RunCommand abort listener invokes existing SDK abort once and removes only its own listener',async()=>{
 const run=await readFile(new URL('../../src/cli/cmd/run.ts',import.meta.url),'utf8')
 const start=run.indexOf('          const cancellation:'),end=run.indexOf('          async function finish()',start)
 const fragment=run.slice(start,end).replace('const cancellation: { pending?: Promise<void> }','const cancellation')
 const controller=new AbortController();let aborts=0
 const body=vm.runInNewContext('(async()=>{'+fragment+';return {interrupt,cancellation,originalRunSignal}})()',{
  standaloneRunControl:()=>({signal:controller.signal,deadline:1}),client:{session:{abort:async()=>{aborts++;return {}}}},sessionID:'owned',process:{env:{LOGINOM_AI_AGENT_CLI_ROOT:'fixture'},on(){}},Error
 })
 const x=await body;controller.abort(false);x.interrupt();await x.cancellation.pending;expect(aborts).toBe(1)
 x.originalRunSignal.removeEventListener('abort',x.interrupt)
 expect(run.includes('originalRunSignal?.removeEventListener("abort", interrupt)')).toBe(true)
})
