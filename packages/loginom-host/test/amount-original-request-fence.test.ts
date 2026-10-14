import {test,expect} from 'bun:test'
const api=await import(process.env.REVIEW_AMOUNT_PARENT??'../src/amount-caller-control')
let sequence=0
function input() {return {signal:new AbortController().signal,deadline:Date.now()+60000,operation:'fence-operation',request:'fence-request-'+(++sequence),owner:'owner',run:'run',lease:'owner:run',generation:1,chat:'chat',account:'account'}}
test('copied carrier refuses before first dispatch, original stays usable',async()=>{
 const original=input(),grant=api.retainAmountCaller(original)
 expect(()=>api.retainAmountCaller({...original})).toThrow()
 expect(await api.runAmountCaller(grant,original,async captured=>{expect(captured.signal).toBe(original.signal);expect(captured.deadline).toBe(original.deadline);return 1})).toBe(1)
})
test('settlement never removes original operation/request fence',async()=>{
 const original=input(),grant=api.retainAmountCaller(original);let calls=0
 await api.runAmountCaller(grant,original,async()=>{calls++;return 1});api.settleAmountCaller(grant,true,true)
 expect(()=>api.retainAmountCaller({...original})).toThrow();expect(()=>api.retainAmountCaller(original)).toThrow();expect(calls).toBe(1)
})
for(const key of ['signal','deadline','owner','run','lease','generation','chat','account'])test('same original request cannot remint by replacing '+key,()=>{
 const original=input();api.retainAmountCaller(original)
 const carrier={...original,[key]:key==='signal'?new AbortController().signal:key==='deadline'?original.deadline+1:key==='generation'?2:'replacement'}
 if(key==='owner')carrier.lease=carrier.owner+':'+carrier.run
 if(key==='run')carrier.lease=carrier.owner+':'+carrier.run
 expect(()=>api.retainAmountCaller(carrier)).toThrow()
})
test('same operation allows distinct original requests with the same signal/deadline',async()=>{
 const first=input(),second={...first,request:first.request+'-independent'};let calls=0
 const a=api.retainAmountCaller(first),b=api.retainAmountCaller(second)
 const result=await Promise.all([api.runAmountCaller(a,first,async()=>{calls++;return 1}),api.runAmountCaller(b,second,async()=>{calls++;return 2})])
 expect(result).toEqual([1,2]);expect(calls).toBe(2)
})
for(const value of [undefined,null,false,0,'',new Error('lost',{cause:0})])test('unknown first value survives carrier refusal: '+String(value),async()=>{
 const original=input(),grant=api.retainAmountCaller(original);let calls=0,present=false,caught
 try{await api.runAmountCaller(grant,original,async()=>{calls++;throw value})}catch(e){present=true;caught=e}
 expect(()=>api.retainAmountCaller({...original})).toThrow();expect(present).toBe(true);expect(caught).toBe(value);expect(calls).toBe(1)
})
