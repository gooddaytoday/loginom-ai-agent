import {test,expect,mock} from 'bun:test'
import * as cp from 'node:child_process'
import {join,resolve} from 'node:path'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
const actualFork=cp.fork
const repo=resolve(import.meta.dir,'../../..'),product=process.env.LOGINOM_ARTIFACT_PATH!
if(!product)throw Error('FULL_MANIFEST_PRODUCT_REQUIRED')
const base=process.env.STOCK_RESULTS_ROOT!,runtime=join(product,'resources/loginom/runtime')
if(!base)throw Error('EXPLICIT_RESULTS_REQUIRED')
let scenario='valid'
mock.module('node:child_process',()=>({...cp,fork:(entry:any,args:any,options:any)=>actualFork(entry,args,{...options,execArgv:[...(options.execArgv??[]),'--import',join(import.meta.dir,'fixtures/replacement-stock-host.mjs')],env:{...options.env,STOCK_SCENARIO:scenario,STOCK_RUNTIME_ROOT:runtime,STOCK_NATIVE_PRELOAD:join(import.meta.dir,'fixtures/replacement-stock-native.mjs'),STOCK_NATIVE_FIXTURE:join(import.meta.dir,'fixtures/replacement-capture/fixture.mjs')}})}))
const {launchReplacementReadOnlyCaller}=await import('../replacement-readonly-caller')
const {takeReplacementDiagnosticReply}=await import('../../../packages/loginom-host/src/node-client')
const {connectionStore}=await import('../../../packages/loginom-host/src/connection/connection-store')
const {cliCredentials}=await import('../../../packages/loginom-host/src/connection/cli-credentials')
const proof=JSON.parse(await readFile(join(import.meta.dir,'fixtures/replacement-capture/native-node-context.json'),'utf8')).binding
const observation=JSON.parse(await readFile(join(import.meta.dir,'fixtures/replacement-capture/mapping-observation.json'),'utf8')).output
const packagePath=observation.package_identity.path,account=packagePath.split('/')[1]
for(const name of ['valid','dto','native-error','undefined','null','false','zero','empty','missing','foreign','generation','hash','opening-sibling','outcome','duplicate','lost','native-error-late-client'])test('stock host/factory/caller '+name,async()=>{
 scenario=name==='native-error-late-client'?'native-error':name
 const directory=join(base,'profiles',name);await mkdir(directory,{recursive:true})
 const store=connectionStore(join(directory,'connection'),cliCredentials('linux'))
 await store.stage({generation:3,revision:1,url:'https://loginom.test',username:account,apiKey:'synthetic-only-73-test-key',password:'synthetic-only-73-password'});await store.activate(3)
 const owner:any={},signal=new AbortController().signal,run='stock-run',session='stock-session'
 let host:any,result:any,error:any,original:any
 try{
  await launchReplacementReadOnlyCaller({product,root:directory,packagePath,run,session,signal,deadline:Date.now()+60000},owner);if(owner.failed)throw owner.error;host=owner.host
  expect(await owner.acquire()).toEqual({generation:3})
  const call=(name:string,args:any,timeout?:number)=>owner.request('call',{run,name,args,userMessage:'offline stock fixture'},timeout)
  const request={operation_id:'stock-node',contract_revision:'1.0.0',document_id:proof.document_id,workflow_ref:{workflow_id:proof.workflow_ref.workflow_id},target:{kind:'existing',ref:proof.node,type:'transform.replace_columns'},inputs:[],mode:'exact',parameters:{},finish:'done'}
  await call('dock_prepare',{});await call('dock_node_apply',request)
  let wait:any
  try{wait=await call('dock_node_wait',{operation_id:'stock-node',timeout_ms:1000},name==='lost'?500:undefined)}catch(e){error=e}
  if(['missing','foreign','generation','hash','opening-sibling','outcome','lost'].includes(name)){
   expect(error).toBeDefined();expect(()=>owner.observeStockOriginal()).toThrow();expect(owner.stockOriginal).toBeUndefined();return
  }
  expect(error).toBeUndefined();expect(wait.isError).toBeUndefined();expect('replacementOriginal' in wait).toBe(false)
  if(name==='duplicate'){
   await expect(call('dock_node_wait',{operation_id:'stock-node',timeout_ms:1000})).rejects.toThrow();expect(()=>owner.observeStockOriginal()).toThrow();return
  }
  original=owner.observeStockOriginal();expect(original.correlation_only).toBe(true);expect(original.native_admission).toBe(false);expect(original.server_cancellation_verified).toBe(false);expect(original.outcome.result).toEqual(wait)
  expect(original.correlation.run).toBe(run);expect(original.correlation.generation).toBe(3);expect(original.correlation.native_opening_operation_id).not.toBe(original.correlation.outer_opening_operation_id);expect('signal' in original.correlation).toBe(false)
  if(name==='dto'){expect(()=>owner.pinOriginal(original.correlation)).toThrow('ORIGINAL_REQUIRED');expect(owner.gates.native_admission).toBe('not_verified');return}
  await call('dock_action_run',{action_key:'package.save_checkpoint',parameters:{path:packagePath,conflict_policy:'fail'},operation_id:'fixture-save'})
  // Existing owned closed capability supplies the diagnostic. Receiving the
  // sibling does not invoke read(), construct original signal or set admission.
  const channelResult=await owner.captureHandle(run);expect(Object.isFrozen(channelResult)).toBe(true)
  if(name==='native-error-late-client')owner.host={foreign:true}
  if(name==='native-error-late-client'){
   expect(()=>owner.observeStockCapture()).toThrow('OWNER_CHANGED');expect(owner.primaryFailure).toBe(channelResult.rejected);expect(owner.primaryFailure.cause).toEqual({kind:'value',value:0,is_undefined:false});expect(owner.secondaryFailures.some((e:any)=>e.message==='REPLACEMENT_CALLER_OWNER_CHANGED')).toBe(true)
  }else{
   result=owner.observeStockCapture();expect(result).toBe(channelResult);expect(result.cleanupComplete).toBe(false)
   if(name==='valid'){expect(result.diagnosticRead).toBe(true);expect(result.receipt.native_capture_admitted).toBe(false);expect(result.receipt.effect_possible).toBe(false)}
   else{expect(result.refused).toBe(true);if(name==='undefined')expect(Object.hasOwn(owner,'primaryFailure')).toBe(true);if(['null','false','zero','empty'].includes(name))expect(owner.primaryFailure).toBe(({null:null,false:false,zero:0,empty:''} as any)[name]);if(name==='native-error')expect(owner.primaryFailure.cause).toEqual({kind:'value',value:0,is_undefined:false})}
   expect(()=>owner.observeStockCapture()).toThrow('NO_RETRY')
  }
  await expect(owner.read()).rejects.toThrow();await expect(owner.close()).rejects.toThrow('NOT_VERIFIED');await expect(owner.request('release',{run})).rejects.toThrow()
 }finally{
  await writeFile(join(directory,'stock-test-result.json'),JSON.stringify({name,result,error:error?.message,correlation:original,native:false,FS_tap:false,server_cancellation_verified:false},null,2))
  if(host){await host.close().catch((e:any)=>console.log('FIXTURE_CLOSE_REFUSAL '+name+' '+e.message));await host.exited}
  console.log('STOCK_HOST_CALLER '+JSON.stringify({name,native:false,FS_tap:false,host:'actual compiled',factory_caller:'SOURCE',Page_auth_driver:'doubles'}))
 }
},30000)
test('structural host cannot supply a stock receipt',()=>expect(()=>takeReplacementDiagnosticReply({} as any,'stock-run','original')).toThrow('NO_RETRY'))
