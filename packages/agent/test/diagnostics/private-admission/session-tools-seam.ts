import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {receivePrivateAdmission,retainRunCommandCreation,retainPromptSender,associatePromptRequest,relayPromptRequest,admitPromptInput,relayPromptInput,promptSDKContext,assertSDKContext,retainSDKInvocation,assertSDKInvocation} from '../../../src/cli/private-admission.mjs'
import {withStandaloneCancellation} from '../../../src/cli/standalone-cancellation'
import {mock} from 'bun:test'
// Labelled command-runtime service double exposes the unchanged Effect generator;
// no AppRuntime/project bootstrap or native/model dispatch is performed.
mock.module('../../../src/cli/effect-cmd',()=>({effectCmd:(opts:unknown)=>opts}))
const {RunCommand}=await import('../../../src/cli/cmd/run')
import {Effect,Layer} from 'effect'
import {SessionTools} from '../../../src/session/tools'
import {Plugin} from '../../../src/plugin'
import {Permission} from '../../../src/permission'
import {MCP} from '../../../src/mcp'
import {ToolRegistry} from '../../../src/tool/registry'
import {Truncate} from '../../../src/tool/truncate'
import {RuntimeFlags} from '../../../src/effect/runtime-flags'
const layer=Layer.mergeAll(
 Layer.succeed(Plugin.Service,Plugin.Service.of({init:()=>Effect.void,list:()=>Effect.succeed([]),trigger:(_name:any,_input:any,output:any)=>Effect.succeed(output)})),
 Layer.succeed(Permission.Service,Permission.Service.of({ask:()=>Effect.void,reply:()=>Effect.void,list:()=>Effect.succeed([])})),
 Layer.succeed(MCP.Service,MCP.Service.of({tools:()=>Effect.succeed({}),clients:()=>Effect.succeed({})} as any)),
 Layer.succeed(ToolRegistry.Service,ToolRegistry.Service.of({tools:()=>Effect.succeed([])} as any)),
 Layer.succeed(Truncate.Service,Truncate.Service.of({output:(text:string)=>Effect.succeed({content:text,truncated:false})} as any)),RuntimeFlags.layer())
let originalSDKRecord:object|undefined,ownerCalls=0,ownerArguments:unknown[]=[],sdkBefore:unknown,sdkAfter:unknown

import {HttpServerRequest} from 'effect/unstable/http'
import {createOpencodeClient} from '@loginom-ai-agent/sdk/v2'
import {streamText,tool,jsonSchema} from 'ai'
import {MockLanguageModelV3} from 'ai/test'
const out=process.argv[2]
await receivePrivateAdmission()
let callbackCount=0,modelDoubleCount=0,realRequestCount=0,scopeDeadline:bigint|undefined
let handlerRefusal:unknown
await withStandaloneCancellation(async runSignal=>{
 const runArgs={message:['harmless business fixture'],format:'json',command:undefined,model:undefined,agent:undefined}
 // Real RunCommand generator executes its original retention before first await.
 // Missing Effect service stops here; no model/native preparation is executed.
 try{await Effect.runPromise(RunCommand.handler!(runArgs as never) as never)}catch(e){handlerRefusal=e}
 assert(handlerRefusal)
 const root=retainRunCommandCreation(runArgs,runSignal);assert(root)
 const sessionID='ses_original_source_fixture',input={sessionID,parts:[{type:'text' as const,text:'harmless business fixture'}]}
 retainPromptSender(root,input,'prompt')
 const sdk=createOpencodeClient({baseUrl:'http://opencode.internal',fetch:Object.assign(async(raw:RequestInfo|URL,init?:RequestInit)=>{
  const original=associatePromptRequest(root,new Request(raw,init))
  const request=relayPromptRequest(original,new Request(original,{headers:new Headers(original.headers)}))
  const web=HttpServerRequest.fromWeb(request);assert.equal(web.source,request);realRequestCount++
  const payload=await request.json()
  // Source session service is a labelled no-model/no-native double; transport,
  // Web Request/Effect adapter and private association are actual implementations.
  const originalInput=admitPromptInput(web.source,{...payload,sessionID})
  const loop=relayPromptInput(originalInput,{sessionID})
  const context=promptSDKContext(loop);assert(context);assert.equal(assertSDKContext(context),context)
  const sdkAbort=new AbortController()
  const model=new MockLanguageModelV3({doStream:async()=>{
   modelDoubleCount++
   return{stream:new ReadableStream({start(c){c.enqueue({type:'tool-call',toolCallId:'original-tool',toolName:'loginom_dock_prepare',input:JSON.stringify({value:'original'})});c.enqueue({type:'finish',finishReason:{unified:'tool-calls',raw:'tool-calls'},usage:{inputTokens:{total:1,noCache:1,cacheRead:0,cacheWrite:0},outputTokens:{total:1,text:1,reasoning:0}}});c.close()}}),warnings:[]}
  }})
  const owner={generation:7,tools:async()=>({tools:[{name:'dock_prepare',inputSchema:{type:'object',properties:{value:{type:'string'}},required:['value']}}]}),admit:async()=>{},call:async(...args:unknown[])=>{ownerCalls++;ownerArguments=args;return {content:[{type:'text',text:'offline host boundary operand'}]}},release:async()=>{}}
  const sessionInput={loginom:owner,agent:{name:'build',mode:'primary',options:{},permission:[{permission:'*',pattern:'*',action:'allow'}]},model:{providerID:'test',api:{id:'test'}},session:{id:sessionID,permission:[]},processor:{message:{id:'msg_assistant'},updateToolCall:()=>Effect.void,completeToolCall:()=>Effect.void},bypassAgentCheck:false,messages:[{info:{id:'msg_user',role:'user'},parts:[]}],promptOps:{}}
  const tools=await Effect.runPromise(SessionTools.resolve(sessionInput as never).pipe(Effect.provide(layer)))
  const actual=tools.loginom_dock_prepare;assert(actual?.execute)
  const execute=actual.execute!
  const result=streamText({model,prompt:'labelled model fixture',experimental_context:context,abortSignal:sdkAbort.signal,tools:{...tools,loginom_dock_prepare:{...actual,execute:async(args:any,options:any)=>{
   callbackCount++;originalSDKRecord=retainSDKInvocation(args,options);assert(originalSDKRecord)
   const before=assertSDKInvocation(originalSDKRecord,args,options);scopeDeadline=before.deadline;sdkBefore=before
   assert.equal(before.runCommandSignal,runSignal);assert.equal(before.sdkSignal,options.abortSignal);assert.notEqual(before.sdkSignal,before.runCommandSignal)
   let refused:unknown
   try{await execute(args,options)}catch(error){refused=error}
   assert(refused instanceof Error);assert.equal((refused as Error).message,'ORIGINAL_SDK_ACQUIRED_CARRIER_UNAVAILABLE');assert.equal(ownerCalls,0)
   const value='qualified SDK sender refused before mint/dispatch; acquired binder unavailable'
   assert.equal(retainSDKInvocation(args,options),originalSDKRecord);sdkAfter=assertSDKInvocation(originalSDKRecord,args,options)
   return value
  }}}})
  for await(const chunk of result.fullStream){if(chunk.type==='error')throw chunk.error}
  return Response.json({info:{id:'fixture'},parts:[]})
 },{preconnect:fetch.preconnect})})
 const response=await sdk.session.prompt(input);assert(!response.error)
 assert.equal(callbackCount,1);assert.equal(realRequestCount,1);assert.equal(modelDoubleCount,1);assert.equal(typeof scopeDeadline,'bigint');assert.equal(ownerCalls,0);assert.equal(ownerArguments.length,0)
})
await writeFile(out,JSON.stringify({lastSupportedSeam:'Production SessionTools reaches genuine original SDK assertion then refuses missing acquired owner binder before mint/dispatch',originalRecordRetained:true,originalDeadline:scopeDeadline!.toString(),ownerCalls,ownerArgumentCount:ownerArguments.length,privateBinderPacket:false,qualifiedAcquiredOwner:false,positive:false,real:['ed7 live producer/child/reader','RunCommand pre-await generator retention','SDK client request','Effect Web Request adapter','private same-process association','AI SDK stream/tool callback original options and signal'],doubles:['business validator argv','command runtime services','session service','language model output','harmless tool result'],handlerRefusal:String(handlerRefusal).slice(0,180),callbackCount,realRequestCount,externalModel:0,native:0,SDKScope:true,authority:[false,false,false,false],deadline:scopeDeadline!.toString()},null,2))
await new Promise(r=>setTimeout(r,80))
