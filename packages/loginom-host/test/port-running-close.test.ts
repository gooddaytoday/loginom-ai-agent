import {test,expect} from 'bun:test'
const {loginomHostPort}=await import(process.env.PORT_SOURCE??new URL('../src/host-port.ts',import.meta.url).href)
for(const kind of ['running','pending'])test('real port refuses '+kind+' before release; same client retains original generation',async()=>{
 const listeners=new Map(),replies:any[]=[],pending:string[]=[],page={originalPage:true};let active=kind==='running',released=0,abandoned=0,calls=0
 const service:any={recoveries:new Map(),journal:{pending:()=>pending,begin:async()=> 'original-op',settle:async(_:string,known:boolean)=>{if(!known)abandoned++}},acquire:()=>({generation:1,release:()=>released++,holdRecovery(){},reconciled(){}}),retireRuntime:async()=>{},resetRestarts(){},runtime:async(g:number)=>{expect(g).toBe(1);return {request:async(name:string)=>{calls++;return name==='call'?{result:page,activeWork:active,recoveryPending:active}:{tools:[page]}}}}}
 const port=loginomHostPort({on:(n,f)=>listeners.set(n,f),postMessage:v=>replies.push(v),start(){}},service)
 const send=async(data:any)=>{listeners.get('message')({data});await Bun.sleep(5);return replies.at(-1)}
 await send({id:'acquire',method:'acquire',input:{run:'own',session:'own'}})
 if(active)await send({id:'start',method:'call',input:{run:'own',name:'dock_operation_inspect',args:{},userMessage:'original'}})
 else pending.push('original-op')
 const capture=(p:Promise<void>)=>p.then(()=>({error:undefined}),error=>({error}))
 const outcomes=await Promise.all([capture(port.close()),capture(port.close())]);for(const v of outcomes)expect(v.error?.message).toBe('LOGINOM_RECOVERY_REQUIRED');expect(released).toBe(0);expect(abandoned).toBe(0)
 if(active){const read=await send({id:'inspect',method:'tools',input:{run:'own'}});expect(read.result.tools).toEqual([page]);expect(released).toBe(0);active=false;await send({id:'settled',method:'call',input:{run:'own',name:'dock_operation_inspect',args:{},userMessage:'original'}})}else pending.length=0
 await port.close();await port.close();expect(released).toBe(1);expect(abandoned).toBe(0)
})
