import {test,expect} from 'bun:test'
import {withExecutionOrigin,currentExecutionOrigin,assertExecutionOrigin,adoptExecutionOrigin} from '../../src/cli/execution-origin.mjs'
import {retainRunCommandCreation,assertRunCommandCreation,retainPromptSender,associatePromptRequest,admitPromptInput,relayPromptInput,promptSDKContext,retainSDKInvocation,assertSDKInvocation} from '../../src/cli/private-admission.mjs'
test('one bound through await, continuation and SDK record',async()=>{
 let ended:any
 await withExecutionOrigin(new AbortController(),async signal=>{
  const origin=currentExecutionOrigin()!;ended=origin
  expect(origin.deadline-origin.born).toBe(7200_000_000_000n)
  const args={message:['fixture']},token=retainRunCommandCreation(args,signal)!
  await Promise.resolve();expect(retainRunCommandCreation(args,signal)).toBe(token)
  const deadline=assertRunCommandCreation(token,args,signal)
  await withExecutionOrigin(new AbortController(),async nested=>{
   expect(nested).toBe(signal);expect(currentExecutionOrigin()).toBe(origin)
   expect(assertRunCommandCreation(token,args,nested)).toBe(deadline)
  })
  const input={sessionID:'fixture',parts:[{type:'text',text:'fixture'}]}
  retainPromptSender(token,input,'prompt')
  const request=associatePromptRequest(token,new Request('http://fixture/session/fixture/message',{method:'POST',body:JSON.stringify(input)}))
  const context=promptSDKContext(relayPromptInput(admitPromptInput(request,{...input}),{}))!
  const sdkSignal=new AbortController().signal,options={toolCallId:'original',abortSignal:sdkSignal,experimental_context:context},payload={operation_id:'original'}
  const record=retainSDKInvocation(payload,options)!,facts=assertSDKInvocation(record,payload,options)
  expect(facts.origin).toBe(token);expect(facts.deadline).toBe(deadline)
  expect(facts.runCommandSignal).toBe(signal);expect(facts.sdkSignal).toBe(sdkSignal)
  expect(retainSDKInvocation(payload,options)).toBe(record)
  expect(()=>retainSDKInvocation(payload,{...options})).toThrow()
  expect(()=>assertExecutionOrigin({...origin})).toThrow('UNOWNED')
 })
 expect(()=>assertExecutionOrigin(ended)).toThrow('EXPIRED')
})
test('independent invocations retain isolated origins and reasons',async()=>{
 const a=new AbortController(),b=new AbortController(),ready=Promise.withResolvers<void>()
 const first=withExecutionOrigin(a,async signal=>{
  const origin=currentExecutionOrigin()!;retainRunCommandCreation({message:['a']},signal)
  ready.resolve();await Promise.resolve();a.abort(0)
  let error:unknown;try{assertExecutionOrigin(origin)}catch(e){error=e};expect(error).toBe(0)
  return origin
 })
 const second=withExecutionOrigin(b,async signal=>{
  await ready.promise;const origin=currentExecutionOrigin()!;retainRunCommandCreation({message:['b']},signal)
  expect(signal.aborted).toBe(false);assertExecutionOrigin(origin);return origin
 })
 const [x,y]=await Promise.all([first,second]);expect(x).not.toBe(y);expect(x.signal).not.toBe(y.signal)
})
test('accepted shorter original keeps exact nanoseconds, no extension',async()=>{
 await withExecutionOrigin(new AbortController(),async signal=>{
  const origin=currentExecutionOrigin()!,born=BigInt(Date.now()-1000)*1000000n,deadline=born+60_000_000_123n
  adoptExecutionOrigin(born,deadline);expect(origin.born).toBe(born);expect(origin.deadline).toBe(deadline)
  const args={message:['short']},token=retainRunCommandCreation(args,signal)!
  expect(assertRunCommandCreation(token,args,signal)).toBe(deadline)
  expect(()=>adoptExecutionOrigin(born,deadline+1n)).toThrow('CHANGED')
  expect(assertRunCommandCreation(token,args,signal)).toBe(deadline)
 })
})
for(const value of [0,false,null,'',undefined,new Error('abort',{cause:false})])test(`preabort preserves ${String(value)}`,async()=>{
 const c=new AbortController();c.abort(value);let calls=0,first:unknown
 try{await withExecutionOrigin(c,async()=>{calls++})}catch(e){first=e}
 expect(first).toBe(c.signal.reason);expect(calls).toBe(0)
})
test('expired original refuses before dispatch without rebirth',async()=>{
 let calls=0
 await withExecutionOrigin(new AbortController(),async()=>{
  const origin=currentExecutionOrigin()!,now=BigInt(Date.now())*1000000n
  expect(()=>adoptExecutionOrigin(now-1_000_000_000n,now-1n)).toThrow('EXPIRED')
  let first:unknown;try{assertExecutionOrigin(origin);calls++}catch(e){first=e};expect(calls).toBe(0)
  try{assertExecutionOrigin(origin)}catch(e){expect(e).toBe(first)}
 })
})
