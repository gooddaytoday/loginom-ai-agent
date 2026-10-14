import {test,expect} from 'bun:test'
import {retainAmountStartup,retainFPStartup} from '../src/fp-startup-control'

function fixture() {
  const deadline=Date.now()+60000, authorization='a'.repeat(64)
  const message={id:'outer_original',deadline}
  const input={root:'/own',resources:'/fixed',headless:true,
    acceptanceCapture:{authorization,packagePath:'/account/input.lgp',harness:'amount-import-type-v1'},
    amountStartup:{purpose:'amount-import-type-v1' as const,authorization,operation:'operation_original',request:'caller_original',deadline}}
  return {message,input}
}
test('closed Amount fields; proxy is distinct and no acquired tuple is minted',()=>{
  const {message,input}=fixture(),start=retainAmountStartup(message,input)
  try {
    expect(start.tuple).toEqual({requestId:message.id,authorization:input.amountStartup.authorization,harness:'amount-import-type-v1',operation:'operation_original',request:'caller_original',deadline:message.deadline})
    expect(start.pending).toBe(true)
    for(const key of ['root','run','lease','generation','chat','account'])expect(key in start.tuple).toBe(false)
    expect(start.control.signal instanceof AbortSignal).toBe(true)
  }finally{start.settle(false)}
})
for(const key of ['operation','request','authorization','deadline','purpose'] as const)test(`foreign ${key} refuses`,()=>{
  const {message,input}=fixture();(input.amountStartup as Record<string,unknown>)[key]=key==='deadline'?message.deadline+1:'foreign!'
  expect(()=>retainAmountStartup(message,input)).toThrow('LOGINOM_HANDSHAKE_INVALID')
})
test('Amount cannot relabel the strict FP wrapper',()=>{
  const {message,input}=fixture();expect(()=>retainFPStartup(message,input)).toThrow('LOGINOM_PRE_READY_READ_EXPIRED')
})
test('expired original absolute deadline refuses without a retained timer',()=>{
  const {message,input}=fixture();input.amountStartup.deadline=message.deadline=Date.now()-1
  expect(()=>retainAmountStartup(message,input)).toThrow('LOGINOM_PRE_READY_READ_EXPIRED')
})
for(const value of [false,0,undefined])test(`equal boxed ${String(value)} remains secondary; carrier propagation adds no event`,()=>{
  const {message,input}=fixture(),start=retainAmountStartup(message,input)
  try {
    const cancel={phase:'startup',...start.tuple,rejection:{kind:'value',value:value??null,is_undefined:value===undefined}}
    expect(start.cancel({...cancel,operation:'foreign'})).toBe(false)
    expect(start.pending).toBe(true);expect(start.cancel(cancel)).toBe(true)
    expect(start.control.signal.aborted).toBe(true)
    if(value===undefined)expect(start.control.signal.reason instanceof DOMException).toBe(true)
    else expect(start.control.signal.reason).toBe(value)
    expect(start.propagate(value)).toBe(value);expect(start.secondary).toBeUndefined()
    expect(start.reject(value)).toBe(value);expect(start.secondary).toEqual({value})
    const carrier=start.forward(value);expect(start.reject(carrier)).toBe(value)
    expect(start.secondary).toEqual({value});expect(start.pending).toBe(true)
    input.amountStartup.operation='drift'
    let thrown=false;try{start.guard()}catch(error){thrown=true;expect(error).toBe(value)}expect(thrown).toBe(true)
  }finally{start.settle(false)}
  expect(start.pending).toBe(false);expect(start.accepted).toBe(false)
})
test('replaced startup object and changed scalar are refused',()=>{
  const {message,input}=fixture(),start=retainAmountStartup(message,input)
  try {input.amountStartup={...input.amountStartup};expect(()=>start.guard()).toThrow('LOGINOM_HANDSHAKE_INVALID')}
  finally{start.settle(false)}
})
for(const key of ['operation','request','deadline'] as const)test(`original ${key} drift is refused before admission`,()=>{
 const {message,input}=fixture(),start=retainAmountStartup(message,input)
 try{(input.amountStartup as Record<string,unknown>)[key]=key==='deadline'?message.deadline+1:'changed';expect(()=>start.guard()).toThrow('LOGINOM_HANDSHAKE_INVALID')}
 finally{start.settle(false)}
})
test('raw Error cause and control receipts preserve first failure',()=>{
 const {message,input}=fixture(),start=retainAmountStartup(message,input),primary=new Error('primary',{cause:0}),secondary=new Error('owned',{cause:false})
 try{expect(start.propagate(primary)).toBe(primary);expect(start.receive(primary,'control')).toBe(primary);expect(start.secondary).toBeUndefined();expect(start.receive(secondary,'await')).toBe(primary);expect(start.secondary?.value).toBe(secondary)}
 finally{start.settle(false)}
})
