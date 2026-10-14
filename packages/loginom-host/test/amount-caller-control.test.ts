import {test,expect} from 'bun:test'
import {retainAmountCaller,assertAmountCaller,runAmountCaller,settleAmountCaller} from '../src/amount-caller-control'
let sequence=0
function fixture() { const c=new AbortController();return {c,input:{signal:c.signal,deadline:Date.now()+60000,operation:'operation',request:'request-'+(++sequence),owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'account'}} }
test('actual original object retained before await, single dispatch and cleanup/evidence settlement',async()=>{
 const {input}=fixture(),grant=retainAmountCaller(input);let calls=0
 const result=await runAmountCaller(grant,input,async original=>{calls++;expect(original.signal).toBe(input.signal);expect(original.deadline).toBe(input.deadline);await Promise.resolve();return 7})
 expect(result).toBe(7);expect(retainAmountCaller(input)).toBe(grant)
 await expect(runAmountCaller(grant,input,async()=>{calls++;return 0})).rejects.toThrow()
 expect(()=>settleAmountCaller(grant,true,false)).toThrow();expect(assertAmountCaller(grant,input).signal).toBe(input.signal)
 settleAmountCaller(grant,true,true);expect(()=>retainAmountCaller(input)).toThrow();expect(calls).toBe(1)
})
for(const key of ['signal','deadline','owner','run','lease','generation','chat','account','operation','request'] as const)test('original '+key+' drift after await refuses without replay',async()=>{
 const {input}=fixture(),grant=retainAmountCaller(input);let calls=0
 await expect(runAmountCaller(grant,input,async()=>{calls++;(input as any)[key]=key==='signal'?new AbortController().signal:key==='generation'?2:key==='deadline'?Date.now()+70000:'changed';return 1})).rejects.toThrow()
 await expect(runAmountCaller(grant,input,async()=>{calls++;return 1})).rejects.toThrow();expect(calls).toBe(1)
})
for(const value of [undefined,null,false,0,'',new Error('primary',{cause:0})])test('first failure retained with presence '+String(value),async()=>{
 const {input}=fixture(),grant=retainAmountCaller(input);let present=false,caught:unknown,calls=0
 try {await runAmountCaller(grant,input,async()=>{calls++;throw value})}catch(e){present=true;caught=e}
 expect(present).toBe(true);expect(caught).toBe(value)
 await expect(runAmountCaller(grant,input,async()=>{calls++;return 1})).rejects.toThrow();expect(calls).toBe(1)
})
test('pending original dispatch holds owner; settlement cannot dispatch again',async()=>{
 const {input}=fixture(),grant=retainAmountCaller(input);let resolve!:(v:number)=>void,calls=0
 const pending=runAmountCaller(grant,input,async()=>{calls++;return new Promise<number>(r=>{resolve=r})})
 await expect(runAmountCaller(grant,input,async()=>{calls++;return 1})).rejects.toThrow()
 expect(()=>settleAmountCaller(grant,true,true)).toThrow()
 expect(assertAmountCaller(grant,input).signal).toBe(input.signal);resolve(1);expect(await pending).toBe(1);expect(calls).toBe(1)
 settleAmountCaller(grant,true,true)
})
test('missing/expired/foreign grant and preabort refuse before dispatch',async()=>{
 const {input,c}=fixture();expect(()=>retainAmountCaller({...input,deadline:0})).toThrow()
 const grant=retainAmountCaller(input);expect(()=>assertAmountCaller(grant,{...input})).toThrow();expect(()=>assertAmountCaller({},input)).toThrow()
 c.abort(0);let seen:unknown=1;try{assertAmountCaller(grant,input)}catch(e){seen=e}expect(seen).toBe(0)
})
