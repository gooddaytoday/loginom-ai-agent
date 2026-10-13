import {test,expect} from 'bun:test'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const text=await readFile(process.env.READINESS_HOST_BUNDLE??new URL('../src/supervisor.ts',import.meta.url),'utf8')
const begin=text.indexOf('function request(operation')
const end=text.indexOf('  const closing',begin)
if(begin<0||end<0)throw Error('Exact supervisor request body unavailable')
const body=new Bun.Transpiler({loader:'ts'}).transformSync(text.slice(begin,end))
for(const [operation,timeout] of [['start',120000],['start',250],['close',5000]] as const)test(`actual supervisor budget ${operation}/${timeout}; child/clock are doubles`,async()=>{
 const messages:any[]=[],pending=new Map(),FakeDate=class extends Date {static now(){return 100000}}
 const child={connected:true,send(message:any,callback:Function){messages.push(message);pending.get(message.id).resolve({fixture:true});callback()}}
 const request=vm.runInNewContext(body+';request',{startup:undefined,child,pending,Date:FakeDate,randomUUID:()=> 'id',Promise,Error,setTimeout:()=> 1,fail:()=>{throw Error('fixture transport failure')},fail7:()=>{throw Error('fixture transport failure')}})
 const input={fixture:true};await request(operation,input,timeout)
 expect(messages[0].input).toBe(input)
 expect(messages[0].operation).toBe(operation)
 if(operation==='start')expect(messages[0].deadline).toBe(100000+timeout)
 else expect('deadline' in messages[0]).toBe(false)
})
const managed=await readFile(process.env.READINESS_MANAGED??new URL('../../loginom-runtime/src/managed-entry.mjs',import.meta.url),'utf8')
const handler=managed.slice(managed.indexOf('async function handle(message)'))
test('actual start forwards original absolute deadline and cancellation to owner; auth is a double',async()=>{
 const begin=managed.indexOf('state.startupController??=new AbortController()')
 const end=managed.indexOf('      const config =',begin)
 const state:any={},deadline=Date.now()+120000
 const run=vm.runInNewContext('(async()=>{'+managed.slice(begin,end)+'})',{
  state,message:{deadline},input:{validation:true,generation:2,chat:'fixture',connection:{fixture:true}},
  observed:async(work:any)=>await work,directory:'/fixture',resources:{browserPath:'/fixture'},browserProfile:'/fixture',AbortController,
  checkConnection:async(login:any)=>{expect(login.owner.deadline).toBe(deadline);expect(login.owner.deadlineSource).toBe('supervisor.request.start');expect(login.owner.signal).toBe(state.startupController.signal);expect(login.owner.generation).toBe(2)},send:()=>{},
 })
 await run()
 expect(state.startupController).toBeUndefined()
})
for(const blocked of [false,true])test(`actual startup interrupt precedes persistence; blocked=${blocked}; writer/IPC are doubles`,async()=>{
 const messages:any[]=[],events:string[]=[],controller=new AbortController(),owner={fixture:true}
 const state={startupController:controller,startupOwner:owner}
 const handle=vm.runInNewContext(handler+';handle',{state,Error,Object,send:(m:any)=>messages.push(m),recordClose:async()=>{events.push('evidence');expect(controller.signal.aborted).toBe(true);if(blocked)throw 0}})
 await handle({id:'cancel',operation:'interrupt'})
 expect(controller.signal.aborted).toBe(true)
 expect(controller.signal.reason.message).toBe('LOGINOM_INITIAL_STARTUP_CANCELLED')
 expect(state.startupOwner).toBe(owner)
 expect(events).toEqual(['evidence'])
 if(blocked)expect(messages[0].error).toBe('LOGINOM_RUNTIME_FAILED')
 else expect(messages[0].result.interrupted).toBe(true)
})
