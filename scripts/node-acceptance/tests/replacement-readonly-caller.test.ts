import {test,expect,spyOn,beforeAll} from 'bun:test'
import * as factory from '../../../packages/loginom-host/src/node-client'
import {launchReplacementReadOnlyCaller} from '../replacement-readonly-caller'
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
let product:string;beforeAll(async()=>{product=await mkdtemp(join(tmpdir(),'replacement-caller-unit-'));await mkdir(join(product,'resources/loginom'),{recursive:true});await writeFile(join(product,'resources/loginom/resource-manifest.json'),JSON.stringify({files:[{path:'runtime/src/acceptance/replacement-input0-readonly-v1.mjs',sha256:'a'.repeat(64)}]}))})
const inputs=()=>({product,root:'/fixture/profile',packagePath:'/worker/new.lgp',run:'run',session:'chat',signal:new AbortController().signal,deadline:Date.now()+60000})
const original=()=>({request:{operation_id:'n',document_id:'d',workflow_ref:{workflow_id:'w'},target:{type:'transform.replace_columns',ref:{node_id:'n'}}},opening:{phase:'open',status:'verified',receipt_id:'n:open',value:{opening_operation_id:'native-open'}},sessionId:'session',signal:new AbortController().signal,deadline:Date.now()+50000})
const cases=[['Error',Error('primary',{cause:0})],['undefined',undefined],['null',null],['false',false],['zero',0],['empty','']] as const
for(const [name,raw] of cases)for(const stage of ['factory','capture'])test('private caller exact '+stage+' '+name,async()=>{
 let captures=0,launches=0,closes=0;const host={alive:true,exited:Promise.resolve({code:0,signal:null}),request:async()=>({generation:3}),capture:async()=>{captures++;throw raw},close:async()=>{closes++}}
 const spy=spyOn(factory,'launchReplacementDiagnostic').mockImplementation(async()=>{launches++;if(stage==='factory')throw raw;return host as any})
 try{const owner:any={};await launchReplacementReadOnlyCaller(inputs(),owner);if(stage==='capture'){await owner.acquire();owner.pinOriginal(original());let thrown=false,value;try{await owner.read()}catch(e){thrown=true;value=e}expect(thrown).toBe(true);expect(value).toBe(raw);expect(owner.host).toBe(host);expect(owner.request).toBe(host.request);expect(owner.captureHandle).toBe(host.capture);expect(owner.exited).toBe(host.exited);await expect(owner.read()).rejects.toThrow('NO_RETRY');expect(captures).toBe(1)}
 expect(owner.primaryFailure).toBe(raw);expect(owner.error).toBe(raw);if(raw instanceof Error)expect(owner.primaryFailure.cause).toBe(0);expect(closes).toBe(0);expect(launches).toBe(1)
 }finally{spy.mockRestore()}
})
for(const stage of ['pending','foreign','missing','cancelled','expired','drift','handle-replaced'])test('private caller '+stage+' before repeated capture',async()=>{
 let captures=0;const host={alive:true,exited:Promise.resolve({code:0}),request:async()=>({generation:3}),capture:async()=>{captures++;return {refused:true,rejected:Error('pending'),cleanupComplete:false}},close:async()=>{throw Error('NO_CLOSE')}}
 const spy=spyOn(factory,'launchReplacementDiagnostic').mockResolvedValue(host as any)
 try{const input=inputs(),owner:any={};await launchReplacementReadOnlyCaller(input,owner);await owner.acquire();const o=original();if(stage!=='missing')owner.pinOriginal(o)
 if(stage==='foreign')owner.host={};if(stage==='cancelled')(input.signal as any).throwIfAborted=()=>{throw false};if(stage==='expired')input.deadline=0;if(stage==='drift')o.opening.value.opening_operation_id='foreign';if(stage==='handle-replaced')host.capture=owner.captureHandle=async()=>{captures++;o.request.operation_id='changed';return {cleanupComplete:false}}
 if(stage==='pending'){const value=await owner.read();expect(owner.primaryFailure).toBe(value.rejected);expect(owner.gates.native_admission).toBe('not_verified');await expect(owner.close()).rejects.toThrow('NOT_VERIFIED')}else await expect(owner.read()).rejects.toThrow()
 expect(captures).toBe(stage==='pending'?1:0)
 }finally{spy.mockRestore()}
})
test('private caller forbids borrowed Page, arbitrary callbacks and populated owner',async()=>{for(const extra of [{page:{}},{factory:()=>{}},{admission:true}])await expect(launchReplacementReadOnlyCaller({...inputs(),...extra},{})).rejects.toThrow('INPUT');await expect(launchReplacementReadOnlyCaller(inputs(),{page:{}})).rejects.toThrow('INPUT')})
for(const change of ['request','opening-reference','owner','cancel','deadline'])test('private capture await boundary '+change,async()=>{
 const input=inputs(),originalValue=original(),owner:any={};let calls=0;const controller=new AbortController();originalValue.signal=controller.signal
 const host:any={alive:true,exited:Promise.resolve({code:0}),request:async()=>({generation:3}),capture:async()=>{calls++;await Promise.resolve();if(change==='request')originalValue.request.operation_id='changed';if(change==='opening-reference')originalValue.opening={...originalValue.opening};if(change==='owner')owner.host={};if(change==='cancel')controller.abort(false);if(change==='deadline')originalValue.deadline=0;return {cleanupComplete:false,refused:true,rejected:'wire'}}}
 const spy=spyOn(factory,'launchReplacementDiagnostic').mockResolvedValue(host)
 try{await launchReplacementReadOnlyCaller(input,owner);await owner.acquire();owner.pinOriginal(originalValue);let rejected=false,raw;try{await owner.read()}catch(e){rejected=true;raw=e}expect(rejected).toBe(true);if(change==='cancel')expect(raw).toBe(false);expect(owner.primaryFailure).toBe('wire');expect(owner.error).toBe('wire');expect(owner.secondaryFailures).toEqual([raw]);expect(calls).toBe(1);await expect(owner.read()).rejects.toThrow();expect(calls).toBe(1);expect(owner.exited).toBe(host.exited)}finally{spy.mockRestore()}
})

for(const [name,raw] of cases)test('capture refusal then late owner drift: primary '+name,async()=>{
 const owner:any={};let captures=0,closes=0;const foreign={};const host:any={alive:true,exited:Promise.resolve({code:0}),request:async()=>({generation:3}),capture:async()=>{captures++;const result={refused:true,rejectedIsUndefined:raw===undefined,...(raw===undefined?{}:{rejected:raw}),cleanupComplete:false};await Promise.resolve();owner.host=foreign;return result},close:async()=>{closes++}}
 const spy=spyOn(factory,'launchReplacementDiagnostic').mockResolvedValue(host)
 try{await launchReplacementReadOnlyCaller(inputs(),owner);await owner.acquire();owner.pinOriginal(original());let thrown:any;try{await owner.read()}catch(error){thrown=error}
 expect(thrown.message).toBe('REPLACEMENT_CALLER_OWNER_CHANGED');expect(Object.hasOwn(owner,'primaryFailure')).toBe(true);expect(owner.primaryFailure).toBe(raw);expect(owner.error).toBe(raw);if(raw instanceof Error)expect(owner.error.cause).toBe(0);expect(owner.secondaryFailures).toEqual([thrown]);expect(owner.host).toBe(foreign);expect(owner.request).toBe(host.request);expect(owner.captureHandle).toBe(host.capture);expect(owner.exited).toBe(host.exited);await expect(owner.read()).rejects.toThrow();await expect(owner.close()).rejects.toThrow('NOT_VERIFIED');expect(captures).toBe(1);expect(closes).toBe(0);expect(owner.primaryFailure).toBe(raw)
 }finally{spy.mockRestore()}
})
test('late binding still rejects success and malformed refusal without invented primary',async()=>{
 for(const result of [{diagnosticRead:true,cleanupComplete:false},{refused:true,cleanupComplete:false}]){
  const owner:any={};let captures=0;const host:any={alive:true,exited:Promise.resolve({code:0}),request:async()=>({generation:3}),capture:async()=>{captures++;owner.request=()=>{};return result}};const spy=spyOn(factory,'launchReplacementDiagnostic').mockResolvedValue(host)
  try{await launchReplacementReadOnlyCaller(inputs(),owner);await owner.acquire();owner.pinOriginal(original());let thrown:any;try{await owner.read()}catch(e){thrown=e};expect(thrown.message).toBe('REPLACEMENT_CALLER_OWNER_CHANGED');expect(owner.primaryFailure).toBe(thrown);expect(owner.secondaryFailures).toEqual([]);expect(owner.phase).not.toBe('diagnostic-only');expect(captures).toBe(1)}finally{spy.mockRestore()}
 }
})
