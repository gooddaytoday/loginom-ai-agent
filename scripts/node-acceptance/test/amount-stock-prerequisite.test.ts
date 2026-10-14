// Applicability controls only. No stock Amount wiring/native authority PASS.
import {test,expect} from 'bun:test'
import {readFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import vm from 'node:vm'
const fpSource=process.env.FP_REFERENCE_SOURCE!,fpProduct=process.env.FP_REFERENCE_PRODUCT!,amountProduct=process.env.AMOUNT_PRODUCT!
const {retainFPStartup}=await import(join(fpSource,'packages/loginom-host/src/fp-startup-control.ts'))
const {validateStartInput:sourceValidator}=await import(join(fpSource,'packages/loginom-runtime/src/start-input.mjs'))
const {validateStartInput:actualValidator}=await import(join(fpProduct,'resources/loginom/runtime/src/start-input.mjs'))
function fixture(){const deadline=Date.now()+60000,authorization='a'.repeat(64),harness='field-parameters-preservation-v1';return {deadline,input:{protocol:1,generation:7,chat:'readiness',stateDir:'/fixture-state',connection:{username:'own'},fpStartup:{requestId:'original-request',authorization,harness,deadline}},capture:{revision:1,harness:'amount-import-type-v1',owner:'owner',run:'run',lease:'owner:run',generation:7,chat:'amount-chat',account:'own',admission:'admission',expires:deadline+10000,packagePath:'/own/fixed.lgp'}}}
test('source FP receiver refuses Amount purpose before binding/timer',()=>{
 const f=fixture();expect(()=>retainFPStartup({id:'original-request',deadline:f.deadline},{root:'/fixture',resources:'/fixture-resources',headless:true,acceptanceCapture:{authorization:'a'.repeat(64),packagePath:'/own/fixed.lgp',harness:'amount-import-type-v1'}})).toThrow('LOGINOM_PRE_READY_READ_EXPIRED')
})
test('literal INSTALLED FP receiver refuses Amount purpose before binding/timer',async()=>{
 const source=await readFile(join(fpProduct,'resources/loginom/host/node-host.mjs'),'utf8')
 // Extract the literal installed function, without substituting its guards.
 const {parse}=await import(process.env.ACORN_MODULE??join(fpSource,'packages/loginom-host/node_modules/acorn/dist/acorn.mjs'))
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'})
 const node=ast.body.find((n:any)=>n.type==='FunctionDeclaration'&&n.id.name==='retainFPStartup');expect(node).toBeDefined()
 let timers=0;const fn=vm.runInNewContext('('+source.slice(node.start,node.end)+')',{AbortController,Error,Date,Object,WeakSet,setTimeout:()=>{timers++;return 1},clearTimeout:()=>{}})
 expect(()=>fn({id:'original-request',deadline:Date.now()+60000},{root:'/fixture',resources:'/fixture-resources',headless:true,acceptanceCapture:{authorization:'a'.repeat(64),packagePath:'/own/fixed.lgp',harness:'amount-import-type-v1'}})).toThrow('LOGINOM_PRE_READY_READ_EXPIRED');expect(timers).toBe(0)
})
for(const [phase,validate]of [['SOURCE',sourceValidator],['INSTALLED',actualValidator]] as const){
 test(phase+' accepts own FP readiness shape, refuses using it for Amount capture',()=>{
  const f=fixture();expect(validate(f.input).fpStartup.harness).toBe('field-parameters-preservation-v1')
  expect(()=>validate({...f.input,chat:'amount-chat',acceptanceCapture:f.capture})).toThrow('LOGINOM_START_INVALID')
  expect(()=>validate({...f.input,fpStartup:{...f.input.fpStartup,harness:'amount-import-type-v1'}})).toThrow('LOGINOM_START_INVALID')
 })
 test(phase+' keeps legacy Amount binding but has no typed control carrier for it',()=>{
  const f=fixture(),{fpStartup,...ordinary}=f.input
  const out=validate({...ordinary,chat:'amount-chat',acceptanceCapture:f.capture})
  expect(out.acceptanceCapture).toBe(f.capture);expect(out.fpStartup).toBeUndefined()
  expect(()=>validate({...ordinary,chat:'amount-chat',acceptanceCapture:{...f.capture,deadline:f.deadline,requestId:'original-request'}})).toThrow('LOGINOM_START_INVALID')
 })
}
test('INSTALLED fixed FP export does not provide selected Amount factory',async()=>{
 const api=await import(join(fpProduct,'resources/loginom/host/fp-private-launcher.mjs'))
 expect(typeof api.launchFieldParametersDiagnostic).toBe('function');expect(api.launchAmountDiagnostic).toBeUndefined()
})
test('receiving exact inventory has no fixed Amount private factory/metadata entry',async()=>{
 const manifest=JSON.parse(await readFile(join(amountProduct,'cli-manifest.json'),'utf8'))
 expect(manifest.files.filter((f:any)=>/^resources\/loginom\/host\/amount-(private-launcher|launcher-build-inputs)/.test(f.path))).toEqual([])
 expect(manifest.files.some((f:any)=>f.path==='resources/loginom/host/node-host.mjs')).toBe(true)
 // Ordinary opaque compiled CLI is NOT inspected as a substitute private ABI.
 expect(resolve(amountProduct)).toBe(amountProduct)
})
